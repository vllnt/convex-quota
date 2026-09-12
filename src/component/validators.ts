import { ConvexError, v } from "convex/values";

import { MAX_REF_LENGTH } from "../shared";

export function requireRef(value: string, name: string): void {
  if (value.length === 0 || value.length > MAX_REF_LENGTH) {
    throw new ConvexError({
      code: "INVALID_REF",
      message: `${name} must be 1..${MAX_REF_LENGTH.toString()} UTF-16 code units`,
    });
  }
}

export function requirePositiveInt(
  value: number,
  name: string,
  code: string,
): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ConvexError({
      code,
      message: `${name} must be a positive safe integer`,
    });
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
