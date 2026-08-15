import type { ListTicketsQuery } from "@inbot/shared";

import type {
  ChangeTicketPriorityCommand,
  CreateTicketCommand,
  CreateTicketResult,
  ReprocessTicketCommand,
  TicketCommandRepository,
  TicketDetail,
  TicketList,
  TicketQueryRepository,
  TicketUseCases,
  UpdateTicketStatusCommand,
} from "./contracts.js";

/** Coordinates ticket use cases without knowing how data is persisted. */
export class TicketApplicationService implements TicketUseCases {
  constructor(
    private readonly commands: TicketCommandRepository,
    private readonly queries: TicketQueryRepository,
  ) {}

  createTicketWithProcessingIntent(
    command: CreateTicketCommand,
  ): Promise<CreateTicketResult> {
    return this.commands.createTicketWithProcessingIntent(command);
  }

  updateTicketStatus(command: UpdateTicketStatusCommand) {
    return this.commands.updateTicketStatus(command);
  }

  changeTicketPriority(command: ChangeTicketPriorityCommand) {
    return this.commands.changeTicketPriority(command);
  }

  reprocessTicket(command: ReprocessTicketCommand) {
    return this.commands.reprocessTicket(command);
  }

  listTickets(query: ListTicketsQuery): Promise<TicketList> {
    return this.queries.listTickets(query);
  }

  getTicketDetail(ticketId: string): Promise<TicketDetail> {
    return this.queries.getTicketDetail(ticketId);
  }
}
