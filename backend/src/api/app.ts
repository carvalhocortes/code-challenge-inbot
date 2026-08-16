import { randomUUID } from "node:crypto";

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";

import type { ApiDependencies } from "./dependencies.js";
import { registerProblemDetails } from "./http/problem-details.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerTicketRoutes } from "./routes/tickets.js";

export type { ApiDependencies } from "./dependencies.js";

export interface ApiOptions {
  bodyLimit: number;
  corsOrigin: string;
  rateLimitMax: number;
  rateLimitWindowMs: number;
}

/** Configures the HTTP adapter from application dependencies. */
export function buildApi(
  dependencies: ApiDependencies,
  options: ApiOptions = defaultApiOptions(),
): FastifyInstance {
  const app = Fastify({
    bodyLimit: options.bodyLimit,
    logger: {
      base: {
        environment: process.env.NODE_ENV ?? "development",
        service: "api",
      },
      level: process.env.LOG_LEVEL ?? "info",
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
    origin: options.corsOrigin,
    methods: ["GET", "HEAD", "POST", "PATCH"],
    exposedHeaders: ["etag", "idempotency-replayed", "x-request-id"],
  });
  void app.register(helmet);
  void app.register(rateLimit, {
    global: false,
    max: options.rateLimitMax,
    timeWindow: options.rateLimitWindowMs,
  });
  app.after(() => {
    app.addHook("onRequest", app.rateLimit());
  });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  registerProblemDetails(app);
  registerTicketRoutes(app, dependencies);
  registerHealthRoutes(app, dependencies);
  app.addHook("onClose", () => dependencies.close());

  return app;
}

function defaultApiOptions(): ApiOptions {
  return {
    bodyLimit: 1_048_576,
    corsOrigin: "http://localhost:5173",
    rateLimitMax: 100,
    rateLimitWindowMs: 60_000,
  };
}
