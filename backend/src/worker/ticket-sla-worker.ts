import { UnrecoverableError, Worker } from "bullmq";
import { ticketSlaJobSchema, type TicketSlaJob } from "@inbot/shared";
import { and, eq, or } from "drizzle-orm";
import type { Redis } from "ioredis";

import { calculateSlaDueAt } from "../domain/sla.js";
import { classifyProcessingFailure } from "../domain/processing-failure.js";
import type { Clock } from "../domain/ticket.js";
import type { Database } from "../infrastructure/database/ticket-repository.js";
import { tickets } from "../infrastructure/database/schema.js";
import {
  HolidayProviderError,
  type HolidayProvider,
} from "../infrastructure/holidays/holiday-provider.js";
import {
  ticketSlaJobName,
  ticketSlaQueueName,
} from "../infrastructure/queue/ticket-sla-queue.js";

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

    const holidays = await this.holidayProvider.holidaysForYear(
      claimedTicket.createdAt.getUTCFullYear(),
    );
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
          or(
            eq(tickets.processingStatus, "pending"),
            eq(tickets.processingStatus, "processing"),
          ),
        ),
      )
      .returning({ createdAt: tickets.createdAt, priority: tickets.priority });

    return claimed[0];
  }

  async markFailed(payload: unknown): Promise<void> {
    const job = ticketSlaJobSchema.parse(payload);
    await this.db
      .update(tickets)
      .set({ processingStatus: "failed", updatedAt: this.clock.now() })
      .where(
        and(
          eq(tickets.id, job.ticketId),
          eq(tickets.version, job.processingVersion),
          eq(tickets.processingStatus, "processing"),
        ),
      );
  }
}

export function createTicketSlaWorker(
  connection: Redis,
  processor: TicketSlaProcessor,
): Worker<TicketSlaJob, TicketSlaProcessingResult, typeof ticketSlaJobName> {
  const worker = new Worker<
    TicketSlaJob,
    TicketSlaProcessingResult,
    typeof ticketSlaJobName
  >(
    ticketSlaQueueName,
    async (job) => {
      try {
        return await processor.process(job.data);
      } catch (error) {
        if (!(error instanceof HolidayProviderError)) {
          throw error;
        }

        const isDefinitive =
          classifyProcessingFailure(error.failure) === "definitive";

        if (isDefinitive) {
          await processor.markFailed(job.data);
        }

        if (isDefinitive) {
          throw new UnrecoverableError(error.message);
        }

        throw error;
      }
    },
    { connection },
  );

  worker.on("failed", (job, error) => {
    if (
      job !== undefined &&
      error instanceof HolidayProviderError &&
      job.attemptsMade >= (job.opts.attempts ?? 1)
    ) {
      void processor.markFailed(job.data);
    }
  });

  return worker;
}
