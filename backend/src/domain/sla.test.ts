import { describe, expect, it } from "vitest";

import { calculateSlaDueAt } from "./sla.js";

describe("calculateSlaDueAt", () => {
  it("calculates a critical ticket deadline within the same business day", () => {
    const dueAt = calculateSlaDueAt({
      createdAt: new Date("2026-08-17T13:00:00.000Z"),
      priority: "critical",
      holidays: new Set(),
    });

    expect(dueAt.toISOString()).toBe("2026-08-17T17:00:00.000Z");
  });

  it("continues the calculation on the next business day", () => {
    const dueAt = calculateSlaDueAt({
      createdAt: new Date("2026-08-17T20:00:00.000Z"),
      priority: "critical",
      holidays: new Set(),
    });

    expect(dueAt.toISOString()).toBe("2026-08-18T15:00:00.000Z");
  });

  it("skips the weekend", () => {
    const dueAt = calculateSlaDueAt({
      createdAt: new Date("2026-08-21T20:00:00.000Z"),
      priority: "critical",
      holidays: new Set(),
    });

    expect(dueAt.toISOString()).toBe("2026-08-24T15:00:00.000Z");
  });

  it("skips a national holiday", () => {
    const dueAt = calculateSlaDueAt({
      createdAt: new Date("2026-08-17T20:00:00.000Z"),
      priority: "critical",
      holidays: new Set(["2026-08-18"]),
    });

    expect(dueAt.toISOString()).toBe("2026-08-19T15:00:00.000Z");
  });

  it("starts consumption at the beginning of the business day", () => {
    const dueAt = calculateSlaDueAt({
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      priority: "critical",
      holidays: new Set(),
    });

    expect(dueAt.toISOString()).toBe("2026-08-17T16:00:00.000Z");
  });

  it("starts consumption on the next business day after hours", () => {
    const dueAt = calculateSlaDueAt({
      createdAt: new Date("2026-08-17T23:00:00.000Z"),
      priority: "critical",
      holidays: new Set(),
    });

    expect(dueAt.toISOString()).toBe("2026-08-18T16:00:00.000Z");
  });

  it("uses injected SLA durations", () => {
    const dueAt = calculateSlaDueAt({
      createdAt: new Date("2026-08-17T13:00:00.000Z"),
      priority: "critical",
      holidays: new Set(),
      slaHoursByPriority: {
        critical: 0.5,
        high: 8,
        medium: 24,
        low: 48,
      },
    });

    expect(dueAt.toISOString()).toBe("2026-08-17T13:30:00.000Z");
  });
});
