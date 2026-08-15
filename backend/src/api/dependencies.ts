import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";

import { TicketApplicationService } from "../application/tickets/ticket-application-service.js";
import type { TicketUseCases } from "../application/tickets/contracts.js";
import type { RuntimeConfig } from "../config.js";
import * as schema from "../infrastructure/database/schema.js";
import { PostgresTicketRepository } from "../infrastructure/database/ticket-repository.js";
import {
  checkRuntimeDependencies,
  closeRuntimeDependencies,
  createRuntimeDependencies,
} from "../infrastructure/runtime-dependencies.js";

export interface ApiDependencies {
  tickets: TicketUseCases;
  createTicketId(): string;
  checkReadiness(): Promise<void>;
  close(): Promise<void>;
}

/** Composition root: the only HTTP-side location that selects adapters. */
export function createApiDependencies(config: RuntimeConfig): ApiDependencies {
  const runtimeDependencies = createRuntimeDependencies(config);
  const database = drizzle(runtimeDependencies.postgres, { schema });
  const tickets = new PostgresTicketRepository(database, {
    now: () => new Date(),
  });

  return {
    tickets: new TicketApplicationService(tickets, tickets),
    createTicketId: randomUUID,
    checkReadiness: () => checkRuntimeDependencies(runtimeDependencies),
    close: () => closeRuntimeDependencies(runtimeDependencies),
  };
}
