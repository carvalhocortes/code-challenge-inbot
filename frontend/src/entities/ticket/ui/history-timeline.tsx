import type { TicketHistoryEntry } from "@inbot/shared";

import { formatTicketDateTime } from "../lib/format";
import { ticketPriorityLabel, ticketStatusLabel } from "../lib/labels";

export function HistoryTimeline({
  entries,
}: {
  entries: TicketHistoryEntry[];
}) {
  if (entries.length === 0) {
    return <p className="timeline-empty">Ainda não há eventos registrados.</p>;
  }

  return (
    <ol className="history-timeline">
      {entries.map((entry) => (
        <li key={entry.id}>
          <div>
            <strong>{historyLabel(entry)}</strong>
            <p>{formatTicketDateTime(entry.createdAt)}</p>
          </div>
          <span
            aria-label={`Origem: ${entry.source}`}
            className="timeline-source"
          >
            {entry.source === "operator" ? "Operador" : "Sistema"}
          </span>
        </li>
      ))}
    </ol>
  );
}

function historyLabel(entry: TicketHistoryEntry): string {
  if (entry.type === "created") return "Ticket criado";

  if (entry.type === "priority_changed") {
    return `Prioridade: ${ticketPriorityLabel(entry.previousValue as "critical" | "high" | "medium" | "low")} → ${ticketPriorityLabel(entry.nextValue as "critical" | "high" | "medium" | "low")}`;
  }

  return `Atendimento: ${ticketStatusLabel(entry.previousValue as "open" | "in_progress" | "resolved" | "closed")} → ${ticketStatusLabel(entry.nextValue as "open" | "in_progress" | "resolved" | "closed")}`;
}
