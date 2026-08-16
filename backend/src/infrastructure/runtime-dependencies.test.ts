import { Redis } from "ioredis";
import pg from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  checkRuntimeDependencies,
  type RuntimeDependencies,
} from "./runtime-dependencies.js";

describe("runtime dependency checks", () => {
  it("identifies PostgreSQL and preserves its root cause", async () => {
    const cause = new Error("connection refused");
    const postgres = {
      query: vi.fn().mockRejectedValue(cause),
    } as unknown as InstanceType<typeof pg.Pool>;
    const redis = {
      connect: vi.fn(),
      ping: vi.fn(),
      status: "ready",
    } as unknown as Redis;

    await expect(
      checkRuntimeDependencies({ postgres, redis }),
    ).rejects.toMatchObject({
      dependency: "postgres",
      name: "RuntimeDependencyError",
      cause,
    });
    expect(redis.connect).not.toHaveBeenCalled();
  });

  it("identifies Redis when its connection or ping fails", async () => {
    const postgres = {
      query: vi.fn().mockResolvedValue(undefined),
    } as unknown as InstanceType<typeof pg.Pool>;
    const redis = {
      connect: vi.fn().mockRejectedValue(new Error("connection refused")),
      ping: vi.fn(),
      status: "end",
    } as unknown as Redis;
    const dependencies: RuntimeDependencies = { postgres, redis };

    await expect(checkRuntimeDependencies(dependencies)).rejects.toMatchObject({
      dependency: "redis",
      name: "RuntimeDependencyError",
    });
    expect(redis.ping).not.toHaveBeenCalled();
  });
});
