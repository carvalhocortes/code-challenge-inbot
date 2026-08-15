import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readRuntimeConfig } from "./config.js";

const originalEnvironment = {
  databaseUrl: process.env.DATABASE_URL,
  holidayProviderMode: process.env.HOLIDAY_PROVIDER_MODE,
  redisUrl: process.env.REDIS_URL,
};

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.REDIS_URL = "redis://localhost:6379";
});

afterEach(() => {
  restoreEnvironment("DATABASE_URL", originalEnvironment.databaseUrl);
  restoreEnvironment(
    "HOLIDAY_PROVIDER_MODE",
    originalEnvironment.holidayProviderMode,
  );
  restoreEnvironment("REDIS_URL", originalEnvironment.redisUrl);
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("readRuntimeConfig", () => {
  it("uses BrasilAPI unless a deterministic holiday provider is requested", () => {
    delete process.env.HOLIDAY_PROVIDER_MODE;
    expect(readRuntimeConfig().holidayProviderMode).toBe("brasil-api");

    process.env.HOLIDAY_PROVIDER_MODE = "timeout";
    expect(readRuntimeConfig().holidayProviderMode).toBe("timeout");
  });

  it("rejects an unsupported holiday provider mode", () => {
    process.env.HOLIDAY_PROVIDER_MODE = "unavailable";

    expect(() => readRuntimeConfig()).toThrow("Invalid HOLIDAY_PROVIDER_MODE");
  });
});
