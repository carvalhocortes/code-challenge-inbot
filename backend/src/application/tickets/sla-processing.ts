import { classifyProcessingFailure } from "../../domain/processing-failure.js";
import type { ProcessingFailure } from "../../domain/processing-failure.js";
import {
  calculateSlaDueAt,
  type SlaHoursByPriority,
} from "../../domain/sla.js";
import type { Clock, TicketPriority } from "../../domain/ticket.js";

export type TicketSlaProcessingResult = "processed" | "ignored";

export interface TicketSlaJob {
  ticketId: string;
  processingVersion: number;
}

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

export interface TicketSlaProcessingOptions {
  clock?: Clock;
  slaHoursByPriority?: SlaHoursByPriority;
}

export class TicketSlaProcessingService {
  private readonly clock: Clock;
  private readonly slaHoursByPriority: SlaHoursByPriority | undefined;

  constructor(
    private readonly store: TicketSlaProcessingStore,
    private readonly holidayProvider: HolidayProvider,
    options: TicketSlaProcessingOptions = {},
  ) {
    this.clock = options.clock ?? { now: () => new Date() };
    this.slaHoursByPriority = options.slaHoursByPriority;
  }

  async process(job: TicketSlaJob): Promise<TicketSlaProcessingResult> {
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
      slaHoursByPriority: this.slaHoursByPriority,
    });
    const completed = await this.store.complete(
      job.ticketId,
      job.processingVersion,
      slaDueAt,
      this.clock.now(),
    );

    return completed ? "processed" : "ignored";
  }

  async markFailed(job: TicketSlaJob): Promise<void> {
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
