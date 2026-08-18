import type { FastifyInstance } from "fastify";

import { TicketController } from "../controllers/ticket-controller.js";

export function registerTicketRoutes(
  app: FastifyInstance,
  controller: TicketController,
): void {
  app.post("/tickets", controller.create);
  app.get("/tickets", controller.list);
  app.get<{ Params: { id: string } }>("/tickets/:id", controller.detail);
  app.patch<{ Params: { id: string } }>(
    "/tickets/:id/status",
    controller.updateStatus,
  );
  app.post<{ Params: { id: string } }>(
    "/tickets/:id/reprocess",
    controller.reprocess,
  );
  app.patch<{ Params: { id: string } }>(
    "/tickets/:id/priority",
    controller.updatePriority,
  );
}
