import { Queue, type JobsOptions } from "bullmq";
import type { TicketSlaJob } from "@inbot/shared";
import type { Redis } from "ioredis";

export const ticketSlaQueueName = "ticket-sla";
export const ticketSlaJobName = "calculate-sla";

export type TicketSlaQueue = Pick<
  Queue<TicketSlaJob, void, typeof ticketSlaJobName>,
  "add"
>;

export interface TicketSlaQueueOptions {
  attempts: number;
  backoffMs: number;
}

export function createTicketSlaQueue(
  connection: Redis,
  options?: TicketSlaQueueOptions,
): Queue<TicketSlaJob, void, typeof ticketSlaJobName> {
  return new Queue(ticketSlaQueueName, {
    connection,
    defaultJobOptions:
      options === undefined
        ? undefined
        : {
            attempts: options.attempts,
            backoff: { type: "exponential", delay: options.backoffMs },
          },
  });
}

export function ticketSlaJobId(payload: TicketSlaJob): string {
  return `ticket-${payload.ticketId}-processing-${payload.processingVersion}`;
}

export function ticketSlaJobOptions(payload: TicketSlaJob): JobsOptions {
  return { jobId: ticketSlaJobId(payload) };
}
