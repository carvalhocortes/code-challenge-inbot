import type { Clock } from "../../domain/ticket.js";
import type { HolidayProvider } from "../../application/tickets/sla-processing.js";

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
