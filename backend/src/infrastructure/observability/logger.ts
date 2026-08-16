export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(context: LogContext, message: string): void;
  info(context: LogContext, message: string): void;
  warn(context: LogContext, message: string): void;
  error(context: LogContext, message: string): void;
}

export type LogContext = Record<string, unknown>;

export interface LoggerOptions {
  environment?: string;
  level?: LogLevel;
  now?: () => Date;
  write?: (line: string) => void;
}

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger(
  service: string,
  options: LoggerOptions = {},
): Logger {
  const minimumLevel =
    options.level ?? readLogLevel(process.env.LOG_LEVEL) ?? "info";
  const now = options.now ?? (() => new Date());
  const write = options.write ?? ((line: string) => process.stdout.write(line));

  function log(level: LogLevel, context: LogContext, message: string): void {
    if (levelPriority[level] < levelPriority[minimumLevel]) return;

    const entry = {
      timestamp: now().toISOString(),
      level,
      service,
      environment: options.environment ?? process.env.NODE_ENV ?? "development",
      ...normalizeContext(context),
      message,
    };
    write(`${JSON.stringify(entry)}\n`);
  }

  return {
    debug: (context, message) => log("debug", context, message),
    info: (context, message) => log("info", context, message),
    warn: (context, message) => log("warn", context, message),
    error: (context, message) => log("error", context, message),
  };
}

export function errorContext(error: unknown): LogContext {
  if (error instanceof Error) {
    const context: LogContext = {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };

    const dependency = (error as Error & { dependency?: unknown }).dependency;
    if (typeof dependency === "string") {
      context.dependency = dependency;
    }

    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) {
      context.causeName = cause.name;
      context.causeMessage = cause.message;
      context.causeStack = cause.stack;
    }

    return context;
  }

  return {
    errorName: "UnknownError",
    errorMessage: String(error),
  };
}

function normalizeContext(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      value instanceof Error ? errorContext(value) : value,
    ]),
  );
}

function readLogLevel(value: string | undefined): LogLevel | undefined {
  return value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error"
    ? value
    : undefined;
}
