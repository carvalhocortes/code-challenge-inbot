export function errorContext(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const context: Record<string, unknown> = {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
    const dependency = (error as Error & { dependency?: unknown }).dependency;
    if (typeof dependency === "string") context.dependency = dependency;

    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) {
      context.causeName = cause.name;
      context.causeMessage = cause.message;
      context.causeStack = cause.stack;
    }
    return context;
  }

  return { errorName: "UnknownError", errorMessage: String(error) };
}

export function writeBootstrapLog(event: string, error: unknown): void {
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "api",
      environment: process.env.NODE_ENV ?? "development",
      event,
      ...errorContext(error),
      message: "API bootstrap failed",
    })}\n`,
  );
}
