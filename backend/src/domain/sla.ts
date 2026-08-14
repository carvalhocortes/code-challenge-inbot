export type TicketPriority = "critical" | "high" | "medium" | "low";

const slaHoursByPriority: Record<TicketPriority, number> = {
  critical: 4,
  high: 8,
  medium: 24,
  low: 48,
};

const businessTimeZone = "America/Sao_Paulo";
const businessDayStartHour = 9;
const businessDayEndHour = 18;

interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const localDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: businessTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export interface CalculateSlaDueAtInput {
  createdAt: Date;
  priority: TicketPriority;
  holidays: ReadonlySet<string>;
}

export function calculateSlaDueAt(input: CalculateSlaDueAtInput): Date {
  let remainingMilliseconds =
    slaHoursByPriority[input.priority] * 60 * 60 * 1000;
  let current = moveToBusinessTime(
    toLocalDateTime(input.createdAt),
    input.holidays,
  );

  while (remainingMilliseconds > 0) {
    const endOfBusinessDay = fromLocalDateTime({
      ...current,
      hour: businessDayEndHour,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
    const currentInstant = fromLocalDateTime(current);
    const availableMilliseconds =
      endOfBusinessDay.getTime() - currentInstant.getTime();

    if (remainingMilliseconds <= availableMilliseconds) {
      return new Date(currentInstant.getTime() + remainingMilliseconds);
    }

    remainingMilliseconds -= availableMilliseconds;
    current = nextBusinessDayStart(current, input.holidays);
  }

  return fromLocalDateTime(current);
}

function moveToBusinessTime(
  localDateTime: LocalDateTime,
  holidays: ReadonlySet<string>,
): LocalDateTime {
  if (!isBusinessDay(localDateTime, holidays)) {
    return nextBusinessDayStart(localDateTime, holidays);
  }

  if (localDateTime.hour < businessDayStartHour) {
    return atBusinessDayStart(localDateTime);
  }

  if (localDateTime.hour >= businessDayEndHour) {
    return nextBusinessDayStart(localDateTime, holidays);
  }

  return localDateTime;
}

function nextBusinessDayStart(
  localDateTime: LocalDateTime,
  holidays: ReadonlySet<string>,
): LocalDateTime {
  let candidate = nextCalendarDay(localDateTime);

  while (!isBusinessDay(candidate, holidays)) {
    candidate = nextCalendarDay(candidate);
  }

  return atBusinessDayStart(candidate);
}

function atBusinessDayStart(localDateTime: LocalDateTime): LocalDateTime {
  return {
    ...localDateTime,
    hour: businessDayStartHour,
    minute: 0,
    second: 0,
    millisecond: 0,
  };
}

function isBusinessDay(
  localDateTime: LocalDateTime,
  holidays: ReadonlySet<string>,
): boolean {
  const dayOfWeek = new Date(
    Date.UTC(localDateTime.year, localDateTime.month - 1, localDateTime.day),
  ).getUTCDay();

  return (
    dayOfWeek !== 0 &&
    dayOfWeek !== 6 &&
    !holidays.has(toDateKey(localDateTime))
  );
}

function nextCalendarDay(localDateTime: LocalDateTime): LocalDateTime {
  const nextDay = new Date(
    Date.UTC(
      localDateTime.year,
      localDateTime.month - 1,
      localDateTime.day + 1,
    ),
  );

  return {
    year: nextDay.getUTCFullYear(),
    month: nextDay.getUTCMonth() + 1,
    day: nextDay.getUTCDate(),
    hour: localDateTime.hour,
    minute: localDateTime.minute,
    second: localDateTime.second,
    millisecond: localDateTime.millisecond,
  };
}

function toLocalDateTime(date: Date): LocalDateTime {
  const parts = localDateTimeFormatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);

    if (part === undefined) {
      throw new Error(`Missing ${type} in business time conversion.`);
    }

    return Number(part.value);
  };

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
    millisecond: date.getMilliseconds(),
  };
}

function fromLocalDateTime(localDateTime: LocalDateTime): Date {
  const targetWallTime = toWallTime(localDateTime);
  let instant = targetWallTime;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actualWallTime = toWallTime(toLocalDateTime(new Date(instant)));
    const difference = targetWallTime - actualWallTime;

    if (difference === 0) {
      return new Date(instant);
    }

    instant += difference;
  }

  return new Date(instant);
}

function toWallTime(localDateTime: LocalDateTime): number {
  return Date.UTC(
    localDateTime.year,
    localDateTime.month - 1,
    localDateTime.day,
    localDateTime.hour,
    localDateTime.minute,
    localDateTime.second,
    localDateTime.millisecond,
  );
}

function toDateKey(localDateTime: LocalDateTime): string {
  return `${localDateTime.year.toString().padStart(4, "0")}-${localDateTime.month
    .toString()
    .padStart(2, "0")}-${localDateTime.day.toString().padStart(2, "0")}`;
}
