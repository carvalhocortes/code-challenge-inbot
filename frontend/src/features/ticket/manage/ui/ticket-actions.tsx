import type {
  TicketDetailResponse,
  TicketPriority,
  TicketStatus,
} from "@inbot/shared";
import { useState } from "react";

import {
  ticketPriorityLabel,
  ticketStatusLabel,
} from "../../../../entities/ticket/lib/labels";
import { useTicketActions } from "../model/use-ticket-actions";

const statuses: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];
const priorities: TicketPriority[] = ["critical", "high", "medium", "low"];

export function TicketActions({
  ticket,
  onProblem,
}: {
  ticket: TicketDetailResponse;
  onProblem(error: Error | null): void;
}) {
  const actions = useTicketActions(ticket.id);
  const [nextPriority, setNextPriority] = useState(ticket.priority);
  const [nextStatus, setNextStatus] = useState(ticket.status);

  function run(action: Parameters<typeof actions.mutate>[0]) {
    actions.mutate(action, {
      onError: onProblem,
      onSuccess: () => onProblem(null),
    });
  }

  return (
    <section aria-labelledby="ticket-actions-title" className="ticket-actions">
      <div className="section-heading">
        <p className="eyebrow">Conduzir atendimento</p>
        <h2 id="ticket-actions-title">Ações do ticket</h2>
      </div>
      <p className="section-lead">
        As regras de transição são validadas pela API antes de cada alteração.
      </p>

      <div className="action-grid">
        <form
          className="action-form"
          onSubmit={(event) => {
            event.preventDefault();
            run({
              kind: "status",
              status: nextStatus,
              version: ticket.version,
            });
          }}
        >
          <label className="field" htmlFor="ticket-status">
            Status de atendimento
            <select
              id="ticket-status"
              onChange={(event) =>
                setNextStatus(event.target.value as TicketStatus)
              }
              value={nextStatus}
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {ticketStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button-secondary"
            disabled={actions.isPending || nextStatus === ticket.status}
            type="submit"
          >
            Atualizar status
          </button>
        </form>

        <form
          className="action-form"
          onSubmit={(event) => {
            event.preventDefault();
            run({
              kind: "priority",
              priority: nextPriority,
              version: ticket.version,
            });
          }}
        >
          <label className="field" htmlFor="ticket-priority">
            Prioridade
            <select
              id="ticket-priority"
              onChange={(event) =>
                setNextPriority(event.target.value as TicketPriority)
              }
              value={nextPriority}
            >
              {priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {ticketPriorityLabel(priority)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button-secondary"
            disabled={actions.isPending || nextPriority === ticket.priority}
            type="submit"
          >
            Recalcular SLA
          </button>
        </form>

        {ticket.processingStatus === "failed" ? (
          <div className="action-form action-form-reprocess">
            <strong>Falha no processamento</strong>
            <p>Solicite uma nova tentativa usando a versão atual do ticket.</p>
            <button
              className="button button-primary"
              disabled={actions.isPending}
              onClick={() =>
                run({ kind: "reprocess", version: ticket.version })
              }
              type="button"
            >
              Reprocessar SLA
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
