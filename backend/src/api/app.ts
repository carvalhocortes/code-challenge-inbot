import { randomUUID } from "node:crypto";

import { createTicketRequestSchema, type TicketResponse } from "@inbot/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import Fastify, { type FastifyInstance } from "fastify";

import { readRuntimeConfig } from "../config.js";
import type { Ticket } from "../domain/ticket.js";
import {
  type CreateTicketWithProcessingIntentCommand,
  type CreateTicketWithProcessingIntentResult,
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

  app.post("/tickets", async (request, reply) => {
    const ticket = createTicketRequestSchema.parse(request.body);
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
      ticket,
    });

    reply.header("etag", etagFor(result.ticket.version));

    if (result.kind === "replayed") {
      reply.header("idempotency-replayed", "true");
    }

    return reply
      .code(result.kind === "created" ? 201 : 200)
      .send(toTicketResponse(result.ticket));
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
