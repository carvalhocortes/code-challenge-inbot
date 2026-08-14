import { readRuntimeConfig } from "../config.js";
import { buildApi } from "./app.js";

const config = readRuntimeConfig();
const app = buildApi();

async function close(): Promise<void> {
  await app.close();
}

process.once("SIGINT", close);
process.once("SIGTERM", close);

await app.listen({ host: "0.0.0.0", port: config.apiPort });
