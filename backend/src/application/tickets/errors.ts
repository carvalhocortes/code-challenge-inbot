export class IdempotencyKeyReusedError extends Error {
  constructor() {
    super("idempotency.key_reused");
    this.name = "IdempotencyKeyReusedError";
  }
}

export class TicketNotFoundError extends Error {
  constructor() {
    super("ticket.not_found");
    this.name = "TicketNotFoundError";
  }
}

export class TicketVersionConflictError extends Error {
  constructor() {
    super("ticket.version_conflict");
    this.name = "TicketVersionConflictError";
  }
}

export class TicketReprocessNotAllowedError extends Error {
  constructor() {
    super("ticket.reprocess_not_allowed");
    this.name = "TicketReprocessNotAllowedError";
  }
}
