import { useNavigate } from "react-router-dom";

import { TicketForm } from "../../../../features/ticket/create/ui/ticket-form";
import { useCreateTicket } from "../../../../features/ticket/create/model/use-create-ticket";
import { ApiProblemError, requestIdFor } from "../../../../shared/api/http";

export function NewTicketPage() {
  const navigate = useNavigate();
  const createTicket = useCreateTicket();
  const problem = createTicket.error
    ? describeCreateProblem(createTicket.error)
    : null;

  return (
    <section
      className="page-grid page-grid-form"
      aria-labelledby="new-ticket-title"
    >
      <div>
        <p className="eyebrow">Nova estrutura</p>
        <h1 id="new-ticket-title">Estruturar novo ticket</h1>
        <p className="page-lead">
          Registre o atendimento. O prazo de SLA será calculado depois do
          cadastro.
        </p>
        <TicketForm
          onCreate={async (ticket) => {
            const createdTicket = await createTicket.mutateAsync(ticket);
            navigate(`/tickets/${createdTicket.id}`);
          }}
          problem={problem}
          problemReference={requestIdFor(createTicket.error)}
          submitting={createTicket.isPending}
        />
      </div>

      <aside className="orientation-card" aria-label="Orientação sobre SLA">
        <p className="eyebrow">Próximo passo</p>
        <h2>O cálculo acontece em segundo plano.</h2>
        <p>
          Após criar o Ticket, acompanhe o sinal de processamento no detalhe.
        </p>
      </aside>
    </section>
  );
}

function describeCreateProblem(error: Error): string {
  if (error instanceof ApiProblemError && error.status === 422) {
    return "Revise os campos destacados e tente criar o Ticket novamente.";
  }

  if (error instanceof ApiProblemError && error.status === 409) {
    return "Esta tentativa já foi usada com dados diferentes. Revise o Ticket antes de enviar.";
  }

  return "Não foi possível criar o Ticket agora. Tente novamente.";
}
