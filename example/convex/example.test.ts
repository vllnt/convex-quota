import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { register } from "../../src/test";
import {
  clampEraseBatch,
  interpretWindowError,
  isoWeek,
  MAX_ERASE_BATCH,
  MAX_REF_LENGTH,
  resolveWindow,
  utcMsForLocalMidnight,
  zonedParts,
} from "../../src/shared";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  register(t);
  return t;
}

const dayUtc = {
  kind: "calendar" as const,
  period: "day" as const,
  timeZone: "UTC",
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("quota — consume / remaining", () => {
  test("first consume of 1 against limit 3 is allowed", async () => {
    const t = setup();
    const expected = resolveWindow(Date.now(), dayUtc);
    const r = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "plays",
      limit: 3,
      window: dayUtc,
    });
    expect(r.allowed).toBe(true);
    expect(r.used).toBe(1);
    expect(r.remaining).toBe(2);
    expect(r.periodKey).toBe(expected.periodKey);
    const rem = await t.query(api.example.remaining, {
      subjectRef: "u1",
      key: "plays",
      limit: 3,
      window: dayUtc,
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
      window: dayUtc,
    });
    const denied = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "plays",
      limit: 2,
      window: dayUtc,
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
      window: dayUtc,
    });
    expect(rem).toMatchObject({ limit: 5, remaining: 5, used: 0 });
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
      window: dayUtc,
    });
    const refunded = await t.mutation(api.example.refund, {
      subjectRef: "u1",
      key: "plays",
      amount: 2,
      periodKey: used.periodKey,
    });
    expect(refunded).toEqual({ refunded: true, remaining: 4, used: 1 });
  });

  test("refund against the wrong period is a no-op", async () => {
    const t = setup();
    await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "plays",
      limit: 5,
      window: dayUtc,
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
    expect(missed).toEqual({ refunded: false, remaining: 0, used: 0 });
  });

  test("eraseSubject deletes the subject's rows", async () => {
    const t = setup();
    await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "plays",
      limit: 3,
      window: dayUtc,
    });
    await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "extra",
      limit: 3,
      window: dayUtc,
    });
    expect(
      await t.mutation(api.example.eraseSubject, { subjectRef: "u1", batch: 1 }),
    ).toBe(1);
    expect(await t.mutation(api.example.eraseSubject, { subjectRef: "u1" })).toBe(
      1,
    );
    const rem = await t.query(api.example.remaining, {
      subjectRef: "u1",
      key: "plays",
      limit: 3,
      window: dayUtc,
    });
    expect(rem.used).toBe(0);
  });
});

describe("quota — windows", () => {
  test("calendar week (Monday) keys ISO week of now", async () => {
    const t = setup();
    const expected = resolveWindow(Date.now(), {
      kind: "calendar",
      period: "week",
      timeZone: "UTC",
    });
    const r = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "weekly",
      limit: 1,
      window: { kind: "calendar", period: "week", timeZone: "UTC" },
    });
    expect(r.periodKey).toBe(expected.periodKey);
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
    expect(r.periodKey.endsWith("-sun")).toBe(true);
  });

  test("calendar month of now", async () => {
    const t = setup();
    const expected = resolveWindow(Date.now(), {
      kind: "calendar",
      period: "month",
      timeZone: "UTC",
    });
    const r = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "monthly",
      limit: 10,
      window: { kind: "calendar", period: "month", timeZone: "UTC" },
    });
    expect(r.periodKey).toBe(expected.periodKey);
  });

  test("rolling window reuses start until duration elapses", async () => {
    const t = setup();
    const window = { kind: "rolling" as const, durationMs: 80 };
    const first = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "codex",
      limit: 2,
      window,
    });
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
    await delay(120);
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
    const t = setup();
    const window = { kind: "epoch" as const, durationMs: 5_000 };
    const expected = resolveWindow(Date.now(), window);
    const r = await t.mutation(api.example.consume, {
      subjectRef: "u1",
      key: "epoch",
      limit: 1,
      window,
    });
    expect(r.periodKey).toBe(expected.periodKey);
  });
});

