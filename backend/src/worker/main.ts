import { drizzle } from "drizzle-orm/node-postgres";

import { readRuntimeConfig } from "../config.js";
import * as schema from "../infrastructure/database/schema.js";
import { OutboxDispatcher } from "../infrastructure/outbox/dispatcher.js";
import { createTicketSlaQueue } from "../infrastructure/queue/ticket-sla-queue.js";
import {
  checkRuntimeDependencies,
  closeRuntimeDependencies,
  createRuntimeDependencies,
} from "../infrastructure/runtime-dependencies.js";
import {
  createTicketSlaWorker,
  TicketSlaProcessor,
} from "./ticket-sla-worker.js";

const config = readRuntimeConfig();
const dependencies = createRuntimeDependencies(config);

await checkRuntimeDependencies(dependencies);

const db = drizzle(dependencies.postgres, { schema });
const queue = createTicketSlaQueue(dependencies.redis);
const processor = new TicketSlaProcessor(db, {
  holidays: async () => new Set(),
});
const worker = createTicketSlaWorker(dependencies.redis, processor);
const dispatcher = new OutboxDispatcher(
  db,
  queue,
  { now: () => new Date() },
  {
    batchSize: config.outboxBatchSize,
    leaseMs: config.outboxLeaseMs,
  },
);

async function dispatch(): Promise<void> {
  try {
    await dispatcher.dispatchOnce();
  } catch (error) {
    process.stderr.write(`Outbox dispatch failed: ${String(error)}\n`);
  }
}

await dispatch();
const dispatchInterval = setInterval(
  () => void dispatch(),
  config.outboxPollIntervalMs,
);

await new Promise<void>((resolve) => {
  process.once("SIGINT", resolve);
  process.once("SIGTERM", resolve);
});

clearInterval(dispatchInterval);
await worker.close();
await queue.close();
await closeRuntimeDependencies(dependencies);
