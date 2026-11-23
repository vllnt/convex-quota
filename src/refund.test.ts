/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api } from "./component/_generated/api.js";
import schema from "./component/schema.js";

const modules = import.meta.glob("./component/**/*.ts");

const base = { key: "k", scope: "s", subjectRef: "u" };
const window = {
  kind: "calendar" as const,
  period: "day" as const,
  timeZone: "UTC",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 0, 1, 12));
});

afterEach(() => {
  vi.useRealTimers();
});

test("a refund that changes nothing does not write the allowance", async () => {
  const t = convexTest(schema, modules);
  const consumed = await t.mutation(api.mutations.consume, {
    ...base,
    amount: 2,
    limit: 5,
    window,
  });
  const refundArguments = { ...base, periodKey: consumed.periodKey };
  expect(
    await t.mutation(api.mutations.refund, { ...refundArguments, amount: 2 }),
  ).toEqual({
    refunded: true,
    remaining: 5,
    used: 0,
  });
  const before = await t.run((ctx) => ctx.db.query("allowances").first());
  vi.setSystemTime(Date.UTC(2026, 0, 1, 13));
  expect(
    await t.mutation(api.mutations.refund, { ...refundArguments, amount: 1 }),
  ).toEqual({
    refunded: true,
    remaining: 5,
    used: 0,
  });
  expect(await t.run((ctx) => ctx.db.query("allowances").first())).toEqual(
    before,
  );
});