describe("quota — validation", () => {
  test("empty and oversized refs are rejected", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.consume, {
        subjectRef: "",
        key: "plays",
        limit: 1,
        window: dayUtc,
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.example.consume, {
        subjectRef: "u1",
        key: "",
        limit: 1,
        window: dayUtc,
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.example.consume, {
        subjectRef: "x".repeat(MAX_REF_LENGTH + 1),
        key: "plays",
        limit: 1,
        window: dayUtc,
      }),
    ).rejects.toThrow();
  });

  test("non-positive limit and amount are rejected", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.consume, {
        subjectRef: "u1",
        key: "plays",
        limit: 0,
        window: dayUtc,
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.example.consume, {
        subjectRef: "u1",
        key: "plays",
        limit: 1,
        amount: 0,
        window: dayUtc,
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

  test("eraseSubject rejects empty subjectRef and bad batch", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.eraseSubject, { subjectRef: "" }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.example.eraseSubject, { subjectRef: "u1", batch: 0 }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.example.eraseSubject, { subjectRef: "u1", batch: 1.5 }),
    ).rejects.toThrow();
    expect(
      await t.mutation(api.example.eraseSubject, {
        subjectRef: "nobody",
        batch: 10_000,
      }),
    ).toBe(0);
  });
});

describe("quota — client defaults", () => {
  test("tenant client isolates scope", async () => {
    const t = setup();
    await t.mutation(api.example.consumeTenant, {
      subjectRef: "u1",
      key: "plays",
      limit: 1,
      window: dayUtc,
    });
    const globalRem = await t.query(api.example.remaining, {
      subjectRef: "u1",
      key: "plays",
      limit: 1,
      window: dayUtc,
    });
    expect(globalRem.used).toBe(0);
    const tenantRem = await t.query(api.example.remainingTenant, {
      subjectRef: "u1",
      key: "plays",
      limit: 1,
      window: dayUtc,
    });
    expect(tenantRem.used).toBe(1);
  });
});

describe("window math", () => {
  test("isoWeek around year boundary", () => {
    expect(isoWeek(2018, 12, 31)).toEqual({ week: 1, year: 2019 });
    expect(isoWeek(2021, 1, 1)).toEqual({ week: 53, year: 2020 });
  });

  test("zonedParts in Paris", () => {
    const parts = zonedParts(Date.UTC(2026, 5, 15, 22, 30, 0), "Europe/Paris");
    expect(parts.day).toBe(16);
    expect(parts.weekday).toBe(2);
  });

  test("utcMsForLocalMidnight is the local start of day", () => {
    const start = utcMsForLocalMidnight(2026, 6, 15, "Europe/Paris");
    const parts = zonedParts(start, "Europe/Paris");
    expect(parts).toMatchObject({
      day: 15,
      hour: 0,
      minute: 0,
      month: 6,
      second: 0,
      year: 2026,
    });
  });

  test("resolveWindow epoch and rolling", () => {
    expect(resolveWindow(10_000, { durationMs: 5_000, kind: "epoch" })).toEqual({
      endAt: 15_000,
      periodKey: "e2",
      startAt: 10_000,
    });
    const rolling = resolveWindow(100, { durationMs: 50, kind: "rolling" }, 80);
    expect(rolling.periodKey).toBe("r80");
    const fresh = resolveWindow(200, { durationMs: 50, kind: "rolling" }, 80);
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

  test("calendar month rolls in December", () => {
    const r = resolveWindow(Date.UTC(2026, 11, 31, 12, 0, 0), {
      kind: "calendar",
      period: "month",
      timeZone: "UTC",
    });
    expect(r.periodKey).toBe("2026-12");
  });

  test("calendar day keys differ across midnight", () => {
    const before = resolveWindow(Date.UTC(2026, 5, 15, 23, 0, 0), dayUtc);
    const after = resolveWindow(Date.UTC(2026, 5, 16, 1, 0, 0), dayUtc);
    expect(before.periodKey).toBe("2026-06-15");
    expect(after.periodKey).toBe("2026-06-16");
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

describe("clampEraseBatch", () => {
  test("clamps and rejects", () => {
    expect(clampEraseBatch(10)).toBe(10);
    expect(clampEraseBatch(MAX_ERASE_BATCH + 10)).toBe(MAX_ERASE_BATCH);
    expect(() => clampEraseBatch(0)).toThrow();
  });
});
