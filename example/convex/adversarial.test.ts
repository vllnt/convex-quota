import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { register } from "../../src/test";
import {
  resolveWindow,
  utcMsForLocalMidnight,
  windowPolicyKey,
} from "../../src/shared";

const modules = import.meta.glob("./**/*.ts");
const window = {
  kind: "calendar" as const,
  period: "day" as const,
  timeZone: "UTC",
};
const args = {
  subjectRef: "subject",
  key: "key",
  scope: "scope",
  limit: 3,
  window,
};
function setup() {
  const t = convexTest(schema, modules);
  register(t);
  return t;
}
afterEach(() => {
  vi.useRealTimers();
});

describe("adversarial boundaries", () => {
  test("rejects non-safe numeric allowances in reads and writes", async () => {
    const t = setup();
    for (const value of [
      NaN,
      Infinity,
      -Infinity,
      0,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      await expect(
        t.mutation(api.example.consume, { ...args, limit: value }),
      ).rejects.toThrow("INVALID_LIMIT");
      await expect(
        t.query(api.example.remaining, { ...args, limit: value }),
      ).rejects.toThrow("INVALID_LIMIT");
      await expect(
        t.mutation(api.example.consume, { ...args, amount: value }),
      ).rejects.toThrow("INVALID_AMOUNT");
      await expect(
        t.mutation(api.example.refund, {
          subjectRef: "s",
          key: "k",
          amount: value,
          periodKey: "p",
        }),
      ).rejects.toThrow("INVALID_AMOUNT");
    }
    const large = {
      ...args,
      limit: Number.MAX_SAFE_INTEGER,
      amount: Number.MAX_SAFE_INTEGER,
    };
    expect((await t.mutation(api.example.consume, large)).used).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(
      (await t.mutation(api.example.consume, { ...large, amount: 1 })).allowed,
    ).toBe(false);
  });
  test("validates every query ref and bounds mutation scopes and refund period keys", async () => {
    const t = setup();
    for (const value of ["", "x".repeat(257)]) {
      for (const field of ["subjectRef", "key", "scope"]) {
        await expect(
          t.query(api.example.remaining, { ...args, [field]: value }),
        ).rejects.toThrow("INVALID_REF");
      }
      await expect(
        t.mutation(api.example.consume, { ...args, scope: value }),
      ).rejects.toThrow("INVALID_REF");
      await expect(
        t.mutation(api.example.eraseSubject, { subjectRef: "s", scope: value }),
      ).rejects.toThrow("INVALID_REF");
      for (const field of ["scope", "periodKey"]) {
        await expect(
          t.mutation(api.example.refund, {
            subjectRef: "s",
            key: "k",
            scope: "scope",
            periodKey: "p",
            amount: 1,
            [field]: value,
          }),
        ).rejects.toThrow("INVALID_REF");
      }
    }
  });
  test("rejects unsafe, sub-millisecond and overflowing durations", () => {
    for (const kind of ["rolling", "epoch"] as const) {
      for (const durationMs of [
        NaN,
        Infinity,
        Number.MIN_VALUE,
        0.5,
        Number.MAX_VALUE,
        Number.MAX_SAFE_INTEGER,
      ]) {
        expect(() => resolveWindow(100, { kind, durationMs })).toThrow(
          "INVALID_DURATION",
        );
      }
    }
  });
  test("policy changes cannot reinterpret the stored allowance", async () => {
    const t = setup();
    await t.mutation(api.example.consume, args);
    for (const changed of [
      { ...window, timeZone: "Europe/Paris" },
      { kind: "rolling" as const, durationMs: 1000 },
      { kind: "epoch" as const, durationMs: 1000 },
    ]) {
      await expect(
        t.mutation(api.example.consume, { ...args, window: changed }),
      ).rejects.toThrow("POLICY_MISMATCH");
      await expect(
        t.query(api.example.remaining, { ...args, window: changed }),
      ).rejects.toThrow("POLICY_MISMATCH");
    }
    expect(windowPolicyKey({ ...window, period: "week" })).toBe(
      windowPolicyKey({ ...window, period: "week", weekStartsOn: "monday" }),
    );
    expect(
      windowPolicyKey({ ...window, period: "week", weekStartsOn: "sunday" }),
    ).not.toBe(windowPolicyKey({ ...window, period: "week" }));
    expect(
      (await t.mutation(api.example.consume, { ...args, limit: 4 })).used,
    ).toBe(2);
  });
  test("expired refund is rejected even before the next consume", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 0, 1));
    const t = setup();
    const consumed = await t.mutation(api.example.consume, args);
    vi.setSystemTime(consumed.resetsAt);
    expect(
      (
        await t.mutation(api.example.refund, {
          subjectRef: args.subjectRef,
          key: args.key,
          scope: args.scope,
          periodKey: consumed.periodKey,
          amount: 1,
        })
      ).refunded,
    ).toBe(false);
  });
  test("scheduled erasure drains bounded batches and preserves another scope", async () => {
    vi.useFakeTimers();
    const t = setup();
    for (let i = 0; i < 5; i++)
      await t.mutation(api.example.consume, { ...args, key: `k${i}` });
    await t.mutation(api.example.consume, { ...args, scope: "other" });
    expect(
      await t.mutation(api.example.eraseSubject, {
        subjectRef: args.subjectRef,
        scope: args.scope,
        batch: 2,
      }),
    ).toBe(2);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    for (let i = 0; i < 5; i++)
      expect(
        (await t.query(api.example.remaining, { ...args, key: `k${i}` })).used,
      ).toBe(0);
    expect(
      (await t.query(api.example.remaining, { ...args, scope: "other" })).used,
    ).toBe(1);
  });
});

describe("civil midnight transitions", () => {
  test("skipped midnight and skipped date advance instead of oscillating backward", () => {
    expect(utcMsForLocalMidnight({year: 2018, month: 11, day: 4}, "America/Sao_Paulo")).toBe(
      Date.UTC(2018, 10, 4, 3),
    );
    expect(utcMsForLocalMidnight({year: 2011, month: 12, day: 30}, "Pacific/Apia")).toBe(
      Date.UTC(2011, 11, 30, 10),
    );
  });
  test("Santiago skipped midnight starts at 04Z", () => {
    expect(utcMsForLocalMidnight({year: 2024, month: 9, day: 8}, "America/Santiago")).toBe(Date.UTC(2024, 8, 8, 4));
  });
  test("repeated midnight chooses the first occurrence", () => {
    expect(utcMsForLocalMidnight({year: 2020, month: 11, day: 1}, "America/Havana")).toBe(
      Date.UTC(2020, 10, 1, 4),
    );
  });
  test("DST days have 23 or 25 hours and contain the sampled instant", () => {
    for (const [now, hours] of [
      [Date.UTC(2026, 2, 29, 12), 23],
      [Date.UTC(2026, 9, 25, 12), 25],
    ] as const) {
      const result = resolveWindow(now, {
        ...window,
        timeZone: "Europe/Paris",
      });
      expect(result.endAt - result.startAt).toBe(hours * 3_600_000);
      expect(result.startAt).toBeLessThanOrEqual(now);
      expect(result.endAt).toBeGreaterThan(now);
    }
  });
});
