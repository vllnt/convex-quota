import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { Idempotency } from "@vllnt/convex-idempotency";
import { Quota, type ConsumeResult, type RefundResult } from "../../src/client";
import { windowSpec } from "../../src/component/validators";

const quota = new Quota(components.quota);
const secondaryQuota = new Quota(components.secondary);
const tenantQuota = new Quota(components.quota, { defaultScope: "tenant" });
const consumeIdempotency = new Idempotency<ConsumeResult>(
  components.idempotency,
);
const refundIdempotency = new Idempotency<RefundResult>(components.idempotency);

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
  args: {
    subjectRef: v.string(),
    key: v.string(),
    scope: v.string(),
    limit: v.number(),
    window: windowSpec,
  },
  returns: consumeResult,
  handler: (ctx, a) =>
    secondaryQuota.consume(ctx, a.subjectRef, a.key, a.limit, a.window, {
      scope: a.scope,
    }),
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

// Host pairing with @vllnt/convex-idempotency, documented in the README. The
// claim, the consume and the completion share one mutation transaction, so
// they commit or roll back together.
const DAILY_PLAYS = 5;
const daily = {
  kind: "calendar",
  period: "day",
  timeZone: "Europe/Paris",
} as const;

export const play = mutation({
  args: { requestId: v.string() },
  returns: consumeResult,
  handler: async (ctx, { requestId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const scope = identity.tokenIdentifier; // dedupe per caller
    const key = `consume:${requestId}`; // namespaced per operation
    const claim = await consumeIdempotency.begin(ctx, key, { scope });
    if (claim.state === "done" && claim.result !== undefined) {
      return claim.result;
    }
    if (claim.state !== "fresh") throw new Error("Retry shortly");
    const result = await quota.consume(
      ctx,
      identity.tokenIdentifier,
      "plays",
      DAILY_PLAYS,
      daily,
    );
    const done = await consumeIdempotency.complete(ctx, key, result, {
      scope,
      claimId: claim.claimId,
    });
    if (!done.recorded) throw new Error(`Claim lost: ${done.reason}`);
    return result;
  },
});

// Same as `play`, but the host fails after the consume to prove the rollback.
export const playThenFail = mutation({
  args: { requestId: v.string() },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const scope = identity.tokenIdentifier;
    await consumeIdempotency.begin(ctx, `consume:${requestId}`, { scope });
    await quota.consume(
      ctx,
      identity.tokenIdentifier,
      "plays",
      DAILY_PLAYS,
      daily,
    );
    throw new Error("host failure after consume");
  },
});

// Refunds are privileged: internal, so only trusted host code (a webhook or a
// scheduled job after a verified cancellation) can call it. The caller derives
// `subjectRef` and `periodKey` from its own record of the play.
export const refundPlay = internalMutation({
  args: {
    subjectRef: v.string(),
    requestId: v.string(),
    periodKey: v.string(),
  },
  returns: v.object({
    refunded: v.boolean(),
    used: v.number(),
    remaining: v.number(),
  }),
  handler: async (ctx, { subjectRef, requestId, periodKey }) => {
    const scope = subjectRef;
    const key = `refund:${requestId}`; // namespaced per operation
    const claim = await refundIdempotency.begin(ctx, key, { scope });
    if (claim.state === "done" && claim.result !== undefined) {
      return claim.result;
    }
    if (claim.state !== "fresh") throw new Error("Retry shortly");
    const result = await quota.refund(ctx, subjectRef, "plays", 1, periodKey);
    const done = await refundIdempotency.complete(ctx, key, result, {
      scope,
      claimId: claim.claimId,
    });
    if (!done.recorded) throw new Error(`Claim lost: ${done.reason}`);
    return result;
  },
});
