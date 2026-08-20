import { ticketSlaJobMessageSchema } from "@inbot/shared";
import { sql } from "drizzle-orm";

import type { Clock } from "../../domain/ticket.js";
import type { Database } from "../database/database.js";
import {
  createLogger,
  errorContext,
  type Logger,
} from "../observability/logger.js";
import {
  ticketSlaJobName,
  ticketSlaJobOptions,
  type TicketSlaQueue,
} from "../queue/ticket-sla-queue.js";
import {
  contextFromTraceContext,
  withSpan,
} from "../../observability/telemetry.js";
import { recordOutboxMessage } from "../../observability/metrics.js";

export interface OutboxDispatcherOptions {
  batchSize: number;
  leaseMs: number;
}

interface ClaimedOutboxMessage {
  [key: string]: unknown;
  id: string;
  payload: unknown;
  lockedUntil: Date;
  attempts: number;
}

export class OutboxDispatcher {
  constructor(
    private readonly db: Database,
    private readonly queue: TicketSlaQueue,
    private readonly clock: Clock,
    private readonly options: OutboxDispatcherOptions,
    private readonly logger: Logger = createLogger("worker"),
  ) {}

  async dispatchOnce(): Promise<number> {
    const messages = await this.claimBatch();

    this.logger.debug(
      { event: "outbox.dispatch.claimed", claimedCount: messages.length },
      "Outbox batch claimed",
    );

    for (const rawMessage of messages) {
      const message = {
        ...rawMessage,
        payload: ticketSlaJobMessageSchema.parse(rawMessage.payload),
      };
      const context = {
        event: "outbox.message",
        outboxId: message.id,
        ticketId: message.payload.payload.ticketId,
        processingVersion: message.payload.payload.processingVersion,
        attempts: message.attempts,
      };

      try {
        await withSpan(
          "outbox.publish",
          {
            "messaging.system": "bullmq",
            "messaging.destination.name": "ticket-sla",
            "inbot.outbox.id": message.id,
            "inbot.ticket.id": message.payload.payload.ticketId,
            "inbot.ticket.processing_version":
              message.payload.payload.processingVersion,
          },
          async () => {
            this.logger.info(
              { ...context, phase: "publish_started" },
              "Outbox message publishing",
            );
            await this.queue.add(
              ticketSlaJobName,
              message.payload,
              ticketSlaJobOptions(message.payload.payload),
            );
            await this.markPublished(message);
            this.logger.info(
              { ...context, phase: "published" },
              "Outbox message published",
            );
          },
          contextFromTraceContext(message.payload.telemetry),
        );
        recordOutboxMessage("published");
      } catch (error) {
        recordOutboxMessage("failed");
        this.logger.error(
          { ...context, ...errorContext(error), phase: "publish_failed" },
          "Outbox message publishing failed",
        );
        try {
          await this.release(message);
        } catch (releaseError) {
          this.logger.error(
            {
              ...context,
              ...errorContext(releaseError),
              phase: "release_failed",
            },
            "Outbox message release failed",
          );
          recordOutboxMessage("release_failed");
          throw releaseError;
        }
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
      RETURNING message.id, message.payload, message.locked_until AS "lockedUntil", message.attempts
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
