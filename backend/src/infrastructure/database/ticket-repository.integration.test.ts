import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

import {
  IdempotencyKeyReusedError,
  TicketRepository,
  TicketReprocessNotAllowedError,
  TicketVersionConflictError,
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
  let currentTime = new Date("2026-08-17T13:00:00.000Z");

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
      now: () => currentTime,
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
  describe("TicketRepository.updateTicketStatus", () => {
    it("updates the Status de atendimento with a version check and records history", async () => {
      const ticketId = randomUUID();
      await repository.createTicketWithProcessingIntent({
        ticketId,
        idempotencyKey: "status-001",
        ticket: {
          title: "Acesso ao sistema indisponível",
          description:
            "O operador não consegue acessar o sistema desde as 09:00.",
          requesterEmail: "operador@example.com",
          priority: "high",
        },
      });

      const result = await repository.updateTicketStatus({
        ticketId,
        expectedVersion: 1,
        status: "in_progress",
      });

      expect(result).toMatchObject({
        kind: "changed",
        ticket: { id: ticketId, status: "in_progress", version: 2 },
      });
      await expect(
        db
          .select()
          .from(ticketHistories)
          .where(eq(ticketHistories.ticketId, ticketId)),
      ).resolves.toMatchObject([
        { type: "created" },
        {
          type: "status_changed",
          previousValue: "open",
          nextValue: "in_progress",
        },
      ]);
    });
  });

  describe("TicketRepository.changeTicketPriority", () => {
    it("updates Priority, records history and creates a new processing intent", async () => {
      const ticketId = randomUUID();
      await repository.createTicketWithProcessingIntent({
        ticketId,
        idempotencyKey: "priority-001",
        ticket: {
          title: "Acesso ao sistema indisponível",
          description:
            "O operador não consegue acessar o sistema desde as 09:00.",
          requesterEmail: "operador@example.com",
          priority: "high",
        },
      });

      const result = await repository.changeTicketPriority({
        ticketId,
        expectedVersion: 1,
        priority: "critical",
      });

      expect(result).toMatchObject({
        kind: "changed",
        ticket: {
          id: ticketId,
          priority: "critical",
          processingStatus: "pending",
          version: 2,
        },
      });
      await expect(
        db
          .select()
          .from(ticketHistories)
          .where(eq(ticketHistories.ticketId, ticketId)),
      ).resolves.toMatchObject([
        { type: "created" },
        {
          type: "priority_changed",
          previousValue: "high",
          nextValue: "critical",
        },
      ]);
      await expect(
        db
          .select()
          .from(outboxMessages)
          .where(eq(outboxMessages.ticketId, ticketId)),
      ).resolves.toHaveLength(2);
    });
  });

  describe("TicketRepository.reprocessTicket", () => {
    it("creates a fresh pending processing intent for a failed Ticket", async () => {
      const ticketId = randomUUID();
      await repository.createTicketWithProcessingIntent({
        ticketId,
        idempotencyKey: "reprocess-001",
        ticket: {
          title: "Acesso ao sistema indisponível",
          description:
            "O operador não consegue acessar o sistema desde as 09:00.",
          requesterEmail: "operador@example.com",
          priority: "high",
        },
      });
      await db
        .update(tickets)
        .set({ processingStatus: "failed", version: 2, updatedAt: currentTime })
        .where(eq(tickets.id, ticketId));
      currentTime = new Date("2026-08-17T13:01:00.000Z");

      const result = await repository.reprocessTicket({
        ticketId,
        expectedVersion: 2,
      });

      expect(result).toMatchObject({
        id: ticketId,
        processingStatus: "pending",
        slaDueAt: null,
        version: 3,
        updatedAt: currentTime,
      });
      await expect(
        db
          .select({ processingVersion: outboxMessages.processingVersion })
          .from(outboxMessages)
          .where(eq(outboxMessages.ticketId, ticketId))
          .orderBy(asc(outboxMessages.processingVersion)),
      ).resolves.toEqual([{ processingVersion: 1 }, { processingVersion: 3 }]);
    });

    it("does not enqueue processing for a completed Ticket", async () => {
      const ticketId = randomUUID();
      await repository.createTicketWithProcessingIntent({
        ticketId,
        idempotencyKey: "reprocess-completed-001",
        ticket: {
          title: "Acesso ao sistema indisponível",
          description:
            "O operador não consegue acessar o sistema desde as 09:00.",
          requesterEmail: "operador@example.com",
          priority: "high",
        },
      });
      await db
        .update(tickets)
        .set({
          processingStatus: "completed",
          version: 2,
          updatedAt: currentTime,
        })
        .where(eq(tickets.id, ticketId));

      await expect(
        repository.reprocessTicket({ ticketId, expectedVersion: 2 }),
      ).rejects.toBeInstanceOf(TicketReprocessNotAllowedError);
      await expect(
        db
          .select()
          .from(outboxMessages)
          .where(eq(outboxMessages.ticketId, ticketId)),
      ).resolves.toHaveLength(1);
    });
  });

  describe("transactional persistence invariants", () => {
    it("does not create history when an update uses a stale version", async () => {
      const ticketId = randomUUID();
      await repository.createTicketWithProcessingIntent({
        ticketId,
        idempotencyKey: "stale-version-001",
        ticket: {
          title: "Acesso ao sistema indisponível",
          description:
            "O operador não consegue acessar o sistema desde as 09:00.",
          requesterEmail: "operador@example.com",
          priority: "high",
        },
      });
      await repository.updateTicketStatus({
        ticketId,
        expectedVersion: 1,
        status: "in_progress",
      });

      await expect(
        repository.updateTicketStatus({
          ticketId,
          expectedVersion: 1,
          status: "resolved",
        }),
      ).rejects.toBeInstanceOf(TicketVersionConflictError);
      await expect(
        db
          .select()
          .from(ticketHistories)
          .where(eq(ticketHistories.ticketId, ticketId)),
      ).resolves.toHaveLength(2);
    });

    it("rejects direct mutation of Ticket history", async () => {
      const ticketId = randomUUID();
      await repository.createTicketWithProcessingIntent({
        ticketId,
        idempotencyKey: "immutable-history-001",
        ticket: {
          title: "Acesso ao sistema indisponível",
          description:
            "O operador não consegue acessar o sistema desde as 09:00.",
          requesterEmail: "operador@example.com",
          priority: "high",
        },
      });
      const history = await db
        .select()
        .from(ticketHistories)
        .where(eq(ticketHistories.ticketId, ticketId));

      if (pool === undefined || history[0] === undefined) {
        throw new Error("The integration fixture was not initialized.");
      }

      await expect(
        pool.query("UPDATE ticket_history SET next_value = $1 WHERE id = $2", [
          "tampered",
          history[0].id,
        ]),
      ).rejects.toThrow("ticket_history is immutable");
    });
  });

  describe("TicketRepository.listTickets", () => {
    it("filters by text and returns stable createdAt-desc pagination", async () => {
      currentTime = new Date("2026-08-17T13:00:00.000Z");
      await repository.createTicketWithProcessingIntent({
        ticketId: randomUUID(),
        idempotencyKey: "list-001",
        ticket: {
          title: "Paginação de Tickets A",
          description: "O primeiro Ticket usado para validar a paginação.",
          requesterEmail: "operador@example.com",
          priority: "low",
        },
      });
      currentTime = new Date("2026-08-18T13:00:00.000Z");
      await repository.createTicketWithProcessingIntent({
        ticketId: randomUUID(),
        idempotencyKey: "list-002",
        ticket: {
          title: "Paginação de Tickets B",
          description: "O segundo Ticket usado para validar a paginação.",
          requesterEmail: "operador@example.com",
          priority: "low",
        },
      });

      const page = await repository.listTickets({
        page: 1,
        pageSize: 1,
        q: "Paginação de Tickets",
      });

      expect(page).toMatchObject({
        items: [{ title: "Paginação de Tickets B" }],
        meta: { page: 1, pageSize: 1, total: 2, totalPages: 2 },
      });

      const filtered = await repository.listTickets({
        page: 1,
        pageSize: 10,
        status: "open",
        priority: "low",
      });

      expect(filtered.items.map((ticket) => ticket.title)).toEqual([
        "Paginação de Tickets B",
        "Paginação de Tickets A",
      ]);
    });
  });
});
