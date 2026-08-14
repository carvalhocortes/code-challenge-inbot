import Fastify, { type FastifyInstance } from "fastify";

import { readRuntimeConfig } from "../config.js";
import {
  checkRuntimeDependencies,
  closeRuntimeDependencies,
  createRuntimeDependencies,
} from "../infrastructure/runtime-dependencies.js";

export function buildApi(): FastifyInstance {
  const config = readRuntimeConfig();
  const dependencies = createRuntimeDependencies(config);
  const app = Fastify({ logger: true });

  app.get("/health/live", async () => ({ status: "live" }));

  app.get("/health/ready", async (_request, reply) => {
    try {
      await checkRuntimeDependencies(dependencies);
      return { status: "ready" };
    } catch (error) {
      app.log.error(error, "Runtime dependency is not ready");
      return reply.code(503).send({ status: "not_ready" });
    }
  });

  app.addHook("onClose", async () => {
    await closeRuntimeDependencies(dependencies);
  });

  return app;
}
