import { ConvexError, v } from "convex/values";

import {
  interpretWindowError,
  MAX_REF_LENGTH,
  type ResolvedWindow,
  resolveWindow,
  type WindowSpec,
} from "../shared.js";

export function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

export function requireRef(value: string, name: string): void {
  if (value.length === 0 || value.length > MAX_REF_LENGTH) {
    fail(
      "INVALID_REF",
      `${name} must be 1..${MAX_REF_LENGTH.toString()} UTF-16 code units`,
    );
  }
}

export function requirePositiveInt(
  value: number,
  name: string,
  code: string,
): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(code, `${name} must be a positive safe integer`);
  }
}

/** Resolve the current window at server time, mapping failures to ConvexError. */
export function currentWindow(
  spec: WindowSpec,
  rollingStartAt: number | undefined,
): ResolvedWindow {
  try {
    return resolveWindow(Date.now(), spec, rollingStartAt);
  } catch (error) {
    const parsed = interpretWindowError(error);
    return fail(parsed.code, parsed.message);
  }
}

export function requireAllowanceInput(input: {
  key: string;
  limit: number;
  scope: string;
  subjectRef: string;
}): void {
  requireRef(input.subjectRef, "subjectRef");
  requireRef(input.key, "key");
  requireRef(input.scope, "scope");
  requirePositiveInt(input.limit, "limit", "INVALID_LIMIT");
}

export const calendarPeriod = v.union(
  v.literal("day"),
  v.literal("week"),
  v.literal("month"),
);

export const weekStartsOn = v.union(v.literal("monday"), v.literal("sunday"));

export const windowSpec = v.union(
  v.object({
    kind: v.literal("calendar"),
    period: calendarPeriod,
    timeZone: v.string(),
    weekStartsOn: v.optional(weekStartsOn),
  }),
  v.object({
    durationMs: v.number(),
    kind: v.literal("rolling"),
  }),
  v.object({
    durationMs: v.number(),
    kind: v.literal("epoch"),
  }),
);

export const consumeResult = v.union(
  v.object({
    allowed: v.literal(true),
    limit: v.number(),
    periodKey: v.string(),
    remaining: v.number(),
    resetsAt: v.number(),
    used: v.number(),
  }),
  v.object({
    allowed: v.literal(false),
    limit: v.number(),
    periodKey: v.string(),
    remaining: v.number(),
    resetsAt: v.number(),
    used: v.number(),
  }),
);

export const remainingState = v.object({
  limit: v.number(),
  periodKey: v.string(),
  remaining: v.number(),
  resetsAt: v.number(),
  used: v.number(),
});
