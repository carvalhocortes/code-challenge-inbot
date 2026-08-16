import { readRuntimeConfig } from "../config.js";
import { writeBootstrapLog } from "./logging.js";
import { buildApi } from "./app.js";
import { createApiDependencies } from "./dependencies.js";

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

function close(): void {
  app.log.info({ event: "api.shutdown_started" }, "API shutting down");
  void app.close().catch((error: unknown) => {
    app.log.error(
      { event: "api.shutdown_failed", error },
      "Failed to close API server",
    );
    process.exitCode = 1;
  });
}

process.once("SIGINT", close);
process.once("SIGTERM", close);

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
