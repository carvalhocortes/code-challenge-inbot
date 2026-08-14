import { readRuntimeConfig } from "./config.js";
import { createPostgresPool } from "./infrastructure/runtime-dependencies.js";

const pool = createPostgresPool(readRuntimeConfig().databaseUrl);

await pool.query("SELECT 1");
await pool.end();

process.stdout.write(
  "Database connectivity verified; migrations start in E2.\n",
);
