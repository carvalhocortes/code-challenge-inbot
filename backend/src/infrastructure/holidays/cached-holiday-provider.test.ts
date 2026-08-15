import { describe, expect, it } from "vitest";

import {
  CachedHolidayProvider,
  FakeHolidayProvider,
} from "./holiday-provider.js";

describe("CachedHolidayProvider", () => {
  it("reuses a yearly value while its TTL is valid", async () => {
    const fake = new FakeHolidayProvider({
      mode: "success",
      holidaysByYear: { 2026: ["2026-12-25"] },
    });
    const provider = new CachedHolidayProvider(fake, {
      now: () => new Date("2026-08-14T12:00:00.000Z"),
      ttlMs: 86_400_000,
    });

    await expect(provider.holidaysForYear(2026)).resolves.toEqual(
      new Set(["2026-12-25"]),
    );
    await expect(provider.holidaysForYear(2026)).resolves.toEqual(
      new Set(["2026-12-25"]),
    );
    expect(fake.calls).toBe(1);
  });

  it("uses the last cached value when a refresh fails", async () => {
    let now = new Date("2026-08-14T12:00:00.000Z");
    const fake = new FakeHolidayProvider({
      mode: "success",
      holidaysByYear: { 2026: ["2026-12-25"] },
    });
    const provider = new CachedHolidayProvider(fake, {
      now: () => now,
      ttlMs: 1_000,
    });

    await provider.holidaysForYear(2026);
    fake.setMode("500");
    now = new Date("2026-08-14T12:00:01.000Z");

    await expect(provider.holidaysForYear(2026)).resolves.toEqual(
      new Set(["2026-12-25"]),
    );
    expect(fake.calls).toBe(2);
  });
});
