import type { Clock } from "../../domain/ticket.js";
import type { ProcessingFailure } from "../../domain/processing-failure.js";

export interface HolidayProvider {
  holidaysForYear(year: number): Promise<ReadonlySet<string>>;
}

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

      const dates = parseHolidayDates(await response.json());
      return new Set(dates);
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

export class HolidayProviderError extends Error {
  constructor(readonly failure: ProcessingFailure) {
    super(`holiday_provider.${failure.kind}`);
    this.name = "HolidayProviderError";
  }
}

export type FakeHolidayProviderMode =
  | "success"
  | "timeout"
  | "429"
  | "500"
  | "400";

export interface FakeHolidayProviderOptions {
  mode?: FakeHolidayProviderMode;
  modes?: readonly FakeHolidayProviderMode[];
  holidaysByYear?: Readonly<Record<number, readonly string[]>>;
}

export class FakeHolidayProvider implements HolidayProvider {
  calls = 0;
  private mode: FakeHolidayProviderMode;

  constructor(private readonly options: FakeHolidayProviderOptions) {
    this.mode = options.mode ?? "success";
  }

  setMode(mode: FakeHolidayProviderMode): void {
    this.mode = mode;
  }

  async holidaysForYear(year: number): Promise<ReadonlySet<string>> {
    this.calls += 1;
    const mode =
      this.options.modes?.[
        Math.min(this.calls - 1, this.options.modes.length - 1)
      ] ?? this.mode;

    if (mode === "success") {
      return new Set(this.options.holidaysByYear?.[year] ?? []);
    }

    if (mode === "timeout") {
      throw new HolidayProviderError({ kind: "timeout" });
    }

    throw new HolidayProviderError({
      kind: "http",
      status: Number(mode),
    });
  }
}

interface CachedHolidays {
  holidays: ReadonlySet<string>;
  expiresAt: Date;
}

export interface CachedHolidayProviderOptions extends Clock {
  ttlMs: number;
}

export class CachedHolidayProvider implements HolidayProvider {
  private readonly cache = new Map<number, CachedHolidays>();

  constructor(
    private readonly source: HolidayProvider,
    private readonly options: CachedHolidayProviderOptions,
  ) {}

  async holidaysForYear(year: number): Promise<ReadonlySet<string>> {
    const now = this.options.now();
    const cached = this.cache.get(year);

    if (cached !== undefined && cached.expiresAt > now) {
      return cached.holidays;
    }

    try {
      const holidays = await this.source.holidaysForYear(year);
      this.cache.set(year, {
        holidays,
        expiresAt: new Date(now.getTime() + this.options.ttlMs),
      });
      return holidays;
    } catch (error) {
      if (cached !== undefined) {
        return cached.holidays;
      }

      throw error;
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
