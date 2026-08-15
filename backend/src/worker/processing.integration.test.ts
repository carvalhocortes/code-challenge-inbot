import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Queue } from "bullmq";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { Redis } from "ioredis";
import pg from "pg";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { calculateSlaDueAt } from "../domain/sla.js";
import {
  type Database,
  TicketRepository,
} from "../infrastructure/database/ticket-repository.js";
import {
  idempotencyKeys,
  outboxMessages,
  ticketHistories,
  tickets,
} from "../infrastructure/database/schema.js";
import { OutboxDispatcher } from "../infrastructure/outbox/dispatcher.js";
import { FakeHolidayProvider } from "../infrastructure/holidays/holiday-provider.js";
import { createTicketSlaQueue } from "../infrastructure/queue/ticket-sla-queue.js";
import {
  createTicketSlaWorker,
  TicketSlaProcessor,
} from "./ticket-sla-worker.js";

describe("Outbox Dispatcher and SLA Worker", () => {
  let postgresContainer: StartedPostgreSqlContainer | undefined;
  let redisContainer: StartedTestContainer | undefined;
  let pool: pg.Pool | undefined;
  let redis: Redis | undefined;
  let db: Database;
  let ticketsRepository: TicketRepository;
  let queue: Queue;
  const now = new Date("2026-08-17T13:00:00.000Z");

  beforeAll(async () => {
    postgresContainer = await new PostgreSqlContainer(
      "postgres:16.8-bookworm",
    ).start();
    redisContainer = await new GenericContainer("redis:7.4.2-bookworm")
      .withExposedPorts(6379)
      .start();
    pool = new pg.Pool({
      connectionString: postgresContainer.getConnectionUri(),
    });
    db = drizzle(pool, {
      schema: { idempotencyKeys, outboxMessages, ticketHistories, tickets },
    });
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL("../../drizzle", import.meta.url),
      ),
    });
    redis = new Redis({
      host: redisContainer.getHost(),
      port: redisContainer.getMappedPort(6379),
      maxRetriesPerRequest: null,
    });
    queue = createTicketSlaQueue(redis);
    ticketsRepository = new TicketRepository(db, { now: () => now });
  });

  afterEach(async () => {
    await redis?.flushdb();
    await pool?.query(
      "TRUNCATE outbox_messages, idempotency_keys, ticket_history, tickets CASCADE",
    );
  });

  afterAll(async () => {
    await queue?.close();
    await redis?.quit();
    await pool?.end();
    await redisContainer?.stop();
    await postgresContainer?.stop();
  });

  it("publishes a persisted creation and the Worker completes its SLA processing", async () => {
    const ticketId = await createPendingTicket("process-success");
    const processor = new TicketSlaProcessor(
      db,
      new FakeHolidayProvider({ mode: "success" }),
    );
    const worker = createTicketSlaWorker(redis as Redis, processor);
    const completed = new Promise<void>((resolve, reject) => {
      worker.once("completed", () => resolve());
      worker.once("failed", (_job, error) => reject(error));
    });
    const dispatcher = new OutboxDispatcher(
      db,
      queue,
      { now: () => now },
      {
        batchSize: 10,
        leaseMs: 30_000,
      },
    );

    await dispatcher.dispatchOnce();
    await completed;

    const detail = await ticketsRepository.getTicketDetail(ticketId);
    expect(detail.ticket).toMatchObject({
      processingStatus: "processed",
      slaDueAt: calculateSlaDueAt({
        createdAt: now,
        priority: "high",
        holidays: new Set(),
      }),
    });
    await expect(
      db
        .select({ status: outboxMessages.status })
        .from(outboxMessages)
        .where(eq(outboxMessages.ticketId, ticketId)),
    ).resolves.toEqual([{ status: "published" }]);
    await worker.close();
  });

  it("recovers a publication that was not confirmed and ignores a replay of its completed job", async () => {
    const ticketId = await createPendingTicket("recover-and-replay");
    const payload = { ticketId, processingVersion: 1 };
    const jobId = `ticket-${ticketId}-processing-1`;
    const processor = new TicketSlaProcessor(
      db,
      new FakeHolidayProvider({ mode: "success" }),
    );
    const dispatcher = new OutboxDispatcher(
      db,
      queue,
      { now: () => now },
      {
        batchSize: 10,
        leaseMs: 30_000,
      },
    );

    // Redis accepted this job before the process could confirm the leased Outbox record.
    await db
      .update(outboxMessages)
      .set({
        status: "processing",
        attempts: 1,
        lockedUntil: new Date(now.getTime() - 1),
        updatedAt: now,
      })
      .where(eq(outboxMessages.ticketId, ticketId));
    await queue.add("calculate-sla", payload, { jobId });
    await dispatcher.dispatchOnce();
    await processor.process(payload);
    const processed = await ticketsRepository.getTicketDetail(ticketId);

    await processor.process(payload);

    const replayed = await ticketsRepository.getTicketDetail(ticketId);
    expect(replayed.ticket).toEqual(processed.ticket);
    await expect(
      db
        .select({ status: outboxMessages.status })
        .from(outboxMessages)
        .where(eq(outboxMessages.ticketId, ticketId)),
    ).resolves.toEqual([{ status: "published" }]);
    await expect(
      queue.getJobCounts("waiting", "active", "completed"),
    ).resolves.toMatchObject({ waiting: 1, active: 0 });
  });

  it("retries a transient holiday-provider failure and completes the Ticket once", async () => {
    const ticketId = await createPendingTicket("retry-transient");
    const holidays = new FakeHolidayProvider({
      modes: ["500", "success"],
    });
    const retryQueue = createTicketSlaQueue(redis as Redis, {
      attempts: 2,
      backoffMs: 1,
    });
    const processor = new TicketSlaProcessor(db, holidays);
    const worker = createTicketSlaWorker(redis as Redis, processor);
    const completed = new Promise<void>((resolve) => {
      worker.once("completed", () => resolve());
    });
    const dispatcher = new OutboxDispatcher(
      db,
      retryQueue,
      { now: () => now },
      { batchSize: 10, leaseMs: 30_000 },
    );

    await dispatcher.dispatchOnce();
    await completed;

    expect(holidays.calls).toBe(2);
    await expect(
      ticketsRepository.getTicketDetail(ticketId),
    ).resolves.toMatchObject({
      ticket: { processingStatus: "processed" },
    });
    await worker.close();
    await retryQueue.close();
  });

  it("marks a Ticket as failed after a definitive holiday-provider error", async () => {
    const ticketId = await createPendingTicket("fail-definitive");
    const queueWithRetries = createTicketSlaQueue(redis as Redis, {
      attempts: 3,
      backoffMs: 1,
    });
    const processor = new TicketSlaProcessor(
      db,
      new FakeHolidayProvider({ mode: "400" }),
    );
    const worker = createTicketSlaWorker(redis as Redis, processor);
    const dispatcher = new OutboxDispatcher(
      db,
      queueWithRetries,
      { now: () => now },
      { batchSize: 10, leaseMs: 30_000 },
    );

    await dispatcher.dispatchOnce();
    await expect
      .poll(
        async () =>
          (await ticketsRepository.getTicketDetail(ticketId)).ticket
            .processingStatus,
        { timeout: 2_000 },
      )
      .toBe("failed");

    await expect(
      ticketsRepository.getTicketDetail(ticketId),
    ).resolves.toMatchObject({
      ticket: { processingStatus: "failed", slaDueAt: null },
    });
    const reprocessed = await ticketsRepository.reprocessTicket({
      ticketId,
      expectedVersion: 1,
    });
    expect(reprocessed.processingStatus).toBe("pending");
    await worker.close();
    await queueWithRetries.close();
  });

  it("marks a Ticket as failed after exhausting transient retries", async () => {
    const ticketId = await createPendingTicket("fail-transient");
    const holidays = new FakeHolidayProvider({ mode: "500" });
    const queueWithRetries = createTicketSlaQueue(redis as Redis, {
      attempts: 2,
      backoffMs: 1,
    });
    const worker = createTicketSlaWorker(
      redis as Redis,
      new TicketSlaProcessor(db, holidays),
    );
    const dispatcher = new OutboxDispatcher(
      db,
      queueWithRetries,
      { now: () => now },
      { batchSize: 10, leaseMs: 30_000 },
    );

    await dispatcher.dispatchOnce();
    await expect
      .poll(
        async () =>
          (await ticketsRepository.getTicketDetail(ticketId)).ticket
            .processingStatus,
        { timeout: 2_000 },
      )
      .toBe("failed");

    expect(holidays.calls).toBe(2);
    await expect(
      ticketsRepository.getTicketDetail(ticketId),
    ).resolves.toMatchObject({
      ticket: { processingStatus: "failed", slaDueAt: null },
    });
    await worker.close();
    await queueWithRetries.close();
  });

  async function createPendingTicket(idempotencyKey: string): Promise<string> {
    const ticketId = randomUUID();
    await ticketsRepository.createTicketWithProcessingIntent({
      ticketId,
      idempotencyKey,
      ticket: {
        title: "Acesso ao sistema indisponível",
        description:
          "O operador não consegue acessar o sistema desde as 09:00.",
        requesterEmail: "operador@example.com",
        priority: "high",
      },
    });

    return ticketId;
  }
});
