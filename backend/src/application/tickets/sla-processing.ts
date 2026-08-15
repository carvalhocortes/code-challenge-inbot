import { ticketSlaJobSchema } from "@inbot/shared";

import { classifyProcessingFailure } from "../../domain/processing-failure.js";
import type { ProcessingFailure } from "../../domain/processing-failure.js";
import { calculateSlaDueAt } from "../../domain/sla.js";
import type { Clock, TicketPriority } from "../../domain/ticket.js";

export type TicketSlaProcessingResult = "processed" | "ignored";

export interface HolidayProvider {
  holidaysForYear(year: number): Promise<ReadonlySet<string>>;
}

export interface TicketSlaProcessingStore {
  claim(
    ticketId: string,
    processingVersion: number,
    now: Date,
  ): Promise<{ createdAt: Date; priority: TicketPriority } | undefined>;
  complete(
    ticketId: string,
    processingVersion: number,
    slaDueAt: Date,
    now: Date,
  ): Promise<boolean>;
  markFailed(
    ticketId: string,
    processingVersion: number,
    now: Date,
  ): Promise<void>;
}

export class TicketSlaProcessingService {
  constructor(
    private readonly store: TicketSlaProcessingStore,
    private readonly holidayProvider: HolidayProvider,
    private readonly clock: Clock = { now: () => new Date() },
  ) {}

  async process(payload: unknown): Promise<TicketSlaProcessingResult> {
    const job = ticketSlaJobSchema.parse(payload);
    const claimedTicket = await this.store.claim(
      job.ticketId,
      job.processingVersion,
      this.clock.now(),
    );

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
    const completed = await this.store.complete(
      job.ticketId,
      job.processingVersion,
      slaDueAt,
      this.clock.now(),
    );

    return completed ? "processed" : "ignored";
  }

  async markFailed(payload: unknown): Promise<void> {
    const job = ticketSlaJobSchema.parse(payload);
    await this.store.markFailed(
      job.ticketId,
      job.processingVersion,
      this.clock.now(),
    );
  }

  isDefinitiveFailure(error: unknown): boolean {
    return (
      error instanceof HolidayProviderError &&
      classifyProcessingFailure(error.failure) === "definitive"
    );
  }
}

export class HolidayProviderError extends Error {
  constructor(public readonly failure: ProcessingFailure) {
    super(`holiday_provider.${failure.kind}`);
    this.name = "HolidayProviderError";
  }
}
