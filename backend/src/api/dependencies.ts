import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";

import { TicketApplicationService } from "../application/tickets/ticket-application-service.js";
import type { TicketUseCases } from "../application/tickets/contracts.js";
import type { RuntimeConfig } from "../config.js";
import type { SlaThresholds } from "../domain/sla-status.js";
import * as schema from "../infrastructure/database/schema.js";
import { PostgresTicketRepository } from "../infrastructure/database/ticket-repository.js";
import {
  checkRuntimeDependencies,
  closeRuntimeDependencies,
  createRuntimeDependencies,
} from "../infrastructure/runtime-dependencies.js";

export interface ApiDependencies {
  tickets: TicketUseCases;
  slaThresholds?: SlaThresholds;
  createTicketId(): string;
  checkReadiness(): Promise<void>;
  close(): Promise<void>;
}

/** Composition root: the only HTTP-side location that selects adapters. */
export function createApiDependencies(config: RuntimeConfig): ApiDependencies {
  const runtimeDependencies = createRuntimeDependencies(config);
  const database = drizzle(runtimeDependencies.postgres, { schema });
  const clock = { now: () => new Date() };
  const slaThresholds: SlaThresholds = {
    criticalPercent: config.slaCriticalThresholdPercent,
    alertPercent: config.slaAlertThresholdPercent,
  };
  const tickets = new PostgresTicketRepository(database, clock, slaThresholds);

  return {
    tickets: new TicketApplicationService(tickets, tickets),
    slaThresholds,
    createTicketId: randomUUID,
    checkReadiness: () => checkRuntimeDependencies(runtimeDependencies),
    close: () => closeRuntimeDependencies(runtimeDependencies),
  };
}
