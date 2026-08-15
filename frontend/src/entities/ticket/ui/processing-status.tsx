import type { TicketProcessingStatus } from "@inbot/shared";

const labels: Record<TicketProcessingStatus, string> = {
  failed: "Falhou",
  pending: "Aguardando cálculo",
  processed: "Processado",
  processing: "Em processamento",
};

export function ProcessingStatus({
  status,
}: {
  status: TicketProcessingStatus;
}) {
  return (
    <span className={`status-badge status-badge-${status}`}>
      {labels[status]}
    </span>
  );
}
