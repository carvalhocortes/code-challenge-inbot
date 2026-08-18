import type { FastifyInstance } from "fastify";

import { HealthController } from "../controllers/health-controller.js";

export function registerHealthRoutes(
  app: FastifyInstance,
  controller: HealthController,
): void {
  app.get("/health/live", controller.live);
  app.get("/health/ready", controller.ready);
}
