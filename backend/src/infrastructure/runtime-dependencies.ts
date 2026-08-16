import pg from "pg";
import { Redis } from "ioredis";

import type { RuntimeConfig } from "../config.js";

export interface RuntimeDependencies {
  postgres: InstanceType<typeof pg.Pool>;
  redis: Redis;
}

export class RuntimeDependencyError extends Error {
  constructor(
    public readonly dependency: "postgres" | "redis",
    cause: unknown,
  ) {
    super(`${dependency} readiness check failed`, { cause });
    this.name = "RuntimeDependencyError";
  }
}

export function createPostgresPool(
  databaseUrl: string,
): InstanceType<typeof pg.Pool> {
  return new pg.Pool({ connectionString: databaseUrl });
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
  try {
    await dependencies.postgres.query("SELECT 1");
  } catch (error) {
    throw new RuntimeDependencyError("postgres", error);
  }

  try {
    await dependencies.redis.connect().catch((error: unknown) => {
      if (dependencies.redis.status === "ready") {
        return;
      }

      throw error;
    });
    await dependencies.redis.ping();
  } catch (error) {
    throw new RuntimeDependencyError("redis", error);
  }
}

export async function closeRuntimeDependencies(
  dependencies: RuntimeDependencies,
): Promise<void> {
  await Promise.all([dependencies.postgres.end(), dependencies.redis.quit()]);
}
