import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Sandboxed tables — the quota ledger's own concern. `subjectRef`, `key`, and
 * `scope` are opaque host-owned strings. The row stores the current window;
 * a new period overwrites `used` in place (no history table).
 */
export default defineSchema({
  allowances: defineTable({
    key: v.string(),
    limit: v.number(),
    periodKey: v.string(),
    policyKey: v.string(),
    scope: v.string(),
    subjectRef: v.string(),
    updatedAt: v.number(),
    used: v.number(),
    windowEndAt: v.number(),
    windowStartAt: v.number(),
  }).index("by_scope_subject_key", ["scope", "subjectRef", "key"]),
});
