import {
  createTicketRequestSchema,
  listTicketsQuerySchema,
  type ListTicketsResponse,
  type TicketDetailResponse,
  updateTicketPriorityRequestSchema,
  updateTicketStatusRequestSchema,
} from "@inbot/shared";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { TicketUseCases } from "../../application/tickets/contracts.js";
import type { SlaThresholds } from "../../domain/sla-status.js";
import {
  sendPreconditionRequired,
  sendValidationProblem,
  validationReason,
} from "../http/problem-details.js";
import { etagFor, toTicketResponse } from "../http/ticket-response.js";

export interface TicketControllerDependencies {
  tickets: TicketUseCases;
  slaThresholds?: SlaThresholds;
  createTicketId(): string;
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
        parsedTicket.error.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          reason: validationReason(issue.code),
        })),
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
        ticketId: this.dependencies.createTicketId(),
        idempotencyKey,
        ticket: parsedTicket.data,
      });
    reply.header("etag", etagFor(result.ticket.version));
    if (result.kind === "replayed") {
      reply.header("idempotency-replayed", "true");
    }
    return reply
      .code(201)
      .send(
        toTicketResponse(
          result.ticket,
          new Date(),
          this.dependencies.slaThresholds,
        ),
      );
  };

  readonly list = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedQuery = listTicketsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationProblem(
        request.url,
        request.id,
        reply,
        parsedQuery.error.issues.map((issue) => ({
          field: issue.path.join(".") || "query",
          reason: validationReason(issue.code),
        })),
      );
    }

    const result = await this.dependencies.tickets.listTickets(
      parsedQuery.data,
    );
    const response: ListTicketsResponse = {
      items: result.items.map((ticket) =>
        toTicketResponse(ticket, new Date(), this.dependencies.slaThresholds),
      ),
      meta: result.meta,
    };
    return reply.send(response);
  };

  readonly detail = async (
    request: FastifyRequest<TicketIdRoute>,
    reply: FastifyReply,
  ) => {
    if (!isUuid(request.params.id)) {
      return sendInvalidTicketIdProblem(request.url, request.id, reply);
    }
    const result = await this.dependencies.tickets.getTicketDetail(
      request.params.id,
    );
    const response: TicketDetailResponse = {
      ...toTicketResponse(
        result.ticket,
        new Date(),
        this.dependencies.slaThresholds,
      ),
      history: result.history.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
    return reply.header("etag", etagFor(result.ticket.version)).send(response);
  };

  readonly updateStatus = async (
    request: FastifyRequest<TicketIdRoute>,
    reply: FastifyReply,
  ) => {
    if (!isUuid(request.params.id)) {
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
        parsedBody.error.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          reason: validationReason(issue.code),
        })),
      );
    }
    const result = await this.dependencies.tickets.updateTicketStatus({
      ticketId: request.params.id,
      expectedVersion,
      status: parsedBody.data.status,
    });
    return reply
      .header("etag", etagFor(result.ticket.version))
      .send(
        toTicketResponse(
          result.ticket,
          new Date(),
          this.dependencies.slaThresholds,
        ),
      );
  };

  readonly reprocess = async (
    request: FastifyRequest<TicketIdRoute>,
    reply: FastifyReply,
  ) => {
    if (!isUuid(request.params.id)) {
      return sendInvalidTicketIdProblem(request.url, request.id, reply);
    }
    const expectedVersion = parseIfMatch(request.headers["if-match"]);
    if (expectedVersion === undefined) {
      return sendPreconditionRequired(request.url, request.id, reply);
    }
    const ticket = await this.dependencies.tickets.reprocessTicket({
      ticketId: request.params.id,
      expectedVersion,
    });
    return reply
      .header("etag", etagFor(ticket.version))
      .code(202)
      .send(
        toTicketResponse(ticket, new Date(), this.dependencies.slaThresholds),
      );
  };

  readonly updatePriority = async (
    request: FastifyRequest<TicketIdRoute>,
    reply: FastifyReply,
  ) => {
    if (!isUuid(request.params.id)) {
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
        parsedBody.error.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          reason: validationReason(issue.code),
        })),
      );
    }
    const result = await this.dependencies.tickets.changeTicketPriority({
      ticketId: request.params.id,
      expectedVersion,
      priority: parsedBody.data.priority,
    });
    return reply
      .header("etag", etagFor(result.ticket.version))
      .send(
        toTicketResponse(
          result.ticket,
          new Date(),
          this.dependencies.slaThresholds,
        ),
      );
  };
}

function parseIfMatch(
  header: string | string[] | undefined,
): number | undefined {
  if (typeof header !== "string") {
    return undefined;
  }
  const version = /^"([1-9]\d*)"$/.exec(header)?.[1];
  return version === undefined ? undefined : Number.parseInt(version, 10);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
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
