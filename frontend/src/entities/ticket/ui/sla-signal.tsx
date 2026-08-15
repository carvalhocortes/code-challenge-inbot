import { formatTicketDateTime } from "../lib/format";

export function SlaSignal({ dueAt }: { dueAt: string | null }) {
  if (dueAt === null) {
    return (
      <div className="sla-signal sla-signal-calculating">
        <strong>Calculando prazo</strong>
        <span>O SLA será exibido após o processamento.</span>
      </div>
    );
  }

  const isOverdue = new Date(dueAt).getTime() < Date.now();

  return (
    <div className={`sla-signal ${isOverdue ? "sla-signal-overdue" : ""}`}>
      <strong>{formatTicketDateTime(dueAt)}</strong>
      <span>{isOverdue ? "SLA vencido" : "No prazo"}</span>
    </div>
  );
}
