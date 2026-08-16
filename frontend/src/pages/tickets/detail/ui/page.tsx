import type { TicketDetailResponse } from "@inbot/shared";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { formatTicketDateTime } from "../../../../entities/ticket/lib/format";
import {
  ticketPriorityLabel,
  ticketStatusLabel,
} from "../../../../entities/ticket/lib/labels";
import { HistoryTimeline } from "../../../../entities/ticket/ui/history-timeline";
import { ProcessingStatus } from "../../../../entities/ticket/ui/processing-status";
import { SlaSignal } from "../../../../entities/ticket/ui/sla-signal";
import { TicketStatusBadge } from "../../../../entities/ticket/ui/ticket-status";
import {
  hasActiveTicketProcessing,
  useTicketDetail,
} from "../../../../features/ticket/detail/model/use-ticket-detail";
import { TicketActions } from "../../../../features/ticket/manage/ui/ticket-actions";
import { ApiProblemError, requestIdFor } from "../../../../shared/api/http";

interface ActionProblem {
  description: string;
  requestId: string | null;
  title: string;
}

export function TicketDetailPage() {
  const { id = "" } = useParams();
  const ticket = useTicketDetail(id);

  if (ticket.isPending) {
    return <p role="status">Carregando Ticket…</p>;
  }

  if (ticket.isError || !ticket.data) {
    return (
      <section className="problem-state" role="alert">
        <h1>Não foi possível carregar este Ticket</h1>
        <p>Verifique a conexão com a API e tente novamente.</p>
        <ProblemReference requestId={requestIdFor(ticket.error)} />
        <div className="problem-actions">
          <button
            className="button button-secondary"
            onClick={() => void ticket.refetch()}
            type="button"
          >
            Tentar novamente
          </button>
          <Link className="button button-secondary" to="/tickets">
            Voltar para tickets
          </Link>
        </div>
      </section>
    );
  }

  return (
    <TicketDetailContent
      onReload={() => void ticket.refetch()}
      ticket={ticket.data}
    />
  );
}

function TicketDetailContent({
  onReload,
  ticket,
}: {
  onReload(): void;
  ticket: TicketDetailResponse;
}) {
  const [actionProblem, setActionProblem] = useState<ActionProblem | null>(
    null,
  );
  const activeProcessing = hasActiveTicketProcessing(ticket);

  return (
    <section aria-labelledby="ticket-title" className="ticket-detail">
      <Link className="back-link" to="/tickets">
        Voltar para tickets
      </Link>

      <header className="ticket-detail-header">
        <div>
          <p className="eyebrow">Ticket #{ticket.id.slice(0, 8)}</p>
          <h1 id="ticket-title">{ticket.title}</h1>
          <p className="page-lead">{ticket.description}</p>
        </div>
        <TicketStatusBadge status={ticket.status} />
      </header>

      {actionProblem ? (
        <section className="problem-state action-problem" role="alert">
          <h2>{actionProblem.title}</h2>
          <p>{actionProblem.description}</p>
          <ProblemReference requestId={actionProblem.requestId} />
          <button
            className="button button-secondary"
            onClick={() => {
              setActionProblem(null);
              onReload();
            }}
            type="button"
          >
            Recarregar ticket
          </button>
        </section>
      ) : null}

      <p aria-live="polite" className="refresh-signal">
        {activeProcessing
          ? "Atualizando processamento do SLA"
          : "Informações atualizadas"}
      </p>

      <div className="detail-dashboard">
        <section
          aria-labelledby="sla-title"
          className="detail-card detail-card-sla"
        >
          <p className="eyebrow">Prazo de SLA</p>
          <h2 id="sla-title">Compromisso de atendimento</h2>
          <SlaSignal dueAt={ticket.slaDueAt} />
          <p className="detail-note">Horário exibido em São Paulo.</p>
        </section>

        <section aria-labelledby="processing-title" className="detail-card">
          <p className="eyebrow">Processamento</p>
          <h2 id="processing-title">Cálculo do SLA</h2>
          <ProcessingStatus status={ticket.processingStatus} />
          <p className="detail-note">
            Última atualização: {formatTicketDateTime(ticket.updatedAt)}
          </p>
        </section>

        <section aria-labelledby="requester-title" className="detail-card">
          <p className="eyebrow">Solicitante</p>
          <h2 id="requester-title">Quem precisa de ajuda</h2>
          <p className="requester-email">{ticket.requesterEmail}</p>
          <p className="detail-note">
            Prioridade atual: {ticketPriorityLabel(ticket.priority)}
          </p>
        </section>
      </div>

      <TicketActions
        onProblem={(error) => setActionProblem(problemFrom(error))}
        ticket={ticket}
      />

      <section aria-labelledby="history-title" className="ticket-history">
        <div className="section-heading">
          <p className="eyebrow">Histórico do ticket</p>
          <h2 id="history-title">Rastro do atendimento</h2>
        </div>
        <HistoryTimeline entries={ticket.history} />
      </section>

      <details className="processing-details">
        <summary>Detalhes de processamento</summary>
        <dl>
          <div>
            <dt>Versão para concorrência</dt>
            <dd>{ticket.version}</dd>
          </div>
          <div>
            <dt>Status de atendimento</dt>
            <dd>{ticketStatusLabel(ticket.status)}</dd>
          </div>
          <div>
            <dt>Atualizado em</dt>
            <dd>{formatTicketDateTime(ticket.updatedAt)}</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}

function problemFrom(error: Error | null): ActionProblem | null {
  if (error === null) return null;

  if (
    error instanceof ApiProblemError &&
    (error.status === 409 || error.status === 412)
  ) {
    return {
      description:
        "O ticket mudou ou esta ação não é mais permitida. Recarregue os dados antes de continuar.",
      requestId: requestIdFor(error),
      title: "Não foi possível concluir a ação",
    };
  }

  return {
    description:
      error instanceof ApiProblemError && error.problem?.detail
        ? error.problem.detail
        : "A ação não foi concluída. Verifique a conexão e tente novamente.",
    requestId: requestIdFor(error),
    title: "Falha ao atualizar o ticket",
  };
}

function ProblemReference({ requestId }: { requestId: string | null }) {
  if (requestId === null) return null;

  return (
    <p className="problem-reference">
      Referência: <code>{requestId}</code>
    </p>
  );
}
