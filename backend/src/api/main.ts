import { readRuntimeConfig } from "../config.js";
import { buildApi } from "./app.js";

const config = readRuntimeConfig();
const app = buildApi();

function close(): void {
  void app.close().catch((error: unknown) => {
    app.log.error(error, "Failed to close API server");
    process.exitCode = 1;
  });
}

process.once("SIGINT", close);
process.once("SIGTERM", close);

await app.listen({ host: "0.0.0.0", port: config.apiPort });
