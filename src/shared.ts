/** Shared constants and window math used by both `client/` and `component/`. */

export const COMPONENT_NAME = "quota";

/** Default namespace when the host does not scope an allowance. */
export const DEFAULT_SCOPE = "global";

/** Opaque refs longer than this are rejected. */
export const MAX_REF_LENGTH = 256;

/** Default / max rows deleted per erase pass before the sweep reschedules. */
export const DEFAULT_ERASE_BATCH = 200;
export const MAX_ERASE_BATCH = 500;

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

export type ResolvedWindow = {
  periodKey: string;
  startAt: number;
  endAt: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function assertFinitePositive(value: number, code: string, message: string): void {
  if (!(value > 0 && Number.isFinite(value))) {
    throw new Error(`${code}:${message}`);
  }
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const created = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone,
      weekday: "short",
      year: "numeric",
    });
    formatterCache.set(timeZone, created);
    return created;
  } catch {
    throw new Error(`INVALID_TIME_ZONE: ${timeZone}`);
  }
}

function partMap(parts: readonly Intl.DateTimeFormatPart[]): Record<string, string> {
  return parts.reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
}

/**
 * Read calendar parts of `now` in `timeZone`. Throws if `timeZone` is not a
 * valid IANA name.
 */
export function zonedParts(
  now: number,
  timeZone: string,
): {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  weekday: number;
  year: number;
} {
  const byType = partMap(formatterFor(timeZone).formatToParts(new Date(now)));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    String(byType.weekday),
  );
  return {
    day: Number(byType.day),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
    month: Number(byType.month),
    second: Number(byType.second),
    weekday,
    year: Number(byType.year),
  };
}

function stepMidnight(
  guess: number,
  year: number,
  month: number,
  day: number,
  timeZone: string,
): number {
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
    return guess;
  }
  return guess - diff;
}

/**
 * UTC ms for local midnight of `year-month-day` in `timeZone`.
 * Two offset corrections so DST does not leave the result on the wrong day.
 */
export function utcMsForLocalMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): number {
  const first = Date.UTC(year, month - 1, day);
  return stepMidnight(
    stepMidnight(first, year, month, day, timeZone),
    year,
    month,
    day,
    timeZone,
  );
}

function addDays(
  year: number,
  month: number,
  day: number,
  delta: number,
): { day: number; month: number; year: number } {
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}

/** ISO week (Monday start) for a civil date. */
export function isoWeek(
  year: number,
  month: number,
  day: number,
): { week: number; year: number } {
  const date = new Date(Date.UTC(year, month - 1, day));
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return { week, year: thursday.getUTCFullYear() };
}

function sundayWeek(
  year: number,
  month: number,
  day: number,
  weekday: number,
): { week: number; year: number } {
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
    const startAt = utcMsForLocalMidnight(
      parts.year,
      parts.month,
      parts.day,
      timeZone,
    );
    const next = addDays(parts.year, parts.month, parts.day, 1);
    return {
      endAt: utcMsForLocalMidnight(next.year, next.month, next.day, timeZone),
      periodKey: `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`,
      startAt,
    };
  }
  if (period === "month") {
    const startAt = utcMsForLocalMidnight(parts.year, parts.month, 1, timeZone);
    const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
    const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
    return {
      endAt: utcMsForLocalMidnight(nextYear, nextMonth, 1, timeZone),
      periodKey: `${parts.year}-${pad2(parts.month)}`,
      startAt,
    };
  }
  if (weekStartsOn === "sunday") {
    const start = addDays(parts.year, parts.month, parts.day, -parts.weekday);
    const end = addDays(start.year, start.month, start.day, 7);
    const labeled = sundayWeek(
      parts.year,
      parts.month,
      parts.day,
      parts.weekday,
    );
    return {
      endAt: utcMsForLocalMidnight(end.year, end.month, end.day, timeZone),
      periodKey: `${labeled.year}-W${pad2(labeled.week)}-sun`,
      startAt: utcMsForLocalMidnight(start.year, start.month, start.day, timeZone),
    };
  }
  const iso = isoWeek(parts.year, parts.month, parts.day);
  const mondayDelta = parts.weekday === 0 ? -6 : 1 - parts.weekday;
  const start = addDays(parts.year, parts.month, parts.day, mondayDelta);
  const end = addDays(start.year, start.month, start.day, 7);
  return {
    endAt: utcMsForLocalMidnight(end.year, end.month, end.day, timeZone),
    periodKey: `${iso.year}-W${pad2(iso.week)}`,
    startAt: utcMsForLocalMidnight(start.year, start.month, start.day, timeZone),
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
  assertFinitePositive(
    spec.durationMs,
    "INVALID_DURATION",
    "durationMs must be a positive finite number",
  );
  if (spec.kind === "epoch") {
    const index = Math.floor(now / spec.durationMs);
    const startAt = index * spec.durationMs;
    return {
      endAt: startAt + spec.durationMs,
      periodKey: `e${index.toString()}`,
      startAt,
    };
  }
  if (rollingStartAt !== undefined && now < rollingStartAt + spec.durationMs) {
    return {
      endAt: rollingStartAt + spec.durationMs,
      periodKey: `r${rollingStartAt.toString()}`,
      startAt: rollingStartAt,
    };
  }
  return {
    endAt: now + spec.durationMs,
    periodKey: `r${now.toString()}`,
    startAt: now,
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

export function clampEraseBatch(batch: number): number {
  if (!Number.isInteger(batch) || batch < 1) {
    throw new Error("INVALID_BATCH: batch must be a positive integer");
  }
  return Math.min(batch, MAX_ERASE_BATCH);
}
