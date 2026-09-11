# API Reference — @vllnt/convex-quota

**Compatibility:** `convex@^1.45.0`

```ts
import { Quota } from "@vllnt/convex-quota";

const quota = new Quota(components.quota, { defaultScope: "global" });
```

Time is server-sourced. `subjectRef` and `key` are opaque host strings.

## Windows

- `{ kind: "calendar", period: "day" | "week" | "month", timeZone, weekStartsOn?: "monday" | "sunday" }`
- `{ kind: "rolling", durationMs }` — window starts at first consume, resets after duration
- `{ kind: "epoch", durationMs }` — `floor(now / durationMs)` buckets

## Mutations

### `consume(ctx, subjectRef, key, limit, window, opts?)`

`opts`: `{ scope?, amount? }` (`amount` default `1`).

Returns `{ allowed, remaining, used, limit, periodKey, resetsAt }`.

### `refund(ctx, subjectRef, key, amount, periodKey, scope?)`

No-op when the stored period does not match (cannot refund a previous window).

### `eraseSubject(ctx, subjectRef, scope?)`

Deletes every allowance row for the subject in the scope.

## Queries

### `remaining(ctx, subjectRef, key, limit, window, scope?)`

Computes the **current** window. A stale row from a previous period reads as
`used: 0` without a write.
