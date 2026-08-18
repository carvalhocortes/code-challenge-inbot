import {
  createTicketRequestSchema,
  listTicketsQuerySchema,
  type ListTicketsResponse,
  updateTicketPriorityRequestSchema,
  updateTicketStatusRequestSchema,
} from "@inbot/shared";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { TicketUseCases } from "../../application/tickets/contracts.js";
import type { Clock } from "../../domain/ticket.js";
import {
  sendPreconditionRequired,
  sendValidationProblem,
} from "../http/problem-details.js";
import {
  etagFor,
  sendTicketResponse,
  toTicketDetailResponse,
  toTicketResponse,
} from "../http/ticket-response.js";
import {
  parseIfMatch,
  parseTicketId,
  validationErrors,
} from "../http/request-parsing.js";

export interface TicketControllerDependencies {
  tickets: TicketUseCases;
  slaThresholds?: import("../../domain/sla-status.js").SlaThresholds;
  clock: Clock;
}

type TicketIdRoute = { Params: { id: string } };

/** Translates HTTP requests and responses for Ticket use cases. */
export class TicketController {
  constructor(private readonly dependencies: TicketControllerDependencies) {}

  readonly create = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedTicket = createTicketRequestSchema.safeParse(request.body);
    if (!parsedTicket.success) {
      return sendValidationProblem(
        request.url,
        request.id,
        reply,
        validationErrors(parsedTicket.error.issues),
      );
    }

    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
      return reply.type("application/problem+json").code(400).send({
        type: "/problems/idempotency-key-required",
        title: "Idempotency key required",
        status: 400,
        detail: "O header Idempotency-Key é obrigatório.",
        instance: request.url,
        code: "idempotency.key_required",
        requestId: request.id,
      });
    }

    const result =
      await this.dependencies.tickets.createTicketWithProcessingIntent({
        idempotencyKey,
        ticket: parsedTicket.data,
      });
    if (result.kind === "replayed") {
      reply.header("idempotency-replayed", "true");
    }
    return sendTicketResponse(
      reply,
      result.ticket,
      this.dependencies.clock.now(),
      this.dependencies.slaThresholds,
      201,
    );
  };

  readonly list = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedQuery = listTicketsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationProblem(
        request.url,
        request.id,
        reply,
        validationErrors(parsedQuery.error.issues, "query"),
      );
    }

    const result = await this.dependencies.tickets.listTickets(
      parsedQuery.data,
    );
    const now = this.dependencies.clock.now();
    const response: ListTicketsResponse = {
      items: result.items.map((ticket) =>
        toTicketResponse(ticket, now, this.dependencies.slaThresholds),
      ),
      meta: result.meta,
    };
    return reply.send(response);
  };

  readonly detail = async (
    request: FastifyRequest<TicketIdRoute>,
    reply: FastifyReply,
  ) => {
    const ticketId = parseTicketId(request.params.id);
    if (ticketId === undefined) {
      return sendInvalidTicketIdProblem(request.url, request.id, reply);
    }

    const result = await this.dependencies.tickets.getTicketDetail(ticketId);
    return reply
      .header("etag", etagFor(result.ticket.version))
      .send(
        toTicketDetailResponse(
          result.ticket,
          result.history,
          this.dependencies.clock.now(),
          this.dependencies.slaThresholds,
        ),
      );
  };

  readonly updateStatus = async (
    request: FastifyRequest<TicketIdRoute>,
    reply: FastifyReply,
  ) => {
    const ticketId = parseTicketId(request.params.id);
    if (ticketId === undefined) {
      return sendInvalidTicketIdProblem(request.url, request.id, reply);
    }
    const expectedVersion = parseIfMatch(request.headers["if-match"]);
    if (expectedVersion === undefined) {
      return sendPreconditionRequired(request.url, request.id, reply);
    }
    const parsedBody = updateTicketStatusRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendValidationProblem(
        request.url,
        request.id,
        reply,
        validationErrors(parsedBody.error.issues),
      );
    }
    const result = await this.dependencies.tickets.updateTicketStatus({
      ticketId,
      expectedVersion,
      status: parsedBody.data.status,
    });
    return sendTicketResponse(
      reply,
      result.ticket,
      this.dependencies.clock.now(),
      this.dependencies.slaThresholds,
    );
  };

  readonly reprocess = async (
    request: FastifyRequest<TicketIdRoute>,
    reply: FastifyReply,
  ) => {
    const ticketId = parseTicketId(request.params.id);
    if (ticketId === undefined) {
      return sendInvalidTicketIdProblem(request.url, request.id, reply);
    }
    const expectedVersion = parseIfMatch(request.headers["if-match"]);
    if (expectedVersion === undefined) {
      return sendPreconditionRequired(request.url, request.id, reply);
    }
    const ticket = await this.dependencies.tickets.reprocessTicket({
      ticketId,
      expectedVersion,
    });
    return sendTicketResponse(
      reply,
      ticket,
      this.dependencies.clock.now(),
      this.dependencies.slaThresholds,
      202,
    );
  };

  readonly updatePriority = async (
    request: FastifyRequest<TicketIdRoute>,
    reply: FastifyReply,
  ) => {
    const ticketId = parseTicketId(request.params.id);
    if (ticketId === undefined) {
      return sendInvalidTicketIdProblem(request.url, request.id, reply);
    }
    const expectedVersion = parseIfMatch(request.headers["if-match"]);
    if (expectedVersion === undefined) {
      return sendPreconditionRequired(request.url, request.id, reply);
    }
    const parsedBody = updateTicketPriorityRequestSchema.safeParse(
      request.body,
    );
    if (!parsedBody.success) {
      return sendValidationProblem(
        request.url,
        request.id,
        reply,
        validationErrors(parsedBody.error.issues),
      );
    }
    const result = await this.dependencies.tickets.changeTicketPriority({
      ticketId,
      expectedVersion,
      priority: parsedBody.data.priority,
    });
    return sendTicketResponse(
      reply,
      result.ticket,
      this.dependencies.clock.now(),
      this.dependencies.slaThresholds,
    );
  };
}

function sendInvalidTicketIdProblem(
  instance: string,
  requestId: string,
  reply: FastifyReply,
) {
  return sendValidationProblem(instance, requestId, reply, [
    { field: "id", reason: "invalid_format" },
  ]);
}
