/** Shared constants and window math used by both `client/` and `component/`. */

export const COMPONENT_NAME = "quota";

/** Default namespace when the host does not scope an allowance. */
export const DEFAULT_SCOPE = "global";

/** Length limit for opaque refs. */
export const MAX_REF_LENGTH = 256;

/** Default / max rows deleted per erase pass before the sweep reschedules. */
export const DEFAULT_ERASE_BATCH = 200;
export const MAX_ERASE_BATCH = 500;

export type CalendarPeriod = "day" | "month" | "week";
export type WeekStartsOn = "monday" | "sunday";

export type WindowSpec =
  | {
      durationMs: number;
      kind: "epoch";
    }
  | {
      durationMs: number;
      kind: "rolling";
    }
  | {
      kind: "calendar";
      period: CalendarPeriod;
      timeZone: string;
      weekStartsOn?: WeekStartsOn;
    };

export type ResolvedWindow = {
  endAt: number;
  periodKey: string;
  startAt: number;
};

/** Stable policy identity; hosts must use a new key to change window policy. */
export function windowPolicyKey(spec: WindowSpec): string {
  return spec.kind === "calendar"
    ? JSON.stringify([
        spec.kind,
        spec.period,
        spec.timeZone,
        spec.period === "week" ? (spec.weekStartsOn ?? "monday") : undefined,
      ])
    : JSON.stringify([spec.kind, spec.durationMs]);
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function assertFinitePositive(
  value: number,
  code: string,
  message: string,
): void {
  if (!(value > 0 && Number.isSafeInteger(value))) {
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

function partMap(
  parts: readonly Intl.DateTimeFormatPart[],
): Record<string, string> {
  return parts.reduce<Record<string, string>>((accumulator, part) => {
    accumulator[part.type] = part.value;
    return accumulator;
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

type CivilDate = { day: number; month: number; year: number };

function stepMidnight(
  guess: number,
  { day, month, year }: CivilDate,
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
 * UTC ms for the start of a civil date. Repeated midnight chooses the earlier
 * occurrence; a skipped midnight/date advances through the timezone gap.
 */
export function utcMsForLocalMidnight(
  { day, month, year }: CivilDate,
  timeZone: string,
): number {
  const first = Date.UTC(year, month - 1, day);
  const corrected = stepMidnight(first, { day, month, year }, timeZone);
  const candidates = [-86_400_000, 0, 86_400_000].map((delta) =>
    stepMidnight(corrected + delta, { day, month, year }, timeZone),
  );
  const exact = candidates.filter((candidate) => {
    const parts = zonedParts(candidate, timeZone);
    return (
      parts.year === year &&
      parts.month === month &&
      parts.day === day &&
      parts.hour === 0 &&
      parts.minute === 0 &&
      parts.second === 0
    );
  });
  return exact.length > 0
    ? Math.min(...exact)
    : Math.max(corrected, ...candidates);
}

function addDays(
  { day, month, year }: CivilDate,
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

function resolveWeek(
  parts: ReturnType<typeof zonedParts>,
  timeZone: string,
  weekStartsOn: WeekStartsOn,
): ResolvedWindow {
  const sunday = weekStartsOn === "sunday";
  const mondayDelta = parts.weekday === 0 ? -6 : 1 - parts.weekday;
  const delta = sunday ? -parts.weekday : mondayDelta;
  const start = addDays(parts, delta);
  const end = addDays(start, 7);
  const labelDate = sunday ? start : parts;
  const label = isoWeek(labelDate.year, labelDate.month, labelDate.day);
  return {
    endAt: utcMsForLocalMidnight(end, timeZone),
    periodKey: `${label.year.toString()}-W${pad2(label.week)}${sunday ? "-sun" : ""}`,
    startAt: utcMsForLocalMidnight(start, timeZone),
  };
}

function resolveCalendar(
  now: number,
  spec: Extract<WindowSpec, { kind: "calendar" }>,
): ResolvedWindow {
  const { period, timeZone, weekStartsOn } = spec;
  const parts = zonedParts(now, timeZone);
  if (period === "week")
    return resolveWeek(parts, timeZone, weekStartsOn ?? "monday");
  const start = period === "day" ? parts : { ...parts, day: 1 };
  const next =
    period === "day"
      ? addDays(parts, 1)
      : {
          day: 1,
          month: parts.month === 12 ? 1 : parts.month + 1,
          year: parts.month === 12 ? parts.year + 1 : parts.year,
        };
  return {
    endAt: utcMsForLocalMidnight(next, timeZone),
    periodKey: `${parts.year.toString()}-${pad2(parts.month)}${period === "day" ? `-${pad2(parts.day)}` : ""}`,
    startAt: utcMsForLocalMidnight(start, timeZone),
  };
}

/**
 * Resolve the current window for `spec` at `now`. For `rolling`, pass the
 * stored `windowStartAt` to reuse an in-progress window until it elapses.
 */
function validateDuration(now: number, durationMs: number): void {
  assertFinitePositive(
    durationMs,
    "INVALID_DURATION",
    "durationMs must be a positive safe integer",
  );
  assertFinitePositive(
    now + durationMs,
    "INVALID_DURATION",
    "window end must be a positive safe integer",
  );
}

export function resolveWindow(
  now: number,
  spec: WindowSpec,
  rollingStartAt?: number,
): ResolvedWindow {
  if (spec.kind === "calendar") {
    return resolveCalendar(now, spec);
  }
  validateDuration(now, spec.durationMs);
  if (spec.kind === "epoch") {
    const index = Math.floor(now / spec.durationMs);
    const startAt = index * spec.durationMs;
    return {
      endAt: startAt + spec.durationMs,
      periodKey: `e${index.toString()}`,
      startAt,
    };
  }
  const startAt =
    rollingStartAt !== undefined && now < rollingStartAt + spec.durationMs
      ? rollingStartAt
      : now;
  return {
    endAt: startAt + spec.durationMs,
    periodKey: `r${startAt.toString()}`,
    startAt,
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
