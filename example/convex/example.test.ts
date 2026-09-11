import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { register } from "../../src/test";
import { interpretWindowError, isoWeek, resolveWindow, utcMsForLocalMidnight, zonedParts } from "../../src/shared";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  register(t);
  return t;
}

const dayParis = {
  kind: "day" as const,
  window: {
    kind: "calendar" as const,
    period: "day" as const,
    timeZone: "Europe/Paris",
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 5, 15, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("quota — consume / remaining", () => {
  test("first consume of 1 against limit 3 is allowed", async () => {
    const t = setup();
    const r = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "plays",
      limit: 3,
      window: dayParis.window,
    });
    expect(r.allowed).toBe(true);
    expect(r.used).toBe(1);
    expect(r.remaining).toBe(2);
    expect(r.periodKey).toBe("2026-06-15");
    const rem = await t.query(api.example.remaining, {
      subjectRef: "u1",
      key: "plays",
      limit: 3,
      window: dayParis.window,
    });
    expect(rem.used).toBe(1);
    expect(rem.remaining).toBe(2);
  });

  test("exhausting the limit then denies", async () => {
    const t = setup();
    await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "plays",
      limit: 2,
      amount: 2,
      window: dayParis.window,
    });
    const denied = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "plays",
      limit: 2,
      window: dayParis.window,
    });
    expect(denied.allowed).toBe(false);
    expect(denied.used).toBe(2);
    expect(denied.remaining).toBe(0);
  });

  test("remaining with no row reports a full allowance", async () => {
    const t = setup();
    const rem = await t.query(api.example.remaining, {
      subjectRef: "nobody",
      key: "plays",
      limit: 5,
      window: dayParis.window,
    });
    expect(rem).toMatchObject({ used: 0, remaining: 5, limit: 5 });
  });

  test("a new calendar day resets used", async () => {
    const t = setup();
    await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "plays",
      limit: 1,
      window: dayParis.window,
    });
    vi.setSystemTime(Date.UTC(2026, 5, 16, 12, 0, 0));
    const rem = await t.query(api.example.remaining, {
      subjectRef: "u1",
      key: "plays",
      limit: 1,
      window: dayParis.window,
    });
    expect(rem.used).toBe(0);
    expect(rem.periodKey).toBe("2026-06-16");
    const r = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "plays",
      limit: 1,
      window: dayParis.window,
    });
    expect(r.allowed).toBe(true);
    expect(r.used).toBe(1);
    expect(r.periodKey).toBe("2026-06-16");
  });
});

describe("quota — refund / erase", () => {
  test("refund returns units in the same period", async () => {
    const t = setup();
    const used = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "plays",
      limit: 5,
      amount: 3,
      window: dayParis.window,
    });
    const refunded = await t.mutation(api.example.refund, {
      subjectRef: "u1",
      key: "plays",
      amount: 2,
      periodKey: used.periodKey,
    });
    expect(refunded).toEqual({ refunded: true, used: 1, remaining: 4 });
  });

  test("refund against the wrong period is a no-op", async () => {
    const t = setup();
    await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "plays",
      limit: 5,
      window: dayParis.window,
    });
    const missed = await t.mutation(api.example.refund, {
      subjectRef: "u1",
      key: "plays",
      amount: 1,
      periodKey: "1999-01-01",
    });
    expect(missed.refunded).toBe(false);
  });

  test("refund with no row is a no-op", async () => {
    const t = setup();
    const missed = await t.mutation(api.example.refund, {
      subjectRef: "missing",
      key: "plays",
      amount: 1,
      periodKey: "2026-06-15",
    });
    expect(missed).toEqual({ refunded: false, used: 0, remaining: 0 });
  });

  test("eraseSubject deletes the subject's rows", async () => {
    const t = setup();
    await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "plays",
      limit: 3,
      window: dayParis.window,
    });
    expect(await t.mutation(api.example.eraseSubject, { subjectRef: "u1" })).toBe(1);
    const rem = await t.query(api.example.remaining, {
      subjectRef: "u1",
      key: "plays",
      limit: 3,
      window: dayParis.window,
    });
    expect(rem.used).toBe(0);
  });
});

