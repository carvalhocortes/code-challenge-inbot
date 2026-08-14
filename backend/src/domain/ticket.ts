export type TicketPriority = "critical" | "high" | "medium" | "low";
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketProcessingStatus =
  | "pending"
  | "processing"
  | "processed"
  | "failed";

export interface Clock {
  now(): Date;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  requesterEmail: string;
  priority: TicketPriority;
  status: TicketStatus;
  processingStatus: TicketProcessingStatus;
  slaDueAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TicketStatusTransition =
  | { kind: "noop"; ticket: Ticket }
  | { kind: "changed"; previousStatus: TicketStatus; ticket: Ticket };

export type TicketPriorityChange =
  | { kind: "noop"; ticket: Ticket }
  | { kind: "changed"; previousPriority: TicketPriority; ticket: Ticket };

const allowedStatusTransitions: Readonly<
  Record<TicketStatus, readonly TicketStatus[]>
> = {
  open: ["in_progress"],
  in_progress: ["resolved"],
  resolved: ["in_progress", "closed"],
  closed: [],
};

export class TicketDomainError extends Error {
  constructor(
    readonly code: "ticket.status_transition_invalid" | "ticket.closed",
  ) {
    super(code);
    this.name = "TicketDomainError";
  }
}

export function transitionTicketStatus(
  ticket: Ticket,
  nextStatus: TicketStatus,
  clock: Clock,
): TicketStatusTransition {
  if (ticket.status === nextStatus) {
    return { kind: "noop", ticket };
  }

  if (!allowedStatusTransitions[ticket.status].includes(nextStatus)) {
    throw new TicketDomainError("ticket.status_transition_invalid");
  }

  return {
    kind: "changed",
    previousStatus: ticket.status,
    ticket: {
      ...ticket,
      status: nextStatus,
      version: ticket.version + 1,
      updatedAt: clock.now(),
    },
  };
}

export function changeTicketPriority(
  ticket: Ticket,
  nextPriority: TicketPriority,
  clock: Clock,
): TicketPriorityChange {
  if (ticket.status === "closed") {
    throw new TicketDomainError("ticket.closed");
  }

  if (ticket.priority === nextPriority) {
    return { kind: "noop", ticket };
  }

  return {
    kind: "changed",
    previousPriority: ticket.priority,
    ticket: {
      ...ticket,
      priority: nextPriority,
      processingStatus: "pending",
      version: ticket.version + 1,
      updatedAt: clock.now(),
    },
  };
}
