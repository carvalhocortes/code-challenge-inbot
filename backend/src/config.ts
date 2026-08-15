export interface RuntimeConfig {
  apiPort: number;
  corsOrigin: string;
  requestBodyLimitBytes: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  databaseUrl: string;
  redisUrl: string;
  outboxPollIntervalMs: number;
  outboxBatchSize: number;
  outboxLeaseMs: number;
  brasilApiTimeoutMs: number;
  slaRetryAttempts: number;
  slaRetryBackoffMs: number;
  holidayCacheTtlMs: number;
  holidayProviderMode: HolidayProviderMode;
}

const holidayProviderModes = [
  "brasil-api",
  "success",
  "timeout",
  "429",
  "500",
  "400",
] as const;

export type HolidayProviderMode = (typeof holidayProviderModes)[number];

function readRequired(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readOptional(name: string, fallback: string): string {
  const value = process.env[name];

  return value === undefined || value.trim() === "" ? fallback : value;
}

function readPort(name: string, fallback: number): number {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue.trim() === "") {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`Invalid port in ${name}`);
  }

  return value;
}

function readPositiveInteger(name: string, fallback: number): number {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue.trim() === "") {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid positive integer in ${name}`);
  }

  return value;
}

function readHolidayProviderMode(): HolidayProviderMode {
  const value = readOptional("HOLIDAY_PROVIDER_MODE", "brasil-api");

  if (holidayProviderModes.includes(value as HolidayProviderMode)) {
    return value as HolidayProviderMode;
  }

  throw new Error(
    `Invalid HOLIDAY_PROVIDER_MODE. Expected one of: ${holidayProviderModes.join(", ")}`,
  );
}

export function readRuntimeConfig(): RuntimeConfig {
  return {
    apiPort: readPort("API_PORT", 3_000),
    corsOrigin: readOptional("CORS_ORIGIN", "http://localhost:5173"),
    requestBodyLimitBytes: readPositiveInteger(
      "REQUEST_BODY_LIMIT_BYTES",
      1_048_576,
    ),
    rateLimitMax: readPositiveInteger("RATE_LIMIT_MAX", 100),
    rateLimitWindowMs: readPositiveInteger("RATE_LIMIT_WINDOW_MS", 60_000),
    databaseUrl: readRequired("DATABASE_URL"),
    redisUrl: readRequired("REDIS_URL"),
    outboxPollIntervalMs: readPositiveInteger("OUTBOX_POLL_INTERVAL_MS", 1_000),
    outboxBatchSize: readPositiveInteger("OUTBOX_BATCH_SIZE", 10),
    outboxLeaseMs: readPositiveInteger("OUTBOX_LEASE_SECONDS", 30) * 1_000,
    brasilApiTimeoutMs: readPositiveInteger("BRASIL_API_TIMEOUT_MS", 5_000),
    slaRetryAttempts: readPositiveInteger("SLA_RETRY_ATTEMPTS", 3),
    slaRetryBackoffMs: readPositiveInteger("SLA_RETRY_BACKOFF_MS", 1_000),
    holidayCacheTtlMs:
      readPositiveInteger("HOLIDAY_CACHE_TTL_SECONDS", 86_400) * 1_000,
    holidayProviderMode: readHolidayProviderMode(),
  };
}
