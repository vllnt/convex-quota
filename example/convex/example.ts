import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { Quota } from "../../src/client";
import { windowSpec } from "../../src/component/validators";

const quota = new Quota(components.quota);
const secondaryQuota = new Quota(components.secondary);
const tenantQuota = new Quota(components.quota, { defaultScope: "tenant" });

const consumeResult = v.union(
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

const remainingState = v.object({
  remaining: v.number(),
  used: v.number(),
  limit: v.number(),
  periodKey: v.string(),
  resetsAt: v.number(),
});

export const consume = mutation({
  args: {
    subjectRef: v.string(),
    key: v.string(),
    limit: v.number(),
    window: windowSpec,
    amount: v.optional(v.number()),
    scope: v.optional(v.string()),
  },
  returns: consumeResult,
  handler: (ctx, a) =>
    quota.consume(ctx, a.subjectRef, a.key, a.limit, a.window, {
      amount: a.amount,
      scope: a.scope,
    }),
});

export const remaining = query({
  args: {
    subjectRef: v.string(),
    key: v.string(),
    limit: v.number(),
    window: windowSpec,
    scope: v.optional(v.string()),
  },
  returns: remainingState,
  handler: (ctx, a) =>
    quota.remaining(ctx, a.subjectRef, a.key, a.limit, a.window, a.scope),
});

export const refund = mutation({
  args: {
    subjectRef: v.string(),
    key: v.string(),
    amount: v.number(),
    periodKey: v.string(),
    scope: v.optional(v.string()),
  },
  returns: v.object({
    refunded: v.boolean(),
    used: v.number(),
    remaining: v.number(),
  }),
  handler: (ctx, a) =>
    quota.refund(ctx, a.subjectRef, a.key, a.amount, a.periodKey, a.scope),
});

export const eraseSubject = mutation({
  args: {
    batch: v.optional(v.number()),
    scope: v.optional(v.string()),
    subjectRef: v.string(),
  },
  returns: v.number(),
  handler: (ctx, a) => quota.eraseSubject(ctx, a.subjectRef, a.scope, a.batch),
});

export const consumeSecondary = mutation({
  args: {subjectRef: v.string(), key: v.string(), scope: v.string(), limit: v.number(), window: windowSpec},
  returns: consumeResult,
  handler: (ctx, a) => secondaryQuota.consume(ctx, a.subjectRef, a.key, a.limit, a.window, {scope: a.scope}),
});

export const consumeTenant = mutation({
  args: {
    subjectRef: v.string(),
    key: v.string(),
    limit: v.number(),
    window: windowSpec,
  },
  returns: consumeResult,
  handler: (ctx, a) =>
    tenantQuota.consume(ctx, a.subjectRef, a.key, a.limit, a.window),
});

export const remainingTenant = query({
  args: {
    subjectRef: v.string(),
    key: v.string(),
    limit: v.number(),
    window: windowSpec,
  },
  returns: remainingState,
  handler: (ctx, a) =>
    tenantQuota.remaining(ctx, a.subjectRef, a.key, a.limit, a.window),
});
