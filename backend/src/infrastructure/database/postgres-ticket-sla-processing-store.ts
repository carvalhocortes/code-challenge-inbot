import { and, eq, or } from "drizzle-orm";

import type { TicketSlaProcessingStore } from "../../application/tickets/sla-processing.js";
import type { Database } from "./database.js";
import { tickets } from "./schema.js";

/** Persists SLA-processing state in PostgreSQL without leaking Drizzle upward. */
export class PostgresTicketSlaProcessingStore
  implements TicketSlaProcessingStore
{
  constructor(private readonly db: Database) {}

  async claim(ticketId: string, processingVersion: number, now: Date) {
    const claimed = await this.db
      .update(tickets)
      .set({ processingStatus: "processing", updatedAt: now })
      .where(
        and(
          eq(tickets.id, ticketId),
          eq(tickets.version, processingVersion),
          or(
            eq(tickets.processingStatus, "pending"),
            eq(tickets.processingStatus, "processing"),
          ),
        ),
      )
      .returning({ createdAt: tickets.createdAt, priority: tickets.priority });

    return claimed[0];
  }

  async complete(
    ticketId: string,
    processingVersion: number,
    slaDueAt: Date,
    now: Date,
  ): Promise<boolean> {
    const updated = await this.db
      .update(tickets)
      .set({ processingStatus: "processed", slaDueAt, updatedAt: now })
      .where(
        and(
          eq(tickets.id, ticketId),
          eq(tickets.version, processingVersion),
          eq(tickets.processingStatus, "processing"),
        ),
      )
      .returning({ id: tickets.id });

    return updated.length === 1;
  }

  async markFailed(
    ticketId: string,
    processingVersion: number,
    now: Date,
  ): Promise<void> {
    await this.db
      .update(tickets)
      .set({ processingStatus: "failed", updatedAt: now })
      .where(
        and(
          eq(tickets.id, ticketId),
          eq(tickets.version, processingVersion),
          eq(tickets.processingStatus, "processing"),
        ),
      );
  }
}
