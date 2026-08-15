import type { TicketStatus } from "@inbot/shared";

import { ticketStatusLabel } from "../lib/labels";

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`status-badge ticket-status-${status}`}>
      {ticketStatusLabel(status)}
    </span>
  );
}
