import { createHash, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type {
  ChangeTicketPriorityCommand,
  CreateTicketCommand,
  CreateTicketResult,
  ReprocessTicketCommand,
  TicketCommandRepository,
  UpdateTicketStatusCommand,
} from "../../application/tickets/contracts.js";
import {
  IdempotencyKeyReusedError,
  TicketNotFoundError,
  TicketReprocessNotAllowedError,
  TicketVersionConflictError,
} from "../../application/tickets/errors.js";
import {
  changeTicketPriority,
  transitionTicketStatus,
  type Clock,
  type Ticket,
  type TicketPriorityChange,
  type TicketStatusTransition,
} from "../../domain/ticket.js";
import {
  idempotencyKeys,
  outboxMessages,
  ticketHistories,
  tickets,
} from "./schema.js";
import type { Database } from "./database.js";
import { toDomainTicket } from "./ticket-mapper.js";

/** PostgreSQL/Drizzle implementation of the ticket persistence ports. */
export class PostgresTicketCommandRepository
  implements TicketCommandRepository
{
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async createTicketWithProcessingIntent(
    command: CreateTicketCommand,
  ): Promise<CreateTicketResult> {
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

  async reprocessTicket(command: ReprocessTicketCommand): Promise<Ticket> {
    return this.db.transaction(async (transaction) => {
      const records = await transaction
        .select()
        .from(tickets)
        .where(eq(tickets.id, command.ticketId))
        .limit(1);
      const current = records[0];

      if (current === undefined) {
        throw new TicketNotFoundError();
      }

      if (current.version !== command.expectedVersion) {
        throw new TicketVersionConflictError();
      }

      if (
        current.processingStatus !== "failed" &&
        current.processingStatus !== "pending"
      ) {
        throw new TicketReprocessNotAllowedError();
      }

      const now = this.clock.now();
      const nextVersion = current.version + 1;
      const updated = await transaction
        .update(tickets)
        .set({
          processingStatus: "pending",
          slaDueAt: null,
          version: nextVersion,
          updatedAt: now,
        })
        .where(
          and(
            eq(tickets.id, command.ticketId),
            eq(tickets.version, command.expectedVersion),
          ),
        )
        .returning();

      const ticket = updated[0];

      if (ticket === undefined) {
        throw new TicketVersionConflictError();
      }

      await transaction.insert(outboxMessages).values({
        id: randomUUID(),
        ticketId: command.ticketId,
        processingVersion: nextVersion,
        type: "ticket_sla",
        payload: { ticketId: command.ticketId, processingVersion: nextVersion },
        status: "pending",
        attempts: 0,
        lockedUntil: null,
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      return toDomainTicket(ticket);
    });
  }
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
