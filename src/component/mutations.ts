import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import {
  DEFAULT_ERASE_BATCH,
  MAX_ERASE_BATCH,
  interpretWindowError,
  MAX_REF_LENGTH,
  resolveWindow,
  type ResolvedWindow,
  type WindowSpec,
} from "../shared";
import { consumeResult, windowSpec } from "./validators";

function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

function requireRef(value: string, name: string): void {
  if (value.length === 0 || value.length > MAX_REF_LENGTH) {
    fail("INVALID_REF", `${name} must be 1..${MAX_REF_LENGTH} characters`);
  }
}

function requirePositiveInt(value: number, name: string, code: string): void {
  if (!Number.isInteger(value) || value < 1 || !Number.isFinite(value)) {
    fail(code, `${name} must be a positive integer`);
  }
}

function currentWindow(
  spec: WindowSpec,
  rollingStartAt: number | undefined,
): ResolvedWindow {
  try {
    return resolveWindow(Date.now(), spec, rollingStartAt);
  } catch (error) {
    const parsed = interpretWindowError(error);
    fail(parsed.code, parsed.message);
  }
}

async function loadAllowance(
  ctx: MutationCtx,
  scope: string,
  subjectRef: string,
  key: string,
): Promise<Doc<"allowances"> | null> {
  return ctx.db
    .query("allowances")
    .withIndex("by_scope_subject_key", (q) =>
      q.eq("scope", scope).eq("subjectRef", subjectRef).eq("key", key),
    )
    .first();
}

export const consume = mutation({
  args: {
    amount: v.number(),
    key: v.string(),
    limit: v.number(),
    scope: v.string(),
    subjectRef: v.string(),
    window: windowSpec,
  },
  returns: consumeResult,
  handler: async (ctx, args) => {
    requireRef(args.subjectRef, "subjectRef");
    requireRef(args.key, "key");
    requirePositiveInt(args.limit, "limit", "INVALID_LIMIT");
    requirePositiveInt(args.amount, "amount", "INVALID_AMOUNT");

    const existing = await loadAllowance(
      ctx,
      args.scope,
      args.subjectRef,
      args.key,
    );
    const rollingStart =
      existing !== null && args.window.kind === "rolling"
        ? existing.windowStartAt
        : undefined;
    const window = currentWindow(args.window, rollingStart);
    const now = Date.now();
    const used =
      existing !== null && existing.periodKey === window.periodKey
        ? existing.used
        : 0;
    const nextUsed = used + args.amount;
    if (nextUsed > args.limit) {
      return {
        allowed: false as const,
        limit: args.limit,
        periodKey: window.periodKey,
        remaining: Math.max(args.limit - used, 0),
        resetsAt: window.endAt,
        used,
      };
    }

    const row = {
      key: args.key,
      limit: args.limit,
      periodKey: window.periodKey,
      scope: args.scope,
      subjectRef: args.subjectRef,
      updatedAt: now,
      used: nextUsed,
      windowEndAt: window.endAt,
      windowStartAt: window.startAt,
    };
    if (existing === null) {
      await ctx.db.insert("allowances", row);
    } else {
      await ctx.db.patch("allowances", existing._id, row);
    }
    return {
      allowed: true as const,
      limit: args.limit,
      periodKey: window.periodKey,
      remaining: Math.max(args.limit - nextUsed, 0),
      resetsAt: window.endAt,
      used: nextUsed,
    };
  },
});

export const refund = mutation({
  args: {
    amount: v.number(),
    key: v.string(),
    periodKey: v.string(),
    scope: v.string(),
    subjectRef: v.string(),
  },
  returns: v.object({
    refunded: v.boolean(),
    remaining: v.number(),
    used: v.number(),
  }),
  handler: async (ctx, args) => {
    requireRef(args.subjectRef, "subjectRef");
    requireRef(args.key, "key");
    requirePositiveInt(args.amount, "amount", "INVALID_AMOUNT");

    const existing = await loadAllowance(
      ctx,
      args.scope,
      args.subjectRef,
      args.key,
    );
    if (existing === null || existing.periodKey !== args.periodKey) {
      return {
        refunded: false,
        remaining:
          existing === null ? 0 : Math.max(existing.limit - existing.used, 0),
        used: existing?.used ?? 0,
      };
    }

    const used = Math.max(existing.used - args.amount, 0);
    await ctx.db.patch("allowances", existing._id, {
      updatedAt: Date.now(),
      used,
    });
    return {
      refunded: true,
      remaining: Math.max(existing.limit - used, 0),
      used,
    };
  },
});

export const eraseSubject = mutation({
  args: {
    batch: v.optional(v.number()),
    scope: v.string(),
    subjectRef: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    requireRef(args.subjectRef, "subjectRef");
    const raw = args.batch ?? DEFAULT_ERASE_BATCH;
    if (!Number.isInteger(raw)) {
      fail("INVALID_BATCH", "batch must be a positive integer");
    }
    if (raw < 1) {
      fail("INVALID_BATCH", "batch must be a positive integer");
    }
    const batch = Math.min(raw, MAX_ERASE_BATCH);
    const rows = await ctx.db
      .query("allowances")
      .withIndex("by_scope_subject_key", (q) =>
        q.eq("scope", args.scope).eq("subjectRef", args.subjectRef),
      )
      .take(batch);
    await Promise.all(rows.map((row) => ctx.db.delete("allowances", row._id)));
    if (rows.length === batch) {
      await ctx.scheduler.runAfter(0, api.mutations.eraseSubject, {
        batch,
        scope: args.scope,
        subjectRef: args.subjectRef,
      });
    }
    return rows.length;
  },
});
