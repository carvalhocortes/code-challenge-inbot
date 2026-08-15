import { Worker } from "bullmq";
import { ticketSlaJobSchema, type TicketSlaJob } from "@inbot/shared";
import { and, eq } from "drizzle-orm";
import type { Redis } from "ioredis";

import { calculateSlaDueAt } from "../domain/sla.js";
import type { Clock } from "../domain/ticket.js";
import type { Database } from "../infrastructure/database/ticket-repository.js";
import { tickets } from "../infrastructure/database/schema.js";
import {
  ticketSlaJobName,
  ticketSlaQueueName,
} from "../infrastructure/queue/ticket-sla-queue.js";

export interface HolidayProvider {
  holidays(): Promise<ReadonlySet<string>>;
}

export type TicketSlaProcessingResult = "processed" | "ignored";

export class TicketSlaProcessor {
  constructor(
    private readonly db: Database,
    private readonly holidayProvider: HolidayProvider,
    private readonly clock: Clock = { now: () => new Date() },
  ) {}

  async process(payload: unknown): Promise<TicketSlaProcessingResult> {
    const job = ticketSlaJobSchema.parse(payload);
    const claimedTicket = await this.claim(job);

    if (claimedTicket === undefined) {
      return "ignored";
    }

    const holidays = await this.holidayProvider.holidays();
    const slaDueAt = calculateSlaDueAt({
      createdAt: claimedTicket.createdAt,
      priority: claimedTicket.priority,
      holidays,
    });
    const updated = await this.db
      .update(tickets)
      .set({
        processingStatus: "processed",
        slaDueAt,
        updatedAt: this.clock.now(),
      })
      .where(
        and(
          eq(tickets.id, job.ticketId),
          eq(tickets.version, job.processingVersion),
          eq(tickets.processingStatus, "processing"),
        ),
      )
      .returning({ id: tickets.id });

    return updated.length === 1 ? "processed" : "ignored";
  }

  private async claim(job: TicketSlaJob) {
    const claimed = await this.db
      .update(tickets)
      .set({
        processingStatus: "processing",
        updatedAt: this.clock.now(),
      })
      .where(
        and(
          eq(tickets.id, job.ticketId),
          eq(tickets.version, job.processingVersion),
          eq(tickets.processingStatus, "pending"),
        ),
      )
      .returning({ createdAt: tickets.createdAt, priority: tickets.priority });

    return claimed[0];
  }
}

export function createTicketSlaWorker(
  connection: Redis,
  processor: TicketSlaProcessor,
): Worker<TicketSlaJob, TicketSlaProcessingResult, typeof ticketSlaJobName> {
  return new Worker(ticketSlaQueueName, (job) => processor.process(job.data), {
    connection,
  });
}
