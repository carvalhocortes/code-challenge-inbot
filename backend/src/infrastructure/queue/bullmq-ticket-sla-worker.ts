import { UnrecoverableError, Worker, type Job } from "bullmq";
import {
  ticketSlaJobMessageSchema,
  type TicketSlaJobMessage,
} from "@inbot/shared";
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
import {
  contextFromTraceContext,
  withSpan,
} from "../../observability/telemetry.js";
import { recordSlaJob } from "../../observability/metrics.js";
import { ticketSlaJobName, ticketSlaQueueName } from "./ticket-sla-queue.js";

/** BullMQ adapter that converts queue lifecycle events into application calls. */
export function createTicketSlaWorker(
  connection: Redis,
  processor: TicketSlaProcessingService,
  logger: Logger = createLogger("worker"),
): Worker<
  TicketSlaJobMessage,
  TicketSlaProcessingResult,
  typeof ticketSlaJobName
> {
  const worker = new Worker<
    TicketSlaJobMessage,
    TicketSlaProcessingResult,
    typeof ticketSlaJobName
  >(
    ticketSlaQueueName,
    async (job) => {
      const message = parseJobData(job.data);
      const startedAt = Date.now();

      return withSpan(
        "ticket.sla.process",
        {
          "messaging.system": "bullmq",
          "messaging.destination.name": ticketSlaQueueName,
          "messaging.operation.name": "process",
          "inbot.ticket.id": message.payload.ticketId,
          "inbot.ticket.processing_version": message.payload.processingVersion,
          "messaging.message.retry.count": job.attemptsMade,
        },
        async () => {
          try {
            const result = await processor.process(message.payload);
            recordSlaJob(
              result === "processed" ? "completed" : "ignored",
              Date.now() - startedAt,
            );
            logger.info(
              {
                ...jobContext(job),
                event: "sla.processing.completed",
                result,
              },
              "SLA processing completed",
            );
            return result;
          } catch (error) {
            if (!(error instanceof HolidayProviderError)) {
              recordSlaJob("failed", Date.now() - startedAt);
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
              await processor.markFailed(message.payload);
              recordSlaJob("failed", Date.now() - startedAt);
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
            recordSlaJob("retryable_failure", Date.now() - startedAt);
            throw error;
          }
        },
        contextFromTraceContext(message.telemetry),
      );
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
      void processor
        .markFailed(parseJobData(job.data).payload)
        .catch((markError: unknown) => {
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

function parseJobData(data: unknown): TicketSlaJobMessage {
  return ticketSlaJobMessageSchema.parse(data);
}

function jobContext(job: Job<TicketSlaJobMessage> | undefined) {
  if (job === undefined) return {};

  return {
    attemptsMade: job.attemptsMade,
    jobId: job.id,
    maxAttempts: job.opts.attempts ?? 1,
    processingVersion: job.data.payload.processingVersion,
    ticketId: job.data.payload.ticketId,
  };
}

function failureContext(error: HolidayProviderError) {
  return {
    failureKind: error.failure.kind,
    failureStatus:
      error.failure.kind === "http" ? error.failure.status : undefined,
  };
}
