import { UnrecoverableError, Worker, type Job } from "bullmq";
import type { TicketSlaJob } from "@inbot/shared";
import type { Redis } from "ioredis";

import {
  HolidayProviderError,
  TicketSlaProcessingService,
  type TicketSlaProcessingResult,
} from "../../application/tickets/sla-processing.js";
import {
  createLogger,
  errorContext,
  type Logger,
} from "../observability/logger.js";
import { ticketSlaJobName, ticketSlaQueueName } from "./ticket-sla-queue.js";

/** BullMQ adapter that converts queue lifecycle events into application calls. */
export function createTicketSlaWorker(
  connection: Redis,
  processor: TicketSlaProcessingService,
  logger: Logger = createLogger("worker"),
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
        if (processor.isDefinitiveFailure(error)) {
          logger.warn(
            {
              ...jobContext(job),
              event: "sla.processing.definitive_failure",
              ...failureContext(error),
            },
            "SLA processing reached a definitive failure",
          );
          await processor.markFailed(job.data);
          throw new UnrecoverableError(error.message);
        }
        logger.warn(
          {
            ...jobContext(job),
            ...errorContext(error),
            event: "sla.processing.retryable_failure",
            ...failureContext(error),
          },
          "SLA processing will be retried",
        );
        throw error;
      }
    },
    { connection },
  );

  worker.on("active", (job) => {
    logger.debug(
      { ...jobContext(job), event: "sla.job.active" },
      "SLA job started",
    );
  });

  worker.on("completed", (job, result) => {
    logger.info(
      {
        ...jobContext(job),
        durationMs:
          job.processedOn === undefined
            ? undefined
            : Math.max(0, Date.now() - job.processedOn),
        event: "sla.job.completed",
        result,
      },
      "SLA job completed",
    );
  });

  worker.on("failed", (job, error) => {
    logger.error(
      { ...jobContext(job), ...errorContext(error), event: "sla.job.failed" },
      "SLA job failed",
    );

    if (
      job !== undefined &&
      error instanceof HolidayProviderError &&
      job.attemptsMade >= (job.opts.attempts ?? 1)
    ) {
      void processor.markFailed(job.data).catch((markError: unknown) => {
        logger.error(
          {
            ...jobContext(job),
            ...errorContext(markError),
            event: "sla.ticket_failure_persist_failed",
          },
          "Failed to persist SLA processing failure",
        );
      });
    }
  });

  worker.on("stalled", (jobId) => {
    logger.warn(
      { event: "sla.job.stalled", jobId },
      "SLA job stalled and will be recovered by BullMQ",
    );
  });

  worker.on("error", (error) => {
    logger.error(
      { ...errorContext(error), event: "sla.worker.error" },
      "SLA Worker emitted an error",
    );
  });

  return worker;
}

function jobContext(job: Job<TicketSlaJob> | undefined) {
  if (job === undefined) return {};

  return {
    attemptsMade: job.attemptsMade,
    jobId: job.id,
    maxAttempts: job.opts.attempts ?? 1,
    processingVersion: job.data.processingVersion,
    ticketId: job.data.ticketId,
  };
}

function failureContext(error: HolidayProviderError) {
  return {
    failureKind: error.failure.kind,
    failureStatus:
      error.failure.kind === "http" ? error.failure.status : undefined,
  };
}
