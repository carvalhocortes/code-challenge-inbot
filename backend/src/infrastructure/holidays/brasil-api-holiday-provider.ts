import {
  HolidayProviderError,
  type HolidayProvider,
} from "../../application/tickets/sla-processing.js";

export interface BrasilApiHolidayProviderOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs: number;
}

export class BrasilApiHolidayProvider implements HolidayProvider {
  private readonly fetch: typeof globalThis.fetch;

  constructor(private readonly options: BrasilApiHolidayProviderOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async holidaysForYear(year: number): Promise<ReadonlySet<string>> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs,
    );

    try {
      const response = await this.fetch(
        `https://brasilapi.com.br/api/feriados/v1/${year}`,
        { signal: controller.signal },
      );

      if (!response.ok) {
        throw new HolidayProviderError({
          kind: "http",
          status: response.status,
        });
      }

      return new Set(parseHolidayDates(await response.json()));
    } catch (error) {
      if (error instanceof HolidayProviderError) {
        throw error;
      }

      if (isAbortError(error)) {
        throw new HolidayProviderError({ kind: "timeout" });
      }

      throw new HolidayProviderError({ kind: "connection" });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseHolidayDates(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new HolidayProviderError({ kind: "http", status: 502 });
  }

  const dates: string[] = [];

  for (const holiday of value) {
    if (
      holiday === null ||
      typeof holiday !== "object" ||
      !isHolidayDate((holiday as Record<string, unknown>).date) ||
      typeof (holiday as Record<string, unknown>).name !== "string" ||
      typeof (holiday as Record<string, unknown>).type !== "string"
    ) {
      throw new HolidayProviderError({ kind: "http", status: 502 });
    }

    dates.push((holiday as { date: string }).date);
  }

  return dates;
}

function isHolidayDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}
