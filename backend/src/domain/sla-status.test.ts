import { describe, expect, it } from "vitest";

import { evaluateSla } from "./sla-status.js";

const createdAt = new Date("2026-08-17T12:00:00.000Z");
const dueAt = new Date("2026-08-17T22:00:00.000Z");
const thresholds = { criticalPercent: 10, alertPercent: 40 };

describe("evaluateSla", () => {
  it("classifies overdue and not-yet-calculated tickets", () => {
    expect(
      evaluateSla(
        createdAt,
        dueAt,
        new Date("2026-08-17T22:00:00.000Z"),
        thresholds,
      ),
    ).toMatchObject({ status: "overdue", remainingMs: 0 });
    expect(evaluateSla(createdAt, null, new Date(), thresholds)).toEqual({
      status: null,
      remainingMs: null,
    });
  });

  it.each([
    ["critical", "2026-08-17T21:15:00.000Z"],
    ["alert", "2026-08-17T19:00:00.000Z"],
    ["alert", "2026-08-17T21:00:00.000Z"],
    ["alert", "2026-08-17T18:00:00.000Z"],
    ["on_track", "2026-08-17T13:00:00.000Z"],
  ] as const)("classifies %s based on remaining percentage", (status, now) => {
    expect(
      evaluateSla(createdAt, dueAt, new Date(now), thresholds).status,
    ).toBe(status);
  });
});
