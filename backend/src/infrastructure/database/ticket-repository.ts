import { createHash, randomUUID } from "node:crypto";

import type { CreateTicketRequest } from "@inbot/shared";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { Clock, Ticket } from "../../domain/ticket.js";
import {
  idempotencyKeys,
  outboxMessages,
  ticketHistories,
  tickets,
} from "./schema.js";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

export interface CreateTicketWithProcessingIntentCommand {
  ticketId: string;
  idempotencyKey: string;
  ticket: CreateTicketRequest;
}

export type CreateTicketWithProcessingIntentResult =
  | { kind: "created"; ticket: Ticket }
  | { kind: "replayed"; ticket: Ticket };

export class IdempotencyKeyReusedError extends Error {
  constructor() {
    super("idempotency.key_reused");
    this.name = "IdempotencyKeyReusedError";
  }
}

export class TicketRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async createTicketWithProcessingIntent(
    command: CreateTicketWithProcessingIntentCommand,
  ): Promise<CreateTicketWithProcessingIntentResult> {
    const requestHash = hashCanonicalJson(command.ticket);

    return this.db.transaction(async (transaction) => {
      const existing = await transaction
        .select({ requestHash: idempotencyKeys.requestHash, ticket: tickets })
        .from(idempotencyKeys)
        .innerJoin(tickets, eq(tickets.id, idempotencyKeys.ticketId))
        .where(eq(idempotencyKeys.key, command.idempotencyKey))
        .limit(1);

      const existingTicket = existing[0];

      if (existingTicket !== undefined) {
        if (existingTicket.requestHash !== requestHash) {
          throw new IdempotencyKeyReusedError();
        }

        return {
          kind: "replayed",
          ticket: toDomainTicket(existingTicket.ticket),
        };
      }

      const now = this.clock.now();
      const persistedTicket = {
        id: command.ticketId,
        title: command.ticket.title,
        description: command.ticket.description,
        requesterEmail: command.ticket.requesterEmail,
        priority: command.ticket.priority,
        status: "open" as const,
        processingStatus: "pending" as const,
        slaDueAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };

      await transaction.insert(tickets).values(persistedTicket);
      await transaction.insert(idempotencyKeys).values({
        key: command.idempotencyKey,
        requestHash,
        ticketId: command.ticketId,
        createdAt: now,
      });
      await transaction.insert(ticketHistories).values({
        id: randomUUID(),
        ticketId: command.ticketId,
        type: "created",
        previousValue: null,
        nextValue: "open",
        source: "operator",
        createdAt: now,
      });
      await transaction.insert(outboxMessages).values({
        id: randomUUID(),
        ticketId: command.ticketId,
        processingVersion: 1,
        type: "ticket_sla",
        payload: { ticketId: command.ticketId, processingVersion: 1 },
        status: "pending",
        attempts: 0,
        lockedUntil: null,
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      return { kind: "created", ticket: toDomainTicket(persistedTicket) };
    });
  }
}

function toDomainTicket(record: typeof tickets.$inferSelect): Ticket {
  return {
    ...record,
    version: record.version,
  };
}

function hashCanonicalJson(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}
