import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { interpretWindowError, resolveWindow, type WindowSpec } from "../shared";
import { consumeResult, windowSpec } from "./validators";

function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

function requireRef(value: string, name: string): void {
  if (value.length === 0) {
    fail("INVALID_REF", `${name} must be a non-empty string`);
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
): ReturnType<typeof resolveWindow> {
  try {
    return resolveWindow(Date.now(), spec, rollingStartAt);
  } catch (error) {
    const parsed = interpretWindowError(error);
    fail(parsed.code, parsed.message);
  }
}

export const consume = mutation({
  args: {
    subjectRef: v.string(),
    key: v.string(),
    scope: v.string(),
    limit: v.number(),
    amount: v.number(),
    window: windowSpec,
  },
  returns: consumeResult,
  handler: async (ctx, args) => {
    requireRef(args.subjectRef, "subjectRef");
    requireRef(args.key, "key");
    requirePositiveInt(args.limit, "limit", "INVALID_LIMIT");
    requirePositiveInt(args.amount, "amount", "INVALID_AMOUNT");

    const existing = await ctx.db
      .query("allowances")
      .withIndex("by_scope_subject_key", (q) =>
        q.eq("scope", args.scope).eq("subjectRef", args.subjectRef).eq("key", args.key),
      )
      .unique();

    const rollingStart =
      existing !== null && args.window.kind === "rolling"
        ? existing.windowStartAt
        : undefined;
    const window = currentWindow(args.window, rollingStart);
    const now = Date.now();
    const sameWindow = existing !== null && existing.periodKey === window.periodKey;
    const used = sameWindow ? existing.used : 0;
    const nextUsed = used + args.amount;
    const remaining = Math.max(args.limit - nextUsed, 0);
    const snapshot = {
      remaining: Math.max(args.limit - used, 0),
      used,
      limit: args.limit,
      periodKey: window.periodKey,
      resetsAt: window.endAt,
    };

    if (nextUsed > args.limit) {
      return { allowed: false as const, ...snapshot };
    }

    if (existing === null) {
      await ctx.db.insert("allowances", {
        subjectRef: args.subjectRef,
        key: args.key,
        scope: args.scope,
        limit: args.limit,
        used: nextUsed,
        periodKey: window.periodKey,
        windowStartAt: window.startAt,
        windowEndAt: window.endAt,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch("allowances", existing._id, {
        limit: args.limit,
        used: nextUsed,
        periodKey: window.periodKey,
        windowStartAt: window.startAt,
        windowEndAt: window.endAt,
        updatedAt: now,
      });
    }

    return {
      allowed: true as const,
      remaining,
      used: nextUsed,
      limit: args.limit,
      periodKey: window.periodKey,
      resetsAt: window.endAt,
    };
  },
});

export const refund = mutation({
  args: {
    subjectRef: v.string(),
    key: v.string(),
    scope: v.string(),
    amount: v.number(),
    periodKey: v.string(),
  },
  returns: v.object({
    refunded: v.boolean(),
    used: v.number(),
    remaining: v.number(),
  }),
  handler: async (ctx, args) => {
    requireRef(args.subjectRef, "subjectRef");
    requireRef(args.key, "key");
    requirePositiveInt(args.amount, "amount", "INVALID_AMOUNT");

    const existing = await ctx.db
      .query("allowances")
      .withIndex("by_scope_subject_key", (q) =>
        q.eq("scope", args.scope).eq("subjectRef", args.subjectRef).eq("key", args.key),
      )
      .unique();

    if (existing === null || existing.periodKey !== args.periodKey) {
      return { refunded: false, used: existing?.used ?? 0, remaining: 0 };
    }

    const used = Math.max(existing.used - args.amount, 0);
    await ctx.db.patch("allowances", existing._id, {
      used,
      updatedAt: Date.now(),
    });
    return {
      refunded: true,
      used,
      remaining: Math.max(existing.limit - used, 0),
    };
  },
});

export const eraseSubject = mutation({
  args: { subjectRef: v.string(), scope: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    requireRef(args.subjectRef, "subjectRef");
    const rows = await ctx.db
      .query("allowances")
      .withIndex("by_scope_subject_key", (q) =>
        q.eq("scope", args.scope).eq("subjectRef", args.subjectRef),
      )
      .collect();
    for (const row of rows) {
      await ctx.db.delete("allowances", row._id);
    }
    return rows.length;
  },
});
