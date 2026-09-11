import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { interpretWindowError, resolveWindow, type WindowSpec } from "../shared";
import { remainingState, windowSpec } from "./validators";

function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
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

export const remaining = query({
  args: {
    subjectRef: v.string(),
    key: v.string(),
    scope: v.string(),
    limit: v.number(),
    window: windowSpec,
  },
  returns: remainingState,
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("allowances")
      .withIndex("by_scope_subject_key", (q) =>
        q.eq("scope", args.scope).eq("subjectRef", args.subjectRef).eq("key", args.key),
      )
      .unique();
    const rollingStart =
      row !== null && args.window.kind === "rolling" ? row.windowStartAt : undefined;
    const window = currentWindow(args.window, rollingStart);
    const used = row !== null && row.periodKey === window.periodKey ? row.used : 0;
    return {
      remaining: Math.max(args.limit - used, 0),
      used,
      limit: args.limit,
      periodKey: window.periodKey,
      resetsAt: window.endAt,
    };
  },
});
