import type { TicketSlaStatus } from "@inbot/shared";

const labels: Record<TicketSlaStatus, string> = {
  overdue: "Vencido",
  critical: "Estado crítico",
  alert: "Alerta",
  on_track: "On track",
};

export function SlaStatusBadge({ status }: { status: TicketSlaStatus | null }) {
  if (status === null) {
    return (
      <span className="status-badge sla-status-badge sla-status-calculating">
        Calculando
      </span>
    );
  }

  return (
    <span className={`status-badge sla-status-badge sla-status-${status}`}>
      {labels[status]}
    </span>
  );
}
