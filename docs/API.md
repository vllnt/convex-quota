# API Reference — @vllnt/convex-quota

**Compatibility:** `convex@^1.45.0`

```ts
import { Quota } from "@vllnt/convex-quota";

const quota = new Quota(components.quota, { defaultScope: "global" });
```

Time is server-sourced. `subjectRef` and `key` are opaque host strings (1..256 characters).
Never take `limit` or `amount` from an end-user.

## Windows

- `{ kind: "calendar", period: "day" | "week" | "month", timeZone, weekStartsOn?: "monday" | "sunday" }`
- `{ kind: "rolling", durationMs }` — window starts at first consume, resets after duration
- `{ kind: "epoch", durationMs }` — `floor(now / durationMs)` buckets

Invalid time zones throw `INVALID_TIME_ZONE`. Non-positive `durationMs` throws `INVALID_DURATION`.

## Mutations

### `consume(ctx, subjectRef, key, limit, window, opts?)`

`opts`: `{ scope?, amount? }` (`amount` default `1`).

Returns `{ allowed, remaining, used, limit, periodKey, resetsAt }`.
Not idempotent — wrap retries with `@vllnt/convex-idempotency`.

### `refund(ctx, subjectRef, key, amount, periodKey, scope?)`

Subtracts `amount` (not below 0) when `periodKey` matches the stored window.
Otherwise `{ refunded: false }`. Privileged host operation.

### `eraseSubject(ctx, subjectRef, scope?, batch?)`

Deletes up to `batch` rows (default 200, max 500) and reschedules until clean.

## Queries

### `remaining(ctx, subjectRef, key, limit, window, scope?)`

Computes the **current** window. A stale row from a previous period reads as
`used: 0` without a write.
