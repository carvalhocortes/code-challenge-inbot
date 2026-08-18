import type {
  ChangeTicketPriorityCommand,
  CreateTicketCommand,
  CreateTicketResult,
  ReprocessTicketCommand,
  TicketCommandRepository,
  TicketDetail,
  TicketList,
  ListTicketsQuery,
  TicketQueryRepository,
  UpdateTicketStatusCommand,
} from "../../application/tickets/contracts.js";
import type {
  Clock,
  Ticket,
  TicketPriorityChange,
  TicketStatusTransition,
} from "../../domain/ticket.js";
import type { SlaThresholds } from "../../domain/sla-status.js";
import type { Database } from "./database.js";
import { PostgresTicketCommandRepository } from "./ticket-command-repository.js";
import { PostgresTicketQueryRepository } from "./ticket-query-repository.js";

/** Compatibility facade over the focused PostgreSQL command/query adapters. */
export class PostgresTicketRepository
  implements TicketCommandRepository, TicketQueryRepository
{
  private readonly commands: PostgresTicketCommandRepository;
  private readonly queries: PostgresTicketQueryRepository;

  constructor(db: Database, clock: Clock, slaThresholds?: SlaThresholds) {
    this.commands = new PostgresTicketCommandRepository(db, clock);
    this.queries = new PostgresTicketQueryRepository(db, clock, slaThresholds);
  }

  createTicketWithProcessingIntent(
    command: CreateTicketCommand,
  ): Promise<CreateTicketResult> {
    return this.commands.createTicketWithProcessingIntent(command);
  }

  updateTicketStatus(
    command: UpdateTicketStatusCommand,
  ): Promise<TicketStatusTransition> {
    return this.commands.updateTicketStatus(command);
  }

  changeTicketPriority(
    command: ChangeTicketPriorityCommand,
  ): Promise<TicketPriorityChange> {
    return this.commands.changeTicketPriority(command);
  }

  reprocessTicket(command: ReprocessTicketCommand): Promise<Ticket> {
    return this.commands.reprocessTicket(command);
  }

  listTickets(query: ListTicketsQuery): Promise<TicketList> {
    return this.queries.listTickets(query);
  }

  getTicketDetail(ticketId: string): Promise<TicketDetail> {
    return this.queries.getTicketDetail(ticketId);
  }
}
