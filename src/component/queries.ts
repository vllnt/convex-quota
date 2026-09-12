import { ConvexError, v } from "convex/values";

import {
  interpretWindowError,
  type ResolvedWindow,
  resolveWindow,
  windowPolicyKey,
  type WindowSpec,
} from "../shared";

import { query } from "./_generated/server";
import {
  remainingState,
  requireAllowanceInput,
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

export const remaining = query({
  args: {
    key: v.string(),
    limit: v.number(),
    scope: v.string(),
    subjectRef: v.string(),
    window: windowSpec,
  },
  handler: async (ctx, arguments_) => {
    requireAllowanceInput(arguments_);
    const row = await ctx.db
      .query("allowances")
      .withIndex("by_scope_subject_key", (q) =>
        q
          .eq("scope", arguments_.scope)
          .eq("subjectRef", arguments_.subjectRef)
          .eq("key", arguments_.key),
      )
      .first();
    const rollingStart =
      row !== null && arguments_.window.kind === "rolling"
        ? row.windowStartAt
        : undefined;
    const window = currentWindow(arguments_.window, rollingStart);
    if (row !== null && row.policyKey !== windowPolicyKey(arguments_.window)) {
      fail("POLICY_MISMATCH", "Use a new key to change window policy");
    }
    const used =
      row !== null && row.periodKey === window.periodKey ? row.used : 0;
    return {
      limit: arguments_.limit,
      periodKey: window.periodKey,
      remaining: Math.max(arguments_.limit - used, 0),
      resetsAt: window.endAt,
      used,
    };
  },
  returns: remainingState,
});
