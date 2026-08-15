import { Queue, type JobsOptions } from "bullmq";
import type { TicketSlaJob } from "@inbot/shared";
import type { Redis } from "ioredis";

export const ticketSlaQueueName = "ticket-sla";
export const ticketSlaJobName = "calculate-sla";

export type TicketSlaQueue = Pick<
  Queue<TicketSlaJob, void, typeof ticketSlaJobName>,
  "add"
>;

export function createTicketSlaQueue(
  connection: Redis,
): Queue<TicketSlaJob, void, typeof ticketSlaJobName> {
  return new Queue(ticketSlaQueueName, { connection });
}

export function ticketSlaJobId(payload: TicketSlaJob): string {
  return `ticket-${payload.ticketId}-processing-${payload.processingVersion}`;
}

export function ticketSlaJobOptions(payload: TicketSlaJob): JobsOptions {
  return { jobId: ticketSlaJobId(payload) };
}
