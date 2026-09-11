import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Sandboxed tables — the quota ledger's own concern. `subjectRef`, `key`, and
 * `scope` are opaque host-owned strings. The row is the current window only;
 * a new period overwrites `used` in place (no history table).
 */
export default defineSchema({
  allowances: defineTable({
    subjectRef: v.string(),
    key: v.string(),
    scope: v.string(),
    limit: v.number(),
    used: v.number(),
    periodKey: v.string(),
    windowStartAt: v.number(),
    windowEndAt: v.number(),
    updatedAt: v.number(),
  }).index("by_scope_subject_key", ["scope", "subjectRef", "key"]),
});
