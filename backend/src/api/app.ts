import { randomUUID } from "node:crypto";

import {
  createTicketRequestSchema,
  listTicketsQuerySchema,
  type ListTicketsResponse,
  type TicketDetailResponse,
  type TicketResponse,
  updateTicketPriorityRequestSchema,
  updateTicketStatusRequestSchema,
} from "@inbot/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import Fastify, { type FastifyInstance } from "fastify";

import { readRuntimeConfig } from "../config.js";
import { TicketDomainError, type Ticket } from "../domain/ticket.js";
import {
  type CreateTicketWithProcessingIntentCommand,
  type CreateTicketWithProcessingIntentResult,
  type ChangeTicketPriorityCommand,
  IdempotencyKeyReusedError,
  type TicketDetail,
  type TicketList,
  type UpdateTicketStatusCommand,
  TicketNotFoundError,
  TicketRepository,
  TicketVersionConflictError,
} from "../infrastructure/database/ticket-repository.js";
import * as schema from "../infrastructure/database/schema.js";
import {
  checkRuntimeDependencies,
  closeRuntimeDependencies,
  createRuntimeDependencies,
} from "../infrastructure/runtime-dependencies.js";

export interface ApiDependencies {
  tickets: {
    createTicketWithProcessingIntent(
      command: CreateTicketWithProcessingIntentCommand,
    ): Promise<CreateTicketWithProcessingIntentResult>;
    listTickets(
      query: Parameters<TicketRepository["listTickets"]>[0],
    ): Promise<TicketList>;
    getTicketDetail(ticketId: string): Promise<TicketDetail>;
    updateTicketStatus(
      command: UpdateTicketStatusCommand,
    ): ReturnType<TicketRepository["updateTicketStatus"]>;
    changeTicketPriority(
      command: ChangeTicketPriorityCommand,
    ): ReturnType<TicketRepository["changeTicketPriority"]>;
  };
  createTicketId(): string;
  checkReadiness(): Promise<void>;
  close(): Promise<void>;
}

