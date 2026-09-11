/** Shared constants and window math used by both `client/` and `component/`. */

export const COMPONENT_NAME = "quota";

/** Default namespace when the host does not scope an allowance. */
export const DEFAULT_SCOPE = "global";

export type CalendarPeriod = "day" | "week" | "month";
export type WeekStartsOn = "monday" | "sunday";

export type WindowSpec =
  | {
      kind: "calendar";
      period: CalendarPeriod;
      timeZone: string;
      weekStartsOn?: WeekStartsOn;
    }
  | {
      kind: "rolling";
      durationMs: number;
    }
  | {
      kind: "epoch";
      durationMs: number;
    };

export interface ResolvedWindow {
  periodKey: string;
  startAt: number;
  endAt: number;
}

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function assertFinitePositive(value: number, code: string, message: string): void {
  if (!(value > 0 && Number.isFinite(value))) {
    throw new Error(`${code}:${message}`);
  }
}

/**
 * Read calendar parts of `now` in `timeZone`. Throws if `timeZone` is not a
 * valid IANA name (`Intl` RangeError).
 */
export function zonedParts(
  now: number,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const read = (type: string): string =>
    parts.find((entry) => entry.type === type)?.value ?? "0";
  const weekdayName = read("weekday");
  const weekday = WEEKDAY[weekdayName] ?? 0;
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    weekday,
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    second: Number(read("second")),
  };
}

/**
 * UTC ms for local midnight of `year-month-day` in `timeZone`.
 * Iterates the zone offset so DST does not leave the result on the wrong day.
 */
export function utcMsForLocalMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): number {
  let guess = Date.UTC(year, month - 1, day);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(guess, timeZone);
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const target = Date.UTC(year, month - 1, day);
    const diff = asUtc - target;
    if (diff === 0) {
      break;
    }
    guess -= diff;
  }
  return guess;
}

function addDays(
  year: number,
  month: number,
  day: number,
  delta: number,
): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/** ISO week (Monday start) for a civil date. */
export function isoWeek(
  year: number,
  month: number,
  day: number,
): { year: number; week: number } {
  const date = new Date(Date.UTC(year, month - 1, day));
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: thursday.getUTCFullYear(), week };
}

function sundayWeek(
  year: number,
  month: number,
  day: number,
  weekday: number,
): { year: number; week: number } {
  const start = addDays(year, month, day, -weekday);
  return isoWeek(start.year, start.month, start.day);
}

function resolveCalendar(
  now: number,
  period: CalendarPeriod,
  timeZone: string,
  weekStartsOn: WeekStartsOn,
): ResolvedWindow {
  const parts = zonedParts(now, timeZone);
  if (period === "day") {
    const startAt = utcMsForLocalMidnight(parts.year, parts.month, parts.day, timeZone);
    const next = addDays(parts.year, parts.month, parts.day, 1);
    const endAt = utcMsForLocalMidnight(next.year, next.month, next.day, timeZone);
    return {
      periodKey: `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`,
      startAt,
      endAt,
    };
  }
  if (period === "month") {
    const startAt = utcMsForLocalMidnight(parts.year, parts.month, 1, timeZone);
    const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
    const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
    const endAt = utcMsForLocalMidnight(nextYear, nextMonth, 1, timeZone);
    return {
      periodKey: `${parts.year}-${pad2(parts.month)}`,
      startAt,
      endAt,
    };
  }
  if (weekStartsOn === "sunday") {
    const start = addDays(parts.year, parts.month, parts.day, -parts.weekday);
    const end = addDays(start.year, start.month, start.day, 7);
    const labeled = sundayWeek(parts.year, parts.month, parts.day, parts.weekday);
    return {
      periodKey: `${labeled.year}-W${pad2(labeled.week)}-sun`,
      startAt: utcMsForLocalMidnight(start.year, start.month, start.day, timeZone),
      endAt: utcMsForLocalMidnight(end.year, end.month, end.day, timeZone),
    };
  }
  const iso = isoWeek(parts.year, parts.month, parts.day);
  const mondayDelta = parts.weekday === 0 ? -6 : 1 - parts.weekday;
  const start = addDays(parts.year, parts.month, parts.day, mondayDelta);
  const end = addDays(start.year, start.month, start.day, 7);
  return {
    periodKey: `${iso.year}-W${pad2(iso.week)}`,
    startAt: utcMsForLocalMidnight(start.year, start.month, start.day, timeZone),
    endAt: utcMsForLocalMidnight(end.year, end.month, end.day, timeZone),
  };
}

/**
 * Resolve the current window for `spec` at `now`. For `rolling`, pass the
 * stored `windowStartAt` so an in-progress window is reused until it elapses.
 */
export function resolveWindow(
  now: number,
  spec: WindowSpec,
  rollingStartAt?: number,
): ResolvedWindow {
  if (spec.kind === "calendar") {
    return resolveCalendar(
      now,
      spec.period,
      spec.timeZone,
      spec.weekStartsOn ?? "monday",
    );
  }
  assertFinitePositive(spec.durationMs, "INVALID_DURATION", "durationMs must be a positive finite number");
  if (spec.kind === "epoch") {
    const index = Math.floor(now / spec.durationMs);
    const startAt = index * spec.durationMs;
    return {
      periodKey: `e${index.toString()}`,
      startAt,
      endAt: startAt + spec.durationMs,
    };
  }
  if (rollingStartAt !== undefined && now < rollingStartAt + spec.durationMs) {
    return {
      periodKey: `r${rollingStartAt.toString()}`,
      startAt: rollingStartAt,
      endAt: rollingStartAt + spec.durationMs,
    };
  }
  return {
    periodKey: `r${now.toString()}`,
    startAt: now,
    endAt: now + spec.durationMs,
  };
}

export function interpretWindowError(error: unknown): {
  code: "INVALID_DURATION" | "INVALID_TIME_ZONE";
  message: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("INVALID_DURATION:")) {
    return {
      code: "INVALID_DURATION",
      message: message.slice("INVALID_DURATION:".length),
    };
  }
  return {
    code: "INVALID_TIME_ZONE",
    message: message.replace(/^INVALID_TIME_ZONE:\s*/, ""),
  };
}
