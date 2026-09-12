import { ConvexError, v } from "convex/values";

import {
  DEFAULT_ERASE_BATCH,
  interpretWindowError,
  MAX_ERASE_BATCH,
  type ResolvedWindow,
  resolveWindow,
  windowPolicyKey,
  type WindowSpec,
} from "../shared";

import { api } from "./_generated/api";
import type { Doc as Document_ } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import {
  consumeResult,
  requireAllowanceInput,
  requirePositiveInt,
  requireRef,
  windowSpec,
} from "./validators";

function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
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
  {
    key,
    scope,
    subjectRef,
  }: { key: string; scope: string; subjectRef: string },
): Promise<Document_<"allowances"> | null> {
  return ctx.db
    .query("allowances")
    .withIndex("by_scope_subject_key", (q) =>
      q.eq("scope", scope).eq("subjectRef", subjectRef).eq("key", key),
    )
    .first();
}

function allowanceWindow(
  existing: Document_<"allowances"> | null,
  spec: WindowSpec,
) {
  const rollingStart =
    existing !== null && spec.kind === "rolling"
      ? existing.windowStartAt
      : undefined;
  const window = currentWindow(spec, rollingStart);
  const policyKey = windowPolicyKey(spec);
  if (existing !== null && existing.policyKey !== policyKey) {
    fail("POLICY_MISMATCH", "Use a new key to change window policy");
  }
  const used =
    existing !== null && existing.periodKey === window.periodKey
      ? existing.used
      : 0;
  return { policyKey, used, window };
}

function consumptionState(window: ResolvedWindow, limit: number, used: number) {
  return {
    limit,
    periodKey: window.periodKey,
    remaining: Math.max(limit - used, 0),
    resetsAt: window.endAt,
    used,
  };
}

async function saveAllowance(
  ctx: MutationCtx,
  existing: Document_<"allowances"> | null,
  row: Omit<Document_<"allowances">, "_creationTime" | "_id">,
) {
  await (existing === null
    ? ctx.db.insert("allowances", row)
    : ctx.db.patch("allowances", existing._id, row));
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
  handler: async (ctx, arguments_) => {
    requireAllowanceInput(arguments_);
    requirePositiveInt(arguments_.amount, "amount", "INVALID_AMOUNT");

    const existing = await loadAllowance(ctx, arguments_);
    const { policyKey, used, window } = allowanceWindow(
      existing,
      arguments_.window,
    );
    // Compare before addition: even safe operands can have an unsafe sum.
    const allowed = arguments_.amount <= arguments_.limit - used;
    const nextUsed = allowed ? used + arguments_.amount : used;
    const result = {
      allowed,
      ...consumptionState(window, arguments_.limit, nextUsed),
    };
    if (!allowed) return result;
    await saveAllowance(ctx, existing, {
      key: arguments_.key,
      limit: arguments_.limit,
      periodKey: window.periodKey,
      policyKey,
      scope: arguments_.scope,
      subjectRef: arguments_.subjectRef,
      updatedAt: Date.now(),
      used: nextUsed,
      windowEndAt: window.endAt,
      windowStartAt: window.startAt,
    });
    return result;
  },
  returns: consumeResult,
});

export const refund = mutation({
  args: {
    amount: v.number(),
    key: v.string(),
    periodKey: v.string(),
    scope: v.string(),
    subjectRef: v.string(),
  },
  handler: async (ctx, arguments_) => {
    requireRef(arguments_.subjectRef, "subjectRef");
    requireRef(arguments_.key, "key");
    requireRef(arguments_.scope, "scope");
    requireRef(arguments_.periodKey, "periodKey");
    requirePositiveInt(arguments_.amount, "amount", "INVALID_AMOUNT");

    const existing = await loadAllowance(ctx, arguments_);
    if (
      existing?.periodKey !== arguments_.periodKey ||
      Date.now() >= existing.windowEndAt
    ) {
      return {
        refunded: false,
        remaining:
          existing === null ? 0 : Math.max(existing.limit - existing.used, 0),
        used: existing?.used ?? 0,
      };
    }

    const used = Math.max(existing.used - arguments_.amount, 0);
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
  returns: v.object({
    refunded: v.boolean(),
    remaining: v.number(),
    used: v.number(),
  }),
});

export const eraseSubject = mutation({
  args: {
    batch: v.optional(v.number()),
    scope: v.string(),
    subjectRef: v.string(),
  },
  handler: async (ctx, arguments_) => {
    requireRef(arguments_.subjectRef, "subjectRef");
    requireRef(arguments_.scope, "scope");
    const raw = arguments_.batch ?? DEFAULT_ERASE_BATCH;
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
        q.eq("scope", arguments_.scope).eq("subjectRef", arguments_.subjectRef),
      )
      .take(batch);
    await Promise.all(rows.map((row) => ctx.db.delete("allowances", row._id)));
    if (rows.length === batch) {
      await ctx.scheduler.runAfter(0, api.mutations.eraseSubject, {
        batch,
        scope: arguments_.scope,
        subjectRef: arguments_.subjectRef,
      });
    }
    return rows.length;
  },
  returns: v.number(),
});
