import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

import {
  IdempotencyKeyReusedError,
  TicketRepository,
  type Database,
} from "./ticket-repository.js";
import {
  idempotencyKeys,
  outboxMessages,
  ticketHistories,
  tickets,
} from "./schema.js";

describe("TicketRepository.createTicketWithProcessingIntent", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let pool: pg.Pool | undefined;
  let repository: TicketRepository;
  let db: Database;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16.8-bookworm").start();
    pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool, {
      schema: { idempotencyKeys, outboxMessages, ticketHistories, tickets },
    });
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL("../../../drizzle", import.meta.url),
      ),
    });
    repository = new TicketRepository(db, {
      now: () => new Date("2026-08-17T13:00:00.000Z"),
    });
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("persists Ticket, idempotency key, history and outbox intent atomically", async () => {
    const result = await repository.createTicketWithProcessingIntent({
      ticketId: randomUUID(),
      idempotencyKey: "create-001",
      ticket: {
        title: "Acesso ao sistema indisponível",
        description:
          "O operador não consegue acessar o sistema desde as 09:00.",
        requesterEmail: "operador@example.com",
        priority: "high",
      },
    });

    expect(result).toMatchObject({
      kind: "created",
      ticket: {
        status: "open",
        processingStatus: "pending",
        slaDueAt: null,
        version: 1,
      },
    });
    await expect(db.select().from(tickets)).resolves.toHaveLength(1);
    await expect(db.select().from(idempotencyKeys)).resolves.toHaveLength(1);
    await expect(db.select().from(ticketHistories)).resolves.toHaveLength(1);
    await expect(db.select().from(outboxMessages)).resolves.toHaveLength(1);
  });

  it("replays the original Ticket without duplicating persistence records", async () => {
    const command = {
      ticketId: randomUUID(),
      idempotencyKey: "create-replay-001",
      ticket: {
        title: "Acesso ao sistema indisponível",
        description:
          "O operador não consegue acessar o sistema desde as 09:00.",
        requesterEmail: "operador@example.com",
        priority: "high" as const,
      },
    };
    const first = await repository.createTicketWithProcessingIntent(command);
    const replay = await repository.createTicketWithProcessingIntent({
      ...command,
      ticketId: randomUUID(),
    });

    expect(first.kind).toBe("created");
    expect(replay).toMatchObject({
      kind: "replayed",
      ticket: { id: command.ticketId },
    });
    await expect(db.select().from(tickets)).resolves.toHaveLength(2);
    await expect(db.select().from(idempotencyKeys)).resolves.toHaveLength(2);
    await expect(db.select().from(ticketHistories)).resolves.toHaveLength(2);
    await expect(db.select().from(outboxMessages)).resolves.toHaveLength(2);
  });

  it("rejects reuse of an idempotency key with different content", async () => {
    const command = {
      ticketId: randomUUID(),
      idempotencyKey: "create-conflict-001",
      ticket: {
        title: "Acesso ao sistema indisponível",
        description:
          "O operador não consegue acessar o sistema desde as 09:00.",
        requesterEmail: "operador@example.com",
        priority: "high" as const,
      },
    };
    await repository.createTicketWithProcessingIntent(command);

    await expect(
      repository.createTicketWithProcessingIntent({
        ...command,
        ticketId: randomUUID(),
        ticket: { ...command.ticket, priority: "critical" },
      }),
    ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
    await expect(db.select().from(tickets)).resolves.toHaveLength(3);
    await expect(db.select().from(idempotencyKeys)).resolves.toHaveLength(3);
    await expect(db.select().from(ticketHistories)).resolves.toHaveLength(3);
    await expect(db.select().from(outboxMessages)).resolves.toHaveLength(3);
  });
});
