import type { CreateTicketRequest, ListTicketsQuery } from "@inbot/shared";

import type {
  Ticket,
  TicketPriority,
  TicketPriorityChange,
  TicketStatus,
  TicketStatusTransition,
} from "../../domain/ticket.js";

export interface CreateTicketCommand {
  ticketId: string;
  idempotencyKey: string;
  ticket: CreateTicketRequest;
}

export type CreateTicketResult =
  | { kind: "created"; ticket: Ticket }
  | { kind: "replayed"; ticket: Ticket };

export interface UpdateTicketStatusCommand {
  ticketId: string;
  expectedVersion: number;
  status: TicketStatus;
}

export interface ChangeTicketPriorityCommand {
  ticketId: string;
  expectedVersion: number;
  priority: TicketPriority;
}

export interface ReprocessTicketCommand {
  ticketId: string;
  expectedVersion: number;
}

export interface TicketList {
  items: Ticket[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface TicketHistoryEntry {
  id: string;
  type: "created" | "status_changed" | "priority_changed";
  previousValue: string | null;
  nextValue: string | null;
  source: "operator" | "system";
  createdAt: Date;
}

export interface TicketDetail {
  ticket: Ticket;
  history: TicketHistoryEntry[];
}

export interface TicketCommandRepository {
  createTicketWithProcessingIntent(
    command: CreateTicketCommand,
  ): Promise<CreateTicketResult>;
  updateTicketStatus(
    command: UpdateTicketStatusCommand,
  ): Promise<TicketStatusTransition>;
  changeTicketPriority(
    command: ChangeTicketPriorityCommand,
  ): Promise<TicketPriorityChange>;
  reprocessTicket(command: ReprocessTicketCommand): Promise<Ticket>;
}

export interface TicketQueryRepository {
  listTickets(query: ListTicketsQuery): Promise<TicketList>;
  getTicketDetail(ticketId: string): Promise<TicketDetail>;
}

export interface TicketUseCases
  extends TicketCommandRepository,
    TicketQueryRepository {}
