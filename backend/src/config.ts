export interface RuntimeConfig {
  apiPort: number;
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

export function readRuntimeConfig(): RuntimeConfig {
  return {
    apiPort: readPort("API_PORT", 3_000),
    databaseUrl: readRequired("DATABASE_URL"),
    redisUrl: readRequired("REDIS_URL"),
  };
}
