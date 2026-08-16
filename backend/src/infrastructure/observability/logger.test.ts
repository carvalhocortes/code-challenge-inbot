import { describe, expect, it } from "vitest";

import { createLogger, errorContext } from "./logger.js";

describe("structured logger", () => {
  it("writes JSON logs with service, event and normalized error context", () => {
    const lines: string[] = [];
    const logger = createLogger("worker", {
      environment: "test",
      level: "info",
      now: () => new Date("2026-08-17T13:00:00.000Z"),
      write: (line) => lines.push(line),
    });

    logger.debug({ event: "ignored" }, "Debug event");
    logger.error(
      {
        event: "sla.job.failed",
        ...errorContext(new Error("provider unavailable")),
        ticketId: "ticket-001",
      },
      "SLA job failed",
    );

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      timestamp: "2026-08-17T13:00:00.000Z",
      level: "error",
      service: "worker",
      environment: "test",
      event: "sla.job.failed",
      errorName: "Error",
      errorMessage: "provider unavailable",
      errorStack: expect.any(String),
      ticketId: "ticket-001",
      message: "SLA job failed",
    });
  });

  it("includes the dependency and root cause in readiness errors", () => {
    const cause = new Error("connection refused");
    const error = new Error("redis readiness check failed", { cause });
    Object.assign(error, { dependency: "redis" });

    expect(errorContext(error)).toMatchObject({
      dependency: "redis",
      errorMessage: "redis readiness check failed",
      causeName: "Error",
      causeMessage: "connection refused",
    });
  });
});