export function buildApi(
  dependencies: ApiDependencies = createApiDependencies(),
): FastifyInstance {
  const app = Fastify({
    logger: true,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.setErrorHandler((error, request, reply) => {
    const problem = problemFor(error);

    if (problem !== undefined) {
      return reply
        .type("application/problem+json")
        .code(problem.status)
        .send({
          ...problem,
          instance: request.url,
          requestId: request.id,
        });
    }

    app.log.error(error, "Unhandled API error");
    return reply.type("application/problem+json").code(500).send({
      type: "/problems/internal-unexpected",
      title: "Internal server error",
      status: 500,
      detail: "Ocorreu um erro inesperado.",
      instance: request.url,
      code: "internal.unexpected",
      requestId: request.id,
    });
  });

  app.post("/tickets", async (request, reply) => {
    const parsedTicket = createTicketRequestSchema.safeParse(request.body);

    if (!parsedTicket.success) {
      return reply
        .type("application/problem+json")
        .code(422)
        .send({
          type: "/problems/request-validation-failed",
          title: "Request validation failed",
          status: 422,
          detail: "A requisição não atende ao contrato.",
          instance: request.url,
          code: "request.validation_failed",
          requestId: request.id,
          errors: parsedTicket.error.issues.map((issue) => ({
            field: issue.path.join(".") || "body",
            reason: validationReason(issue.code),
          })),
        });
    }

    const idempotencyKey = request.headers["idempotency-key"];

    if (typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
      return reply.code(400).send({
        type: "/problems/idempotency-key-required",
        title: "Idempotency key required",
        status: 400,
        detail: "O header Idempotency-Key é obrigatório.",
        instance: request.url,
        code: "idempotency.key_required",
        requestId: request.id,
      });
    }

    const result = await dependencies.tickets.createTicketWithProcessingIntent({
      ticketId: dependencies.createTicketId(),
      idempotencyKey,
      ticket: parsedTicket.data,
    });

    reply.header("etag", etagFor(result.ticket.version));

    if (result.kind === "replayed") {
      reply.header("idempotency-replayed", "true");
    }

    return reply
      .code(result.kind === "created" ? 201 : 200)
      .send(toTicketResponse(result.ticket));
  });

  app.get("/tickets", async (request, reply) => {
    const parsedQuery = listTicketsQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      return reply
        .type("application/problem+json")
        .code(422)
        .send({
          type: "/problems/request-validation-failed",
          title: "Request validation failed",
          status: 422,
          detail: "A requisição não atende ao contrato.",
          instance: request.url,
          code: "request.validation_failed",
          requestId: request.id,
          errors: parsedQuery.error.issues.map((issue) => ({
            field: issue.path.join(".") || "query",
            reason: validationReason(issue.code),
          })),
        });
    }

    const result = await dependencies.tickets.listTickets(parsedQuery.data);
    const response: ListTicketsResponse = {
      items: result.items.map(toTicketResponse),
      meta: result.meta,
    };

    return reply.send(response);
  });

  app.get<{ Params: { id: string } }>(
    "/tickets/:id",
    async (request, reply) => {
      const result = await dependencies.tickets.getTicketDetail(
        request.params.id,
      );
      const response: TicketDetailResponse = {
        ...toTicketResponse(result.ticket),
        history: result.history.map((entry) => ({
          ...entry,
          createdAt: entry.createdAt.toISOString(),
        })),
      };

      return reply
        .header("etag", etagFor(result.ticket.version))
        .send(response);
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/tickets/:id/status",
    async (request, reply) => {
      const expectedVersion = parseIfMatch(request.headers["if-match"]);

      if (expectedVersion === undefined) {
        return reply.type("application/problem+json").code(428).send({
          type: "/problems/ticket-precondition-required",
          title: "Ticket precondition required",
          status: 428,
          detail: "O header If-Match é obrigatório.",
          instance: request.url,
          code: "ticket.precondition_required",
          requestId: request.id,
        });
      }

      const parsedBody = updateTicketStatusRequestSchema.safeParse(
        request.body,
      );

      if (!parsedBody.success) {
        return reply
          .type("application/problem+json")
          .code(422)
          .send({
            type: "/problems/request-validation-failed",
            title: "Request validation failed",
            status: 422,
            detail: "A requisição não atende ao contrato.",
            instance: request.url,
            code: "request.validation_failed",
            requestId: request.id,
            errors: parsedBody.error.issues.map((issue) => ({
              field: issue.path.join(".") || "body",
              reason: validationReason(issue.code),
            })),
          });
      }

      const result = await dependencies.tickets.updateTicketStatus({
        ticketId: request.params.id,
        expectedVersion,
        status: parsedBody.data.status,
      });

      return reply
        .header("etag", etagFor(result.ticket.version))
        .send(toTicketResponse(result.ticket));
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/tickets/:id/priority",
    async (request, reply) => {
      const expectedVersion = parseIfMatch(request.headers["if-match"]);

      if (expectedVersion === undefined) {
        return reply.type("application/problem+json").code(428).send({
          type: "/problems/ticket-precondition-required",
          title: "Ticket precondition required",
          status: 428,
          detail: "O header If-Match é obrigatório.",
          instance: request.url,
          code: "ticket.precondition_required",
          requestId: request.id,
        });
      }

      const parsedBody = updateTicketPriorityRequestSchema.safeParse(
        request.body,
      );

      if (!parsedBody.success) {
        return reply
          .type("application/problem+json")
          .code(422)
          .send({
            type: "/problems/request-validation-failed",
            title: "Request validation failed",
            status: 422,
            detail: "A requisição não atende ao contrato.",
            instance: request.url,
            code: "request.validation_failed",
            requestId: request.id,
            errors: parsedBody.error.issues.map((issue) => ({
              field: issue.path.join(".") || "body",
              reason: validationReason(issue.code),
            })),
          });
      }

      const result = await dependencies.tickets.changeTicketPriority({
        ticketId: request.params.id,
        expectedVersion,
        priority: parsedBody.data.priority,
      });

      return reply
        .header("etag", etagFor(result.ticket.version))
        .send(toTicketResponse(result.ticket));
    },
  );

  app.get("/health/live", async () => ({ status: "live" }));

  app.get("/health/ready", async (_request, reply) => {
    try {
      await dependencies.checkReadiness();
      return { status: "ready" };
    } catch (error) {
      app.log.error(error, "Runtime dependency is not ready");
      return reply.code(503).send({ status: "not_ready" });
    }
  });

  app.addHook("onClose", async () => {
    await dependencies.close();
  });

  return app;
}

function createApiDependencies(): ApiDependencies {
  const config = readRuntimeConfig();
  const runtimeDependencies = createRuntimeDependencies(config);
  const database = drizzle(runtimeDependencies.postgres, { schema });

  return {
    tickets: new TicketRepository(database, { now: () => new Date() }),
    createTicketId: randomUUID,
    checkReadiness: () => checkRuntimeDependencies(runtimeDependencies),
    close: () => closeRuntimeDependencies(runtimeDependencies),
  };
}

function etagFor(version: number): string {
  return `"${version}"`;
}

function toTicketResponse(ticket: Ticket): TicketResponse {
  return {
    ...ticket,
    slaDueAt: ticket.slaDueAt?.toISOString() ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

function validationReason(issueCode: string): string {
  if (issueCode === "too_small" || issueCode === "too_big") {
    return "invalid_length";
  }

  if (issueCode === "invalid_string") {
    return "invalid_format";
  }

  return "invalid_value";
}

function parseIfMatch(
  header: string | string[] | undefined,
): number | undefined {
  if (typeof header !== "string") {
    return undefined;
  }

  const match = /^"([1-9]\d*)"$/.exec(header);
  const version = match?.[1];

  return version === undefined ? undefined : Number.parseInt(version, 10);
}

function problemFor(error: unknown):
  | {
      type: string;
      title: string;
      status: 404 | 409 | 412;
      detail: string;
      code: string;
    }
  | undefined {
  if (error instanceof TicketNotFoundError) {
    return {
      type: "/problems/ticket-not-found",
      title: "Ticket not found",
      status: 404,
      detail: "O Ticket não foi encontrado.",
      code: "ticket.not_found",
    };
  }

  if (error instanceof TicketVersionConflictError) {
    return {
      type: "/problems/ticket-version-conflict",
      title: "Ticket version conflict",
      status: 412,
      detail: "O Ticket foi alterado por outra operação.",
      code: "ticket.version_conflict",
    };
  }

  if (error instanceof IdempotencyKeyReusedError) {
    return {
      type: "/problems/idempotency-key-reused",
      title: "Idempotency key reused",
      status: 409,
      detail: "A chave de idempotência foi usada com outro payload.",
      code: "idempotency.key_reused",
    };
  }

  if (error instanceof TicketDomainError) {
    return {
      type: `/problems/${error.code.replace(".", "-")}`,
      title:
        error.code === "ticket.closed"
          ? "Ticket closed"
          : "Ticket status transition invalid",
      status: 409,
      detail:
        error.code === "ticket.closed"
          ? "A operação não é permitida em Ticket fechado."
          : "A transição de status não é permitida.",
      code: error.code,
    };
  }
}
