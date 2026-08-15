import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
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
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";

import { readRuntimeConfig, type RuntimeConfig } from "../config.js";
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
  type ReprocessTicketCommand,
  TicketReprocessNotAllowedError,
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
    reprocessTicket(command: ReprocessTicketCommand): Promise<Ticket>;
  };
  createTicketId(): string;
  checkReadiness(): Promise<void>;
  close(): Promise<void>;
}

export interface ApiOptions {
  bodyLimit: number;
  corsOrigin: string;
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

export function buildApi(
  dependencies?: ApiDependencies,
  options?: ApiOptions,
): FastifyInstance {
  const config = dependencies === undefined ? readRuntimeConfig() : undefined;
  const resolvedDependencies =
    dependencies ?? createApiDependencies(config as RuntimeConfig);
  const apiOptions = options ?? optionsFromConfig(config);
  const app = Fastify({
    bodyLimit: apiOptions.bodyLimit,
    logger: {
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body.requesterEmail",
          "req.body.description",
        ],
        remove: true,
      },
    },
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });

  void app.register(cors, {
    origin: apiOptions.corsOrigin,
    exposedHeaders: ["etag", "idempotency-replayed", "x-request-id"],
  });
  void app.register(helmet);
  void app.register(rateLimit, {
    global: false,
    max: apiOptions.rateLimitMax,
    timeWindow: apiOptions.rateLimitWindowMs,
  });
  app.after(() => {
    app.addHook("onRequest", app.rateLimit());
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

    app.log.error(
      { errorName: errorName(error), requestId: request.id },
      "Unhandled API error",
    );
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
      await resolvedDependencies.tickets.createTicketWithProcessingIntent({
        ticketId: resolvedDependencies.createTicketId(),
        idempotencyKey,
        ticket: parsedTicket.data,
      });

    reply.header("etag", etagFor(result.ticket.version));

    if (result.kind === "replayed") {
      reply.header("idempotency-replayed", "true");
    }

    return reply.code(201).send(toTicketResponse(result.ticket));
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

    const result = await resolvedDependencies.tickets.listTickets(
      parsedQuery.data,
    );
    const response: ListTicketsResponse = {
      items: result.items.map(toTicketResponse),
      meta: result.meta,
    };

    return reply.send(response);
  });

  app.get<{ Params: { id: string } }>(
    "/tickets/:id",
    async (request, reply) => {
      if (!isUuid(request.params.id)) {
        return sendInvalidTicketIdProblem(request.url, request.id, reply);
      }

      const result = await resolvedDependencies.tickets.getTicketDetail(
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
      if (!isUuid(request.params.id)) {
        return sendInvalidTicketIdProblem(request.url, request.id, reply);
      }

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

      const result = await resolvedDependencies.tickets.updateTicketStatus({
        ticketId: request.params.id,
        expectedVersion,
        status: parsedBody.data.status,
      });

      return reply
        .header("etag", etagFor(result.ticket.version))
        .send(toTicketResponse(result.ticket));
    },
  );

  app.post<{ Params: { id: string } }>(
    "/tickets/:id/reprocess",
    async (request, reply) => {
      if (!isUuid(request.params.id)) {
        return sendInvalidTicketIdProblem(request.url, request.id, reply);
      }

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

      const ticket = await resolvedDependencies.tickets.reprocessTicket({
        ticketId: request.params.id,
        expectedVersion,
      });

      return reply
        .header("etag", etagFor(ticket.version))
        .code(202)
        .send(toTicketResponse(ticket));
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/tickets/:id/priority",
    async (request, reply) => {
      if (!isUuid(request.params.id)) {
        return sendInvalidTicketIdProblem(request.url, request.id, reply);
      }

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

      const result = await resolvedDependencies.tickets.changeTicketPriority({
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
      await resolvedDependencies.checkReadiness();
      return { status: "ready" };
    } catch (error) {
      app.log.error(
        { errorName: errorName(error), requestId: _request.id },
        "Runtime dependency is not ready",
      );
      return reply.type("application/problem+json").code(503).send({
        type: "/problems/dependency-unavailable",
        title: "Dependency unavailable",
        status: 503,
        detail: "Uma dependência necessária não está disponível.",
        instance: "/health/ready",
        code: "dependency.unavailable",
        requestId: _request.id,
      });
    }
  });

  app.addHook("onClose", async () => {
    await resolvedDependencies.close();
  });

  return app;
}

function createApiDependencies(config: RuntimeConfig): ApiDependencies {
  const runtimeDependencies = createRuntimeDependencies(config);
  const database = drizzle(runtimeDependencies.postgres, { schema });

  return {
    tickets: new TicketRepository(database, { now: () => new Date() }),
    createTicketId: randomUUID,
    checkReadiness: () => checkRuntimeDependencies(runtimeDependencies),
    close: () => closeRuntimeDependencies(runtimeDependencies),
  };
}

function optionsFromConfig(config: RuntimeConfig | undefined): ApiOptions {
  if (config !== undefined) {
    return {
      bodyLimit: config.requestBodyLimitBytes,
      corsOrigin: config.corsOrigin,
      rateLimitMax: config.rateLimitMax,
      rateLimitWindowMs: config.rateLimitWindowMs,
    };
  }

  return {
    bodyLimit: 1_048_576,
    corsOrigin: "http://localhost:5173",
    rateLimitMax: 100,
    rateLimitWindowMs: 60_000,
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
  return reply
    .type("application/problem+json")
    .code(422)
    .send({
      type: "/problems/request-validation-failed",
      title: "Request validation failed",
      status: 422,
      detail: "A requisição não atende ao contrato.",
      instance,
      code: "request.validation_failed",
      requestId,
      errors: [{ field: "id", reason: "invalid_format" }],
    });
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

function problemFor(error: unknown):
  | {
      type: string;
      title: string;
      status: 400 | 404 | 409 | 412 | 413 | 429;
      detail: string;
      code: string;
    }
  | undefined {
  if (
    error instanceof SyntaxError &&
    (error as SyntaxError & { statusCode?: number }).statusCode === 400
  ) {
    return {
      type: "/problems/request-invalid-json",
      title: "Request invalid JSON",
      status: 400,
      detail: "O corpo da requisição contém JSON inválido.",
      code: "request.invalid_json",
    };
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "FST_ERR_CTP_BODY_TOO_LARGE"
  ) {
    return {
      type: "/problems/request-body-too-large",
      title: "Request body too large",
      status: 413,
      detail: "O corpo da requisição excede o limite permitido.",
      code: "request.body_too_large",
    };
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 429
  ) {
    return {
      type: "/problems/rate-limit-exceeded",
      title: "Rate limit exceeded",
      status: 429,
      detail: "Muitas requisições; tente novamente mais tarde.",
      code: "rate_limit.exceeded",
    };
  }
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

  if (error instanceof TicketReprocessNotAllowedError) {
    return {
      type: "/problems/ticket-reprocess-not-allowed",
      title: "Ticket reprocess not allowed",
      status: 409,
      detail: "O Ticket não pode ser reprocessado no estado atual.",
      code: "ticket.reprocess_not_allowed",
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
