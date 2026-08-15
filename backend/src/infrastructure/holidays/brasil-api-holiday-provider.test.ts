import { describe, expect, it, vi } from "vitest";

import { BrasilApiHolidayProvider } from "./holiday-provider.js";

describe("BrasilApiHolidayProvider", () => {
  it("returns the dates from a valid national-holidays response", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            date: "2026-01-01",
            name: "Confraternização mundial",
            type: "national",
          },
        ]),
        { status: 200 },
      ),
    );
    const provider = new BrasilApiHolidayProvider({ fetch, timeoutMs: 5_000 });

    await expect(provider.holidaysForYear(2026)).resolves.toEqual(
      new Set(["2026-01-01"]),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://brasilapi.com.br/api/feriados/v1/2026",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
