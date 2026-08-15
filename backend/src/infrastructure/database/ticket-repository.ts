import { createHash, randomUUID } from "node:crypto";

import type { CreateTicketRequest, ListTicketsQuery } from "@inbot/shared";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  changeTicketPriority,
  transitionTicketStatus,
  type Clock,
  type Ticket,
  type TicketPriority,
  type TicketPriorityChange,
  type TicketStatus,
  type TicketStatusTransition,
} from "../../domain/ticket.js";
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

export interface UpdateTicketStatusCommand {
  ticketId: string;
  expectedVersion: number;
  status: TicketStatus;
}

export interface ChangeTicketPriorityCommand {
  ticketId: string;
  expectedVersion: number;
  priority: TicketPriority;
}

export interface TicketList {
  items: Ticket[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export class IdempotencyKeyReusedError extends Error {
  constructor() {
    super("idempotency.key_reused");
    this.name = "IdempotencyKeyReusedError";
  }
}

export class TicketNotFoundError extends Error {
  constructor() {
    super("ticket.not_found");
    this.name = "TicketNotFoundError";
  }
}

export class TicketVersionConflictError extends Error {
  constructor() {
    super("ticket.version_conflict");
    this.name = "TicketVersionConflictError";
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

  async updateTicketStatus(
    command: UpdateTicketStatusCommand,
  ): Promise<TicketStatusTransition> {
    return this.db.transaction(async (transaction) => {
      const persistedTicket = await transaction
        .select()
        .from(tickets)
        .where(eq(tickets.id, command.ticketId))
        .limit(1);
      const current = persistedTicket[0];

      if (current === undefined) {
        throw new TicketNotFoundError();
      }

      if (current.version !== command.expectedVersion) {
        throw new TicketVersionConflictError();
      }

      const transition = transitionTicketStatus(
        toDomainTicket(current),
        command.status,
        this.clock,
      );

      if (transition.kind === "noop") {
        return transition;
      }

      const updatedTickets = await transaction
        .update(tickets)
        .set({
          status: transition.ticket.status,
          version: transition.ticket.version,
          updatedAt: transition.ticket.updatedAt,
        })
        .where(
          and(
            eq(tickets.id, command.ticketId),
            eq(tickets.version, command.expectedVersion),
          ),
        )
        .returning();

      if (updatedTickets.length !== 1) {
        throw new TicketVersionConflictError();
      }

      await transaction.insert(ticketHistories).values({
        id: randomUUID(),
        ticketId: command.ticketId,
        type: "status_changed",
        previousValue: transition.previousStatus,
        nextValue: transition.ticket.status,
        source: "operator",
        createdAt: transition.ticket.updatedAt,
      });

      return transition;
    });
  }

  async changeTicketPriority(
    command: ChangeTicketPriorityCommand,
  ): Promise<TicketPriorityChange> {
    return this.db.transaction(async (transaction) => {
      const persistedTicket = await transaction
        .select()
        .from(tickets)
        .where(eq(tickets.id, command.ticketId))
        .limit(1);
      const current = persistedTicket[0];

      if (current === undefined) {
        throw new TicketNotFoundError();
      }

      if (current.version !== command.expectedVersion) {
        throw new TicketVersionConflictError();
      }

      const change = changeTicketPriority(
        toDomainTicket(current),
        command.priority,
        this.clock,
      );

      if (change.kind === "noop") {
        return change;
      }

      const updatedTickets = await transaction
        .update(tickets)
        .set({
          priority: change.ticket.priority,
          processingStatus: change.ticket.processingStatus,
          version: change.ticket.version,
          updatedAt: change.ticket.updatedAt,
        })
        .where(
          and(
            eq(tickets.id, command.ticketId),
            eq(tickets.version, command.expectedVersion),
          ),
        )
        .returning();

      if (updatedTickets.length !== 1) {
        throw new TicketVersionConflictError();
      }

      await transaction.insert(ticketHistories).values({
        id: randomUUID(),
        ticketId: command.ticketId,
        type: "priority_changed",
        previousValue: change.previousPriority,
        nextValue: change.ticket.priority,
        source: "operator",
        createdAt: change.ticket.updatedAt,
      });
      await transaction.insert(outboxMessages).values({
        id: randomUUID(),
        ticketId: command.ticketId,
        processingVersion: change.ticket.version,
        type: "ticket_sla",
        payload: {
          ticketId: command.ticketId,
          processingVersion: change.ticket.version,
        },
        status: "pending",
        attempts: 0,
        lockedUntil: null,
        publishedAt: null,
        createdAt: change.ticket.updatedAt,
        updatedAt: change.ticket.updatedAt,
      });

      return change;
    });
  }

  async listTickets(query: ListTicketsQuery): Promise<TicketList> {
    const conditions: SQL[] = [];

    if (query.status !== undefined) {
      conditions.push(eq(tickets.status, query.status));
    }

    if (query.priority !== undefined) {
      conditions.push(eq(tickets.priority, query.priority));
    }

    if (query.q !== undefined) {
      const pattern = `%${query.q}%`;
      const textFilter = or(
        ilike(tickets.title, pattern),
        ilike(tickets.description, pattern),
      );

      if (textFilter !== undefined) {
        conditions.push(textFilter);
      }
    }

    const where = conditions.length === 0 ? undefined : and(...conditions);
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(tickets)
        .where(where)
        .orderBy(desc(tickets.createdAt), desc(tickets.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ total: count() }).from(tickets).where(where),
    ]);
    const total = totals[0]?.total ?? 0;

    return {
      items: rows.map(toDomainTicket),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
      },
    };
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
