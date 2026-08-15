import type { TicketSlaJob } from "@inbot/shared";
import { sql } from "drizzle-orm";

import type { Clock } from "../../domain/ticket.js";
import type { Database } from "../database/database.js";
import {
  ticketSlaJobName,
  ticketSlaJobOptions,
  type TicketSlaQueue,
} from "../queue/ticket-sla-queue.js";

export interface OutboxDispatcherOptions {
  batchSize: number;
  leaseMs: number;
}

interface ClaimedOutboxMessage {
  [key: string]: unknown;
  id: string;
  payload: TicketSlaJob;
  lockedUntil: Date;
}

export class OutboxDispatcher {
  constructor(
    private readonly db: Database,
    private readonly queue: TicketSlaQueue,
    private readonly clock: Clock,
    private readonly options: OutboxDispatcherOptions,
  ) {}

  async dispatchOnce(): Promise<number> {
    const messages = await this.claimBatch();

    for (const message of messages) {
      try {
        await this.queue.add(
          ticketSlaJobName,
          message.payload,
          ticketSlaJobOptions(message.payload),
        );
        await this.markPublished(message);
      } catch (error) {
        await this.release(message);
        throw error;
      }
    }

    return messages.length;
  }

  private async claimBatch(): Promise<ClaimedOutboxMessage[]> {
    const now = this.clock.now();
    const lockedUntil = new Date(now.getTime() + this.options.leaseMs);
    const result = await this.db.execute<ClaimedOutboxMessage>(sql`
      WITH candidates AS (
        SELECT id
        FROM outbox_messages
        WHERE status = 'pending'
          OR (status = 'processing' AND locked_until <= ${now})
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${this.options.batchSize}
      )
      UPDATE outbox_messages AS message
      SET status = 'processing',
          attempts = message.attempts + 1,
          locked_until = ${lockedUntil},
          updated_at = ${now}
      FROM candidates
      WHERE message.id = candidates.id
      RETURNING message.id, message.payload, message.locked_until AS "lockedUntil"
    `);

    return result.rows;
  }

  private async markPublished(message: ClaimedOutboxMessage): Promise<void> {
    const now = this.clock.now();
    await this.db.execute(sql`
      UPDATE outbox_messages
      SET status = 'published',
          locked_until = NULL,
          published_at = ${now},
          updated_at = ${now}
      WHERE id = ${message.id}
        AND status = 'processing'
        AND locked_until = ${message.lockedUntil}
    `);
  }

  private async release(message: ClaimedOutboxMessage): Promise<void> {
    const now = this.clock.now();
    await this.db.execute(sql`
      UPDATE outbox_messages
      SET status = 'pending',
          locked_until = NULL,
          updated_at = ${now}
      WHERE id = ${message.id}
        AND status = 'processing'
        AND locked_until = ${message.lockedUntil}
    `);
  }
}
