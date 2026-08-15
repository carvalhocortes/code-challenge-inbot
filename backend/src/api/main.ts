import { readRuntimeConfig } from "../config.js";
import { buildApi } from "./app.js";
import { createApiDependencies } from "./dependencies.js";

const config = readRuntimeConfig();
const app = buildApi(createApiDependencies(config), {
  bodyLimit: config.requestBodyLimitBytes,
  corsOrigin: config.corsOrigin,
  rateLimitMax: config.rateLimitMax,
  rateLimitWindowMs: config.rateLimitWindowMs,
});

function close(): void {
  void app.close().catch((error: unknown) => {
    app.log.error(error, "Failed to close API server");
    process.exitCode = 1;
  });
}

process.once("SIGINT", close);
process.once("SIGTERM", close);

await app.listen({ host: "0.0.0.0", port: config.apiPort });