describe("quota — windows", () => {
  test("calendar week (Monday) keys ISO week", async () => {
    const t = setup();
    const r = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "weekly",
      limit: 1,
      window: { kind: "calendar", period: "week", timeZone: "UTC" },
    });
    expect(r.periodKey).toBe("2026-W25");
  });

  test("calendar week starting Sunday", async () => {
    const t = setup();
    const r = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "weekly",
      limit: 1,
      window: {
        kind: "calendar",
        period: "week",
        timeZone: "UTC",
        weekStartsOn: "sunday",
      },
    });
    expect(r.allowed).toBe(true);
    expect(r.periodKey.startsWith("2026-W")).toBe(true);
  });

  test("calendar month", async () => {
    const t = setup();
    const r = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "monthly",
      limit: 10,
      window: { kind: "calendar", period: "month", timeZone: "UTC" },
    });
    expect(r.periodKey).toBe("2026-06");
  });

  test("calendar month rolls in December", async () => {
    vi.setSystemTime(Date.UTC(2026, 11, 31, 12, 0, 0));
    const t = setup();
    const r = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "monthly",
      limit: 1,
      window: { kind: "calendar", period: "month", timeZone: "UTC" },
    });
    expect(r.periodKey).toBe("2026-12");
  });

  test("rolling window reuses start until duration elapses", async () => {
    const t = setup();
    const window = { kind: "rolling" as const, durationMs: 5_000 };
    const first = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "codex",
      limit: 2,
      window,
    });
    vi.setSystemTime(Date.now() + 1_000);
    const second = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "codex",
      limit: 2,
      window,
    });
    expect(second.periodKey).toBe(first.periodKey);
    expect(second.used).toBe(2);
    const rem = await t.query(api.example.remaining, {
      subjectRef: "u1",
      key: "codex",
      limit: 2,
      window,
    });
    expect(rem.used).toBe(2);
    vi.setSystemTime(Date.now() + 10_000);
    const third = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "codex",
      limit: 2,
      window,
    });
    expect(third.periodKey).not.toBe(first.periodKey);
    expect(third.used).toBe(1);
  });

  test("epoch window buckets by duration", async () => {
    vi.setSystemTime(10_000);
    const t = setup();
    const r = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "epoch",
      limit: 1,
      window: { kind: "epoch", durationMs: 5_000 },
    });
    expect(r.periodKey).toBe("e2");
  });
});

describe("quota — validation", () => {
  test("empty subjectRef is rejected", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.consume, {
        subjectRef: "",
        key: "plays",
        limit: 1,
        window: dayParis.window,
      }),
    ).rejects.toThrow();
  });

  test("empty key is rejected", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.consume, {
        subjectRef: "u1",
        key: "",
        limit: 1,
        window: dayParis.window,
      }),
    ).rejects.toThrow();
  });

  test("non-positive limit is rejected", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.consume, {
        subjectRef: "u1",
        key: "plays",
        limit: 0,
        window: dayParis.window,
      }),
    ).rejects.toThrow();
  });

  test("non-positive amount is rejected", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.consume, {
        subjectRef: "u1",
        key: "plays",
        limit: 1,
        amount: 0,
        window: dayParis.window,
      }),
    ).rejects.toThrow();
  });

  test("invalid duration is rejected", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.consume, {
        subjectRef: "u1",
        key: "plays",
        limit: 1,
        window: { kind: "rolling", durationMs: -1 },
      }),
    ).rejects.toThrow();
    await expect(
      t.query(api.example.remaining, {
        subjectRef: "u1",
        key: "plays",
        limit: 1,
        window: { kind: "epoch", durationMs: 0 },
      }),
    ).rejects.toThrow();
  });

  test("invalid time zone is rejected", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.consume, {
        subjectRef: "u1",
        key: "plays",
        limit: 1,
        window: { kind: "calendar", period: "day", timeZone: "Not/AZone" },
      }),
    ).rejects.toThrow();
    await expect(
      t.query(api.example.remaining, {
        subjectRef: "u1",
        key: "plays",
        limit: 1,
        window: { kind: "calendar", period: "day", timeZone: "Not/AZone" },
      }),
    ).rejects.toThrow();
  });

  test("refund rejects empty refs and bad amounts", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.refund, {
        subjectRef: "",
        key: "plays",
        amount: 1,
        periodKey: "x",
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.example.refund, {
        subjectRef: "u1",
        key: "",
        amount: 1,
        periodKey: "x",
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.example.refund, {
        subjectRef: "u1",
        key: "plays",
        amount: 0,
        periodKey: "x",
      }),
    ).rejects.toThrow();
  });

  test("eraseSubject rejects empty subjectRef", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.eraseSubject, { subjectRef: "" }),
    ).rejects.toThrow();
  });
});

