import { Pool } from "pg";
import { Redis } from "ioredis";

import type { RuntimeConfig } from "../config.js";

export interface RuntimeDependencies {
  postgres: Pool;
  redis: Redis;
}

export function createPostgresPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}

export function createRuntimeDependencies(
  config: RuntimeConfig,
): RuntimeDependencies {
  return {
    postgres: createPostgresPool(config.databaseUrl),
    redis: new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    }),
  };
}

export async function checkRuntimeDependencies(
  dependencies: RuntimeDependencies,
): Promise<void> {
  await Promise.all([
    dependencies.postgres.query("SELECT 1"),
    dependencies.redis.connect().catch((error: unknown) => {
      if (dependencies.redis.status === "ready") {
        return;
      }

      throw error;
    }),
  ]);

  await dependencies.redis.ping();
}

export async function closeRuntimeDependencies(
  dependencies: RuntimeDependencies,
): Promise<void> {
  await Promise.all([dependencies.postgres.end(), dependencies.redis.quit()]);
}
