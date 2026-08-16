import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readRuntimeConfig } from "./config.js";

const originalEnvironment = {
  databaseUrl: process.env.DATABASE_URL,
  holidayProviderMode: process.env.HOLIDAY_PROVIDER_MODE,
  redisUrl: process.env.REDIS_URL,
  slaCriticalHours: process.env.SLA_CRITICAL_HOURS,
  slaHighHours: process.env.SLA_HIGH_HOURS,
  slaMediumHours: process.env.SLA_MEDIUM_HOURS,
  slaLowHours: process.env.SLA_LOW_HOURS,
  slaCriticalThresholdPercent: process.env.SLA_CRITICAL_THRESHOLD_PERCENT,
  slaAlertThresholdPercent: process.env.SLA_ALERT_THRESHOLD_PERCENT,
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
  restoreEnvironment(
    "SLA_CRITICAL_HOURS",
    originalEnvironment.slaCriticalHours,
  );
  restoreEnvironment("SLA_HIGH_HOURS", originalEnvironment.slaHighHours);
  restoreEnvironment("SLA_MEDIUM_HOURS", originalEnvironment.slaMediumHours);
  restoreEnvironment("SLA_LOW_HOURS", originalEnvironment.slaLowHours);
  restoreEnvironment(
    "SLA_CRITICAL_THRESHOLD_PERCENT",
    originalEnvironment.slaCriticalThresholdPercent,
  );
  restoreEnvironment(
    "SLA_ALERT_THRESHOLD_PERCENT",
    originalEnvironment.slaAlertThresholdPercent,
  );
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

  it("reads configurable SLA durations from the environment", () => {
    process.env.SLA_CRITICAL_HOURS = "0.01";
    process.env.SLA_HIGH_HOURS = "0.02";
    process.env.SLA_MEDIUM_HOURS = "0.03";
    process.env.SLA_LOW_HOURS = "0.04";

    expect(readRuntimeConfig().slaHoursByPriority).toEqual({
      critical: 0.01,
      high: 0.02,
      medium: 0.03,
      low: 0.04,
    });
  });

  it("rejects a non-positive SLA duration", () => {
    process.env.SLA_CRITICAL_HOURS = "0";

    expect(() => readRuntimeConfig()).toThrow(
      "Invalid positive number in SLA_CRITICAL_HOURS",
    );
  });

  it("reads and validates SLA status thresholds", () => {
    process.env.SLA_CRITICAL_THRESHOLD_PERCENT = "15";
    process.env.SLA_ALERT_THRESHOLD_PERCENT = "55";

    expect(readRuntimeConfig()).toMatchObject({
      slaCriticalThresholdPercent: 15,
      slaAlertThresholdPercent: 55,
    });

    process.env.SLA_CRITICAL_THRESHOLD_PERCENT = "60";
    process.env.SLA_ALERT_THRESHOLD_PERCENT = "40";
    expect(() => readRuntimeConfig()).toThrow(
      "must be lower than SLA_ALERT_THRESHOLD_PERCENT",
    );
  });
});
