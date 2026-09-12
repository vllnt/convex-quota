# API Reference — @vllnt/convex-quota

**Compatibility:** `convex@^1.45.0`

```ts
import { Quota } from "@vllnt/convex-quota";
const quota = new Quota(components.quota, { defaultScope: "global" });
```

The host owns authentication, authorization and policy. Never accept identity,
limit, amount, scope or window policy directly from an untrusted caller.
`subjectRef`, `key`, `scope`, and refund `periodKey` must be nonempty strings of
at most 256 UTF-16 code units (`INVALID_REF`). Amounts and limits must be positive
safe integers (`INVALID_AMOUNT`, `INVALID_LIMIT`). Scope defaults to `"global"`.
All component errors use `ConvexError({ code, message })`.

## Windows

- `{ kind: "calendar", period: "day" | "week" | "month", timeZone: string, weekStartsOn?: "monday" | "sunday" }`
- `{ kind: "rolling", durationMs: number }` — starts at first **allowed** consume.
- `{ kind: "epoch", durationMs: number }` — Unix epoch-aligned duration buckets.

Calendar weeks default to Monday. Timezones are validated by `Intl`; invalid
names throw `INVALID_TIME_ZONE`. Repeated midnight uses the earlier occurrence;
skipped midnight/date advances through the gap. Days can have 23 or 25 hours.
Durations must be positive safe integer milliseconds with a safely representable
end timestamp (`INVALID_DURATION`).

A `(scope, subjectRef, key)` has a fixed window policy. Changing kind, duration,
calendar period, timezone spelling, or effective week start throws
`POLICY_MISMATCH`, even after expiry. Use a new key for a new policy. Changing the
limit does not reset usage. `periodKey` is an opaque window label, not an
idempotency token; do not parse it or reuse it across keys, scopes, or erased rows.

## Mutations

### `consume(ctx, subjectRef, key, limit, window, opts?)`

`opts: { scope?: string; amount?: number }`; amount defaults to 1.
Returns `{ allowed: boolean, remaining: number, used: number, limit: number,
periodKey: string, resetsAt: number }`. Denied calls do not write. A lower limit
can return `used > limit` with zero remaining. Successful calls store the latest
limit for refund calculations. Not idempotent: deduplicate host event retries
in the same transaction (e.g. with `@vllnt/convex-idempotency`).

### `refund(ctx, subjectRef, key, amount, periodKey, scope?)`

Returns `{ refunded: boolean, used: number, remaining: number }` in all cases.
Subtracts amount, clamped at zero, only if the stored period matches and has not
expired. Otherwise returns `refunded: false` and the stored row's usage/remaining
(or zeros if absent); these are not a recomputed current-window allowance.
Remaining uses the limit from the last successful consume, not a later query or
denied call. A matching zero-usage row still returns `refunded: true`.

Privileged, **not idempotent**: repeated refunds subtract repeatedly. The host
must authorize and deduplicate compensation events transactionally. Erasing and
recreating the same calendar period can reuse a label: old refunds must not be
replayed against it.

### `eraseSubject(ctx, subjectRef, scope?, batch?)`

Returns the number deleted **this pass**, not the total. Deletes up to batch
rows (positive integer, default 200, capped at 500; `INVALID_BATCH` otherwise).
Schedules another pass if full, including a possible final empty pass. Scope is
always enforced. The host must quiesce writes until scheduled cleanup completes;
there is no tombstone and a racing consume can survive or be swept. Monitor the
Convex scheduler for failures. Component mutations are atomic within each pass,
not across the whole sweep.

## Queries

### `remaining(ctx, subjectRef, key, limit, window, scope?)`

Returns `{ remaining: number, used: number, limit: number, periodKey: string,
resetsAt: number }`. Computes the current window when the query runs; an expired
row reads as zero usage without writing. A query does not start a rolling window.
Time is server-sourced, but **time passing alone does not invalidate a cached
query/subscription**. Treat resetsAt as an expiry hint and use consume for the
authoritative decision. No timer or reset scheduler is installed.

## Isolation and operations

Mount multiple instances with `app.use(quota, { name: "webQuota" })` and
`app.use(quota, { name: "mobileQuota" })`; each client receives its own generated
component reference. Runtime scopes isolate indexed reads and erasures inside a
mount. One row per allowance means hot-key writes contend; different keys are
independent. No historical usage, receipts, logs or audit trail are stored.
Host audit instrumentation should avoid exposing opaque refs or sensitive data.

## Testing limits

`pnpm test:coverage` runs convex-test's mock backend, including adversarial
validation, civil-time transitions and scheduled-batch tests. It is not evidence
of real Convex OCC retries or real scheduler delivery.
