import { HolidayProviderError } from "../../application/tickets/sla-processing.js";
import type { HolidayProvider } from "../../application/tickets/sla-processing.js";

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
