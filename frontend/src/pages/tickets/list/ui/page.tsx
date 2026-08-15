import type {
  ListTicketsQuery,
  TicketPriority,
  TicketStatus,
} from "@inbot/shared";
import { Link, useSearchParams } from "react-router-dom";

import { ProcessingStatus } from "../../../../entities/ticket/ui/processing-status";
import {
  hasActiveProcessing,
  useTickets,
} from "../../../../features/ticket/list/model/use-tickets";

const priorities: Array<{ label: string; value: TicketPriority }> = [
  { label: "Crítica", value: "critical" },
  { label: "Alta", value: "high" },
  { label: "Média", value: "medium" },
  { label: "Baixa", value: "low" },
];

const statuses: Array<{ label: string; value: TicketStatus }> = [
  { label: "Aberto", value: "open" },
  { label: "Em andamento", value: "in_progress" },
  { label: "Resolvido", value: "resolved" },
  { label: "Fechado", value: "closed" },
];

export function TicketListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = queryFromSearchParams(searchParams);
  const tickets = useTickets(query);
  const activeProcessing = hasActiveProcessing(tickets.data);

  function updateQuery(update: Partial<ListTicketsQuery>) {
    const next = { ...query, ...update };
    const params = new URLSearchParams();
    if (next.page > 1) params.set("page", String(next.page));
    if (next.pageSize !== 10) params.set("pageSize", String(next.pageSize));
    if (next.q) params.set("q", next.q);
    if (next.status) params.set("status", next.status);
    if (next.priority) params.set("priority", next.priority);
    setSearchParams(params);
  }

  return (
    <section aria-labelledby="tickets-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Centro de operação</p>
          <h1 id="tickets-title">Tickets em movimento</h1>
          <p className="page-lead">
            Acompanhe prioridade, prazo de SLA e processamento em um só lugar.
          </p>
        </div>
        <Link className="button button-primary" to="/tickets/new">
          Novo ticket
        </Link>
      </header>

      <p aria-live="polite" className="refresh-signal">
        {tickets.isFetching && !tickets.isPending
          ? "Atualizando processamento"
          : activeProcessing
            ? "Atualizando cálculo de SLA"
            : "Atualizado agora"}
      </p>

      <form
        className="ticket-filters"
        onSubmit={(event) => event.preventDefault()}
      >
        <label>
          Buscar tickets
          <input
            aria-label="Buscar tickets"
            onChange={(event) =>
              updateQuery({ page: 1, q: event.target.value || undefined })
            }
            type="search"
            value={query.q ?? ""}
          />
        </label>
        <label>
          Status de atendimento
          <select
            aria-label="Status de atendimento"
            onChange={(event) =>
              updateQuery({
                page: 1,
                status: (event.target.value || undefined) as
                  | TicketStatus
                  | undefined,
              })
            }
            value={query.status ?? ""}
          >
            <option value="">Todos os status</option>
            {statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prioridade
          <select
            aria-label="Prioridade"
            onChange={(event) =>
              updateQuery({
                page: 1,
                priority: (event.target.value || undefined) as
                  | TicketPriority
                  | undefined,
              })
            }
            value={query.priority ?? ""}
          >
            <option value="">Todas as prioridades</option>
            {priorities.map((priority) => (
              <option key={priority.value} value={priority.value}>
                {priority.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button button-secondary"
          onClick={() => setSearchParams({})}
          type="button"
        >
          Limpar filtros
        </button>
      </form>

      {tickets.isPending ? <TicketListSkeleton /> : null}
      {tickets.isError ? (
        <TicketListProblem onRetry={() => void tickets.refetch()} />
      ) : null}
      {tickets.data?.items.length === 0 ? (
        <EmptyTickets
          hasFilters={Boolean(query.q || query.status || query.priority)}
        />
      ) : null}
      {tickets.data?.items.length ? (
        <TicketTable tickets={tickets.data.items} />
      ) : null}
      {tickets.data ? (
        <Pagination
          onPageChange={(page) => updateQuery({ page })}
          page={tickets.data.meta.page}
          totalPages={tickets.data.meta.totalPages}
        />
      ) : null}
    </section>
  );
}

function queryFromSearchParams(
  searchParams: URLSearchParams,
): ListTicketsQuery {
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "10");
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const q = searchParams.get("q")?.trim();

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize:
      Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 100
        ? pageSize
        : 10,
    ...(q ? { q } : {}),
    ...(statuses.some((item) => item.value === status)
      ? { status: status as TicketStatus }
      : {}),
    ...(priorities.some((item) => item.value === priority)
      ? { priority: priority as TicketPriority }
      : {}),
  };
}

function TicketListSkeleton() {
  return (
    <div
      aria-label="Carregando tickets"
      className="ticket-skeleton"
      role="status"
    >
      <span />
      <span />
      <span />
    </div>
  );
}

function TicketListProblem({ onRetry }: { onRetry(): void }) {
  return (
    <div className="problem-state" role="alert">
      <h2>Não foi possível carregar os tickets</h2>
      <p>Verifique a conexão com a API e tente novamente.</p>
      <button
        className="button button-secondary"
        onClick={onRetry}
        type="button"
      >
        Tentar novamente
      </button>
    </div>
  );
}

function EmptyTickets({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="empty-state">
      <h2>Nenhum ticket encontrado</h2>
      <p>
        {hasFilters
          ? "Ajuste os filtros para ampliar a busca."
          : "Crie o primeiro Ticket para iniciar a operação."}
      </p>
    </div>
  );
}

function TicketTable({
  tickets,
}: {
  tickets: Array<{
    id: string;
    priority: TicketPriority;
    processingStatus: "pending" | "processing" | "processed" | "failed";
    slaDueAt: string | null;
    status: TicketStatus;
    title: string;
    updatedAt: string;
  }>;
}) {
  return (
    <div className="ticket-table-wrap">
      <table className="ticket-table">
        <thead>
          <tr>
            <th scope="col">Ticket</th>
            <th scope="col">Prioridade</th>
            <th scope="col">Atendimento</th>
            <th scope="col">Processamento</th>
            <th scope="col">SLA</th>
            <th scope="col">Atualizado</th>
            <th scope="col">
              <span className="sr-only">Ação</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              <td data-label="Ticket">
                <strong>{ticket.title}</strong>
              </td>
              <td data-label="Prioridade">{priorityLabel(ticket.priority)}</td>
              <td data-label="Atendimento">{statusLabel(ticket.status)}</td>
              <td data-label="Processamento">
                <ProcessingStatus status={ticket.processingStatus} />
              </td>
              <td data-label="SLA">{formatSla(ticket.slaDueAt)}</td>
              <td data-label="Atualizado">
                {formatDateTime(ticket.updatedAt)}
              </td>
              <td>
                <Link className="table-link" to={`/tickets/${ticket.id}`}>
                  Abrir<span className="sr-only"> {ticket.title}</span>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({
  onPageChange,
  page,
  totalPages,
}: {
  onPageChange(page: number): void;
  page: number;
  totalPages: number;
}) {
  if (totalPages === 0) return null;

  return (
    <nav aria-label="Paginação" className="pagination">
      <button
        className="button button-secondary"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
      >
        Anterior
      </button>
      <p>
        Página {page} de {totalPages}
      </p>
      <button
        className="button button-secondary"
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        Próxima
      </button>
    </nav>
  );
}

function priorityLabel(priority: TicketPriority): string {
  return priorities.find((item) => item.value === priority)?.label ?? priority;
}

function statusLabel(status: TicketStatus): string {
  return statuses.find((item) => item.value === status)?.label ?? status;
}

function formatSla(value: string | null): string {
  return value ? formatDateTime(value) : "Calculando prazo";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
