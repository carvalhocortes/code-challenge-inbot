import type { FastifyReply, FastifyRequest } from "fastify";

import { errorContext } from "../logging.js";

export interface HealthControllerDependencies {
  checkReadiness(): Promise<void>;
}

/** Translates health probes into HTTP responses. */
export class HealthController {
  constructor(private readonly dependencies: HealthControllerDependencies) {}

  readonly live = async () => ({ status: "live" as const });

  readonly ready = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await this.dependencies.checkReadiness();
      return { status: "ready" as const };
    } catch (error) {
      request.log.error(
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
  };
}
