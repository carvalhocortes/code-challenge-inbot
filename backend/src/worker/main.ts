import { drizzle } from "drizzle-orm/node-postgres";

import { readRuntimeConfig } from "../config.js";
import { TicketSlaProcessingService } from "../application/tickets/sla-processing.js";
import { PostgresTicketSlaProcessingStore } from "../infrastructure/database/postgres-ticket-sla-processing-store.js";
import * as schema from "../infrastructure/database/schema.js";
import {
  BrasilApiHolidayProvider,
  CachedHolidayProvider,
  FakeHolidayProvider,
} from "../infrastructure/holidays/holiday-provider.js";
import { OutboxDispatcher } from "../infrastructure/outbox/dispatcher.js";
import { createTicketSlaQueue } from "../infrastructure/queue/ticket-sla-queue.js";
import {
  checkRuntimeDependencies,
  closeRuntimeDependencies,
  createRuntimeDependencies,
} from "../infrastructure/runtime-dependencies.js";
import { createTicketSlaWorker } from "../infrastructure/queue/bullmq-ticket-sla-worker.js";
import {
  createLogger,
  errorContext,
} from "../infrastructure/observability/logger.js";

const logger = createLogger("worker");
let config: ReturnType<typeof readRuntimeConfig>;

try {
  config = readRuntimeConfig();
} catch (error) {
  logger.error(
    { ...errorContext(error), event: "worker.configuration_failed" },
    "Worker configuration failed",
  );
  throw error;
}

logger.info(
  {
    event: "worker.starting",
    holidayProviderMode: config.holidayProviderMode,
    outboxBatchSize: config.outboxBatchSize,
    outboxPollIntervalMs: config.outboxPollIntervalMs,
    slaRetryAttempts: config.slaRetryAttempts,
  },
  "SLA Worker starting",
);
const dependencies = createRuntimeDependencies(config);

try {
  await checkRuntimeDependencies(dependencies);
  logger.info(
    { event: "worker.dependencies_ready" },
    "Worker runtime dependencies are ready",
  );
} catch (error) {
  logger.error(
    { ...errorContext(error), event: "worker.dependencies_unavailable" },
    "Worker runtime dependencies are unavailable",
  );
  throw error;
}

const db = drizzle(dependencies.postgres, { schema });
const queue = createTicketSlaQueue(dependencies.redis, {
  attempts: config.slaRetryAttempts,
  backoffMs: config.slaRetryBackoffMs,
});
const holidaySource =
  config.holidayProviderMode === "brasil-api"
    ? new BrasilApiHolidayProvider({ timeoutMs: config.brasilApiTimeoutMs })
    : new FakeHolidayProvider({ mode: config.holidayProviderMode });
const holidays = new CachedHolidayProvider(holidaySource, {
  now: () => new Date(),
  ttlMs: config.holidayCacheTtlMs,
});
const processor = new TicketSlaProcessingService(
  new PostgresTicketSlaProcessingStore(db),
  holidays,
  { slaHoursByPriority: config.slaHoursByPriority },
);
const worker = createTicketSlaWorker(dependencies.redis, processor, logger);
const dispatcher = new OutboxDispatcher(
  db,
  queue,
  { now: () => new Date() },
  {
    batchSize: config.outboxBatchSize,
    leaseMs: config.outboxLeaseMs,
  },
  logger,
);

async function dispatch(): Promise<void> {
  try {
    const published = await dispatcher.dispatchOnce();
    if (published > 0) {
      logger.info(
        { event: "outbox.dispatch.completed", publishedCount: published },
        "Outbox dispatch completed",
      );
    }
  } catch (error) {
    logger.error(
      { ...errorContext(error), event: "outbox.dispatch.failed" },
      "Outbox dispatch failed",
    );
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
logger.info({ event: "worker.shutdown_started" }, "SLA Worker shutting down");
try {
  await worker.close();
  await queue.close();
  await closeRuntimeDependencies(dependencies);
  logger.info({ event: "worker.stopped" }, "SLA Worker stopped");
} catch (error) {
  logger.error(
    { ...errorContext(error), event: "worker.shutdown_failed" },
    "SLA Worker shutdown failed",
  );
  process.exitCode = 1;
}
