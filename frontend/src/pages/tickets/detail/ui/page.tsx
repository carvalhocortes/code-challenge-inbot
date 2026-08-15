import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { ticketApi } from "../../../../entities/ticket/api/ticket-api";
import { ProcessingStatus } from "../../../../entities/ticket/ui/processing-status";

export function TicketDetailPage() {
  const { id = "" } = useParams();
  const ticket = useQuery({
    enabled: Boolean(id),
    queryFn: () => ticketApi.get(id),
    queryKey: ["ticket", id],
  });

  if (ticket.isPending) {
    return <p role="status">Carregando Ticket…</p>;
  }

  if (ticket.isError || !ticket.data) {
    return (
      <section className="problem-state" role="alert">
        <h1>Não foi possível carregar este Ticket</h1>
        <p>Tente voltar à central e abrir o Ticket novamente.</p>
        <Link to="/tickets">Voltar para tickets</Link>
      </section>
    );
  }

  return (
    <section aria-labelledby="ticket-title" className="ticket-detail">
      <Link className="back-link" to="/tickets">
        Voltar para tickets
      </Link>
      <p className="eyebrow">Ticket #{ticket.data.id.slice(0, 8)}</p>
      <h1 id="ticket-title">{ticket.data.title}</h1>
      <p>{ticket.data.description}</p>
      <dl className="detail-grid">
        <div>
          <dt>Processamento</dt>
          <dd>
            <ProcessingStatus status={ticket.data.processingStatus} />
          </dd>
        </div>
        <div>
          <dt>Prioridade</dt>
          <dd>{ticket.data.priority}</dd>
        </div>
      </dl>
    </section>
  );
}