describe("quota — client defaults", () => {
  test("tenant client isolates scope", async () => {
    const t = setup();
    await t.mutation(api.example.consumeTenant, {
      subjectRef: "u1",
      key: "plays",
      limit: 1,
      window: dayParis.window,
    });
    const globalRem = await t.query(api.example.remaining, {
      subjectRef: "u1",
      key: "plays",
      limit: 1,
      window: dayParis.window,
    });
    expect(globalRem.used).toBe(0);
    const tenantRem = await t.query(api.example.remainingTenant, {
      subjectRef: "u1",
      key: "plays",
      limit: 1,
      window: dayParis.window,
    });
    expect(tenantRem.used).toBe(1);
  });
});

describe("window math", () => {
  test("isoWeek around year boundary", () => {
    expect(isoWeek(2018, 12, 31)).toEqual({ year: 2019, week: 1 });
    expect(isoWeek(2021, 1, 1)).toEqual({ year: 2020, week: 53 });
  });

  test("zonedParts in Paris", () => {
    const parts = zonedParts(Date.UTC(2026, 5, 15, 22, 30, 0), "Europe/Paris");
    expect(parts.day).toBe(16);
    expect(parts.weekday).toBe(2);
  });

  test("utcMsForLocalMidnight is the local start of day", () => {
    const start = utcMsForLocalMidnight(2026, 6, 15, "Europe/Paris");
    const parts = zonedParts(start, "Europe/Paris");
    expect(parts).toMatchObject({ year: 2026, month: 6, day: 15, hour: 0, minute: 0, second: 0 });
  });

  test("resolveWindow epoch and rolling", () => {
    expect(resolveWindow(10_000, { kind: "epoch", durationMs: 5_000 })).toEqual({
      periodKey: "e2",
      startAt: 10_000,
      endAt: 15_000,
    });
    const rolling = resolveWindow(100, { kind: "rolling", durationMs: 50 }, 80);
    expect(rolling.periodKey).toBe("r80");
    const fresh = resolveWindow(200, { kind: "rolling", durationMs: 50 }, 80);
    expect(fresh.startAt).toBe(200);
  });

  test("Sunday-start week and Monday-start week from a Sunday", () => {
    const sunday = Date.UTC(2026, 5, 14, 12, 0, 0);
    const sun = resolveWindow(sunday, {
      kind: "calendar",
      period: "week",
      timeZone: "UTC",
      weekStartsOn: "sunday",
    });
    const mon = resolveWindow(sunday, {
      kind: "calendar",
      period: "week",
      timeZone: "UTC",
    });
    expect(sun.periodKey).not.toBe(mon.periodKey);
  });
});

describe("interpretWindowError", () => {
  test("maps duration, timezone, and non-Error values", () => {
    expect(interpretWindowError(new Error("INVALID_DURATION: nope"))).toEqual({
      code: "INVALID_DURATION",
      message: " nope",
    });
    expect(interpretWindowError(new Error("INVALID_TIME_ZONE: X"))).toEqual({
      code: "INVALID_TIME_ZONE",
      message: "X",
    });
    expect(interpretWindowError("boom")).toEqual({
      code: "INVALID_TIME_ZONE",
      message: "boom",
    });
  });
});

describe("zonedParts fallbacks", () => {
  test("empty formatToParts uses numeric and weekday defaults", () => {
    const original = Intl.DateTimeFormat;
    class FakeFormat {
      formatToParts() {
        return [];
      }
    }
    Object.defineProperty(Intl, "DateTimeFormat", {
      configurable: true,
      value: FakeFormat,
    });
    try {
      const parts = zonedParts(0, "UTC");
      expect(parts.year).toBe(0);
      expect(parts.weekday).toBe(0);
    } finally {
      Object.defineProperty(Intl, "DateTimeFormat", {
        configurable: true,
        value: original,
      });
    }
  });
});
