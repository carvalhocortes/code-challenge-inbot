import type { TicketDetailResponse, TicketResponse } from "@inbot/shared";
import type { FastifyReply } from "fastify";

import type { TicketHistoryEntry } from "../../application/tickets/contracts.js";
import {
  defaultSlaThresholds,
  evaluateSla,
  type SlaThresholds,
} from "../../domain/sla-status.js";
import type { Ticket } from "../../domain/ticket.js";

export function etagFor(version: number): string {
  return `"${version}"`;
}

export function toTicketResponse(
  ticket: Ticket,
  now = new Date(),
  thresholds: SlaThresholds = defaultSlaThresholds,
): TicketResponse {
  const sla = evaluateSla(ticket.createdAt, ticket.slaDueAt, now, thresholds);

  return {
    ...ticket,
    slaDueAt: ticket.slaDueAt?.toISOString() ?? null,
    slaStatus: sla.status,
    slaRemainingMs: sla.remainingMs,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

export function toTicketDetailResponse(
  ticket: Ticket,
  history: TicketHistoryEntry[],
  now: Date,
  thresholds: SlaThresholds = defaultSlaThresholds,
): TicketDetailResponse {
  return {
    ...toTicketResponse(ticket, now, thresholds),
    history: history.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

export function sendTicketResponse(
  reply: FastifyReply,
  ticket: Ticket,
  now: Date,
  thresholds: SlaThresholds | undefined,
  statusCode = 200,
) {
  return reply
    .header("etag", etagFor(ticket.version))
    .code(statusCode)
    .send(toTicketResponse(ticket, now, thresholds));
}
