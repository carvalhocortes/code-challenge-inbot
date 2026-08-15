import type { TicketResponse } from "@inbot/shared";

import type { Ticket } from "../../domain/ticket.js";

export function etagFor(version: number): string {
  return `"${version}"`;
}

export function toTicketResponse(ticket: Ticket): TicketResponse {
  return {
    ...ticket,
    slaDueAt: ticket.slaDueAt?.toISOString() ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}
