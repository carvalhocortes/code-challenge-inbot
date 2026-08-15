import { UnrecoverableError, Worker } from "bullmq";
import type { TicketSlaJob } from "@inbot/shared";
import type { Redis } from "ioredis";

import {
  HolidayProviderError,
  TicketSlaProcessingService,
  type TicketSlaProcessingResult,
} from "../../application/tickets/sla-processing.js";
import { ticketSlaJobName, ticketSlaQueueName } from "./ticket-sla-queue.js";

/** BullMQ adapter that converts queue lifecycle events into application calls. */
export function createTicketSlaWorker(
  connection: Redis,
  processor: TicketSlaProcessingService,
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
          await processor.markFailed(job.data);
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
