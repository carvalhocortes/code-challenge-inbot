import { readRuntimeConfig } from "../config.js";
import { writeBootstrapLog } from "./logging.js";
import { buildApi } from "./app.js";
import { createApiDependencies } from "./dependencies.js";
import { shutdownTelemetry } from "../observability/otel.js";

let config: ReturnType<typeof readRuntimeConfig>;

try {
  config = readRuntimeConfig();
} catch (error) {
  writeBootstrapLog("api.configuration_failed", error);
  throw error;
}
const app = buildApi(createApiDependencies(config), {
  bodyLimit: config.requestBodyLimitBytes,
  corsOrigin: config.corsOrigin,
  rateLimitMax: config.rateLimitMax,
  rateLimitWindowMs: config.rateLimitWindowMs,
});

async function close(): Promise<void> {
  app.log.info({ event: "api.shutdown_started" }, "API shutting down");
  try {
    await app.close();
    await shutdownTelemetry();
  } catch (error: unknown) {
    app.log.error(
      { event: "api.shutdown_failed", error },
      "Failed to close API server",
    );
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());

try {
  await app.listen({ host: "0.0.0.0", port: config.apiPort });
  app.log.info({ event: "api.started", port: config.apiPort }, "API started");
} catch (error) {
  app.log.error(
    { event: "api.start_failed", error, port: config.apiPort },
    "API failed to start",
  );
  throw error;
}
