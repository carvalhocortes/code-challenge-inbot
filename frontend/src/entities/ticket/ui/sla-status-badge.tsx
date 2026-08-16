import type { TicketSlaStatus } from "@inbot/shared";

const labels: Record<TicketSlaStatus, string> = {
  overdue: "Vencido",
  critical: "Estado crítico",
  alert: "Alerta",
  on_track: "On track",
};

export function SlaStatusBadge({
  remainingMs,
  status,
}: {
  remainingMs: number | null;
  status: TicketSlaStatus | null;
}) {
  if (status === null) {
    return (
      <span className="status-badge sla-status-badge sla-status-calculating">
        Calculando
      </span>
    );
  }

  return (
    <span className={`status-badge sla-status-badge sla-status-${status}`}>
      <strong>{labels[status]}</strong>
      <small>{formatRemaining(remainingMs, status)}</small>
    </span>
  );
}

function formatRemaining(
  remainingMs: number | null,
  status: TicketSlaStatus,
): string {
  if (remainingMs === null) return "Tempo indisponível";

  const duration = formatDuration(Math.abs(remainingMs));
  return status === "overdue" ? `há ${duration}` : `${duration} restantes`;
}

function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(1, Math.round(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}
