import type { TicketResponse } from "@inbot/shared";

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
