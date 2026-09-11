import { v } from "convex/values";

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
    kind: v.literal("rolling"),
    durationMs: v.number(),
  }),
  v.object({
    kind: v.literal("epoch"),
    durationMs: v.number(),
  }),
);

export const consumeResult = v.union(
  v.object({
    allowed: v.literal(true),
    remaining: v.number(),
    used: v.number(),
    limit: v.number(),
    periodKey: v.string(),
    resetsAt: v.number(),
  }),
  v.object({
    allowed: v.literal(false),
    remaining: v.number(),
    used: v.number(),
    limit: v.number(),
    periodKey: v.string(),
    resetsAt: v.number(),
  }),
);

export const remainingState = v.object({
  remaining: v.number(),
  used: v.number(),
  limit: v.number(),
  periodKey: v.string(),
  resetsAt: v.number(),
});
