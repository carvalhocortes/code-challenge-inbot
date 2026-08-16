import type { FastifyInstance } from "fastify";

import type { ApiDependencies } from "../dependencies.js";
import { errorContext } from "../logging.js";

export function registerHealthRoutes(
  app: FastifyInstance,
  dependencies: ApiDependencies,
): void {
  app.get("/health/live", async () => ({ status: "live" }));
  app.get("/health/ready", async (request, reply) => {
    try {
      await dependencies.checkReadiness();
      return { status: "ready" };
    } catch (error) {
      app.log.error(
        {
          ...errorContext(error),
          requestId: request.id,
        },
        "Runtime dependency is not ready",
      );
      return reply.type("application/problem+json").code(503).send({
        type: "/problems/dependency-unavailable",
        title: "Dependency unavailable",
        status: 503,
        detail: "Uma dependência necessária não está disponível.",
        instance: "/health/ready",
        code: "dependency.unavailable",
        requestId: request.id,
      });
    }
  });
}
