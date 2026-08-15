export interface RuntimeConfig {
  apiPort: number;
  corsOrigin: string;
  requestBodyLimitBytes: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  databaseUrl: string;
  redisUrl: string;
}

function readRequired(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
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

export function readRuntimeConfig(): RuntimeConfig {
  return {
    apiPort: readPort("API_PORT", 3_000),
    corsOrigin: readRequired("CORS_ORIGIN"),
    requestBodyLimitBytes: readPositiveInteger(
      "REQUEST_BODY_LIMIT_BYTES",
      1_048_576,
    ),
    rateLimitMax: readPositiveInteger("RATE_LIMIT_MAX", 100),
    rateLimitWindowMs: readPositiveInteger("RATE_LIMIT_WINDOW_MS", 60_000),
    databaseUrl: readRequired("DATABASE_URL"),
    redisUrl: readRequired("REDIS_URL"),
  };
}
