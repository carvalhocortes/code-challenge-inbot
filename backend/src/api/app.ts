import { randomUUID } from "node:crypto";

import {
  createTicketRequestSchema,
  listTicketsQuerySchema,
  type ListTicketsResponse,
  type TicketResponse,
} from "@inbot/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import Fastify, { type FastifyInstance } from "fastify";

import { readRuntimeConfig } from "../config.js";
import type { Ticket } from "../domain/ticket.js";
import {
  type CreateTicketWithProcessingIntentCommand,
  type CreateTicketWithProcessingIntentResult,
  type TicketList,
  TicketRepository,
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
