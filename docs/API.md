# API reference: @vllnt/convex-quota

Peer dependency: `convex@^1.45.0`. Quick start, common tasks and the errors
table are in the [README](../README.md).

The host owns authentication, authorization and policy. Never accept identity,
`limit`, `amount`, `scope` or window policy directly from an untrusted caller.
Every component error is a `ConvexError` whose `data` is `{ code, message }`;
see [Error codes](#error-codes).

## Entry points

| Import                                        | Exports                                                                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `@vllnt/convex-quota`                         | class `Quota`; types `QuotaComponent`, `QuotaOptions`, `ConsumeOptions`, `ConsumeResult`, `RemainingState`, `RefundResult`, `WindowSpec` |
| `@vllnt/convex-quota/convex.config`           | default export: the [component definition](#convexconfig), for `app.use(quota)`                                                          |
| `@vllnt/convex-quota/test`                    | function [`register`](#register) for `convex-test`                                                                                       |
| `@vllnt/convex-quota/_generated/component.js` | type [`ComponentApi`](#componentapi)                                                                                                     |

`./convex.config.js` and `./_generated/component` are aliases of the
`./convex.config` and `./_generated/component.js` entries; `./package.json` is
also exported. The package is ESM only.

## Client

### `Quota`

```ts
// convex/quota.ts
import { Quota } from "@vllnt/convex-quota";
import { components } from "./_generated/api";

export const quota = new Quota(components.quota, { defaultScope: "global" });
```

`new Quota(component: QuotaComponent, options?: QuotaOptions)`. Pass the
generated `components.<mount name>` reference. All methods take the Convex
`ctx` of the calling function: mutation methods need `ctx.runMutation`
(a mutation or action), `remaining` needs `ctx.runQuery` (a query, mutation or
action).

Shared argument rules:

- `subjectRef`, `key`, `scope` and the refund `periodKey` are opaque host
  strings of 1 to 256 UTF-16 code units (`INVALID_REF`).
- `limit` and `amount` are positive safe integers (`INVALID_LIMIT`,
  `INVALID_AMOUNT`).
- `scope` defaults to `QuotaOptions.defaultScope`, which defaults to
  `"global"`. An allowance is identified by `(scope, subjectRef, key)`.
- Time is always read on the server (`Date.now()` inside the component). No
  method takes a caller's time.

### `QuotaOptions`

```ts
type QuotaOptions = {
  /** Namespace applied when a call omits `scope`. Default `"global"`. */
  defaultScope?: string;
};
```

### `consume`

`consume(ctx, subjectRef: string, key: string, limit: number, window: WindowSpec, options?: ConsumeOptions): Promise<ConsumeResult>`

Adds `amount` (default 1) to the current window's usage if `amount <= limit - used`;
otherwise returns `allowed: false` and writes nothing. An allowed call stores the
row (usage, the latest `limit`, the window and its policy). A denied call does
not start a rolling window and does not store the new limit. Not idempotent: a
retried call consumes again; pair it with `@vllnt/convex-idempotency` in the
same host mutation (README, Common tasks).

Throws `INVALID_REF`, `INVALID_LIMIT`, `INVALID_AMOUNT`, `INVALID_DURATION`,
`INVALID_TIME_ZONE`, `POLICY_MISMATCH`.

### `ConsumeOptions`

```ts
type ConsumeOptions = {
  /** Units to consume. Default `1`. */
  amount?: number;
  scope?: string;
};
```

### `ConsumeResult`

```ts
type ConsumeResult = {
  allowed: boolean;
  limit: number; // the limit passed to this call
  periodKey: string; // opaque window label
  remaining: number; // max(limit - used, 0)
  resetsAt: number; // window end, Unix ms
  used: number; // usage after this call
};
```

A lower `limit` than the stored usage returns `used` above `limit` with
`remaining: 0`.

### `remaining`

`remaining(ctx, subjectRef: string, key: string, limit: number, window: WindowSpec, scope?: string): Promise<RemainingState>`

Computes the current window when the query runs and never writes. A row from an
earlier window reads as zero usage. A query does not start a rolling window:
with no stored row, a rolling window is reported as starting now. Time passing
alone does not invalidate a Convex query subscription, so treat `resetsAt` as an
expiry hint and use `consume` for the authoritative decision. No timer or reset
scheduler is installed.

Throws `INVALID_REF`, `INVALID_LIMIT`, `INVALID_DURATION`, `INVALID_TIME_ZONE`,
`POLICY_MISMATCH`.

### `RemainingState`

```ts
type RemainingState = {
  limit: number;
  periodKey: string;
  remaining: number;
  resetsAt: number;
  used: number;
};
```

### `refund`

`refund(ctx, subjectRef: string, key: string, amount: number, periodKey: string, scope?: string): Promise<RefundResult>`

Subtracts `amount` from usage, clamped at zero, only if the stored row's
`periodKey` equals `periodKey` and its window has not ended. Otherwise returns
`refunded: false` with the stored row's `used` and `remaining` (zeros if there
is no row) and writes nothing; those numbers are not recomputed for the current
window. `remaining` uses the limit stored by the last allowed `consume`. A
matching row whose `used` is already 0 returns `refunded: true` without a write.
`refund` does not check the window policy.

Privileged and not idempotent: repeated refunds subtract repeatedly. Call it
only from verified host records (for example an `internalMutation`), and
deduplicate refund events in the host transaction. Erasing and recreating the
same calendar period can reuse a `periodKey`, so old refunds must not be
replayed against it.

Throws `INVALID_REF`, `INVALID_AMOUNT`.

### `RefundResult`

```ts
type RefundResult = {
  refunded: boolean;
  remaining: number;
  used: number;
};
```

### `eraseSubject`

`eraseSubject(ctx, subjectRef: string, scope?: string, batch?: number): Promise<number>`

Deletes up to `batch` of the subject's rows in `scope` and returns the number
deleted in this first pass, not the total. `batch` defaults to 200; values above
500 are capped to 500; a value that is not a positive integer throws
`INVALID_BATCH`. When a pass deletes a full batch, the component schedules
another pass immediately, which can end with an empty pass. Each pass is atomic;
the whole sweep is not. Erasure is not a tombstone: stop new consumes for the
subject until the scheduled passes finish, or a racing consume can survive or be
deleted. Watch the Convex scheduler for failed passes.

Throws `INVALID_REF`, `INVALID_BATCH`.

### `QuotaComponent`

The function references the client calls, matching `components.quota`:
`mutations.consume`, `mutations.refund`, `mutations.eraseSubject` and
`queries.remaining`, all `internal` references. Use it to type a parameter that
receives a mounted component.

## Windows

### `WindowSpec`

```ts
type WindowSpec =
  | { kind: "epoch"; durationMs: number }
  | { kind: "rolling"; durationMs: number }
  | {
      kind: "calendar";
      period: "day" | "month" | "week";
      timeZone: string;
      weekStartsOn?: "monday" | "sunday";
    };
```

- `calendar`: the local day, week or month in `timeZone`, an IANA name
  validated by `Intl.DateTimeFormat` (`INVALID_TIME_ZONE`). Weeks start on
  Monday unless `weekStartsOn: "sunday"`. Days can last 23 or 25 hours. A
  repeated local midnight uses the earlier instant; a skipped midnight or date
  advances through the gap.
- `rolling`: starts at the first allowed `consume` and lasts `durationMs`; the
  next allowed `consume` after it ends starts a new one.
- `epoch`: buckets of `durationMs` aligned to the Unix epoch
  (`floor(now / durationMs)`).
- `durationMs` must be a positive safe integer, and the server time plus
  `durationMs` must be a safe integer (`INVALID_DURATION`).

The window policy of a `(scope, subjectRef, key)` is fixed. Changing the kind,
`durationMs`, calendar `period`, `timeZone` spelling, or the effective week
start of a `week` window throws `POLICY_MISMATCH` in `consume` and `remaining`,
even after the window ended. Use a new `key` for a new policy. Changing `limit`
does not reset usage.

`periodKey` is an opaque window label, not an idempotency token or receipt. Do
not parse it, and do not reuse it across keys, scopes or erased rows.

## Component

### `convex.config`

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import quota from "@vllnt/convex-quota/convex.config";

const app = defineApp();
app.use(quota);
export default app;
```

The default export is `defineComponent("quota")`. Mount it more than once with
`app.use(quota, { name: "webQuota" })`; each mount has its own tables and its
own `components.<name>` reference. Runtime `scope` values isolate indexed reads
and erasure inside one mount. One row per allowance means concurrent writes on
the same key contend; different keys are independent. No usage history,
receipts, logs or audit trail are stored.

### `ComponentApi`

`ComponentApi<Name extends string | undefined = string | undefined>` from
`@vllnt/convex-quota/_generated/component.js` is the generated type of the
mounted component's functions. `components.quota` in a host app has this type,
and it is assignable to `QuotaComponent`.

## Testing

### `register`

`register(t: Pick<TestConvex<typeof schema>, "registerComponent">, name = "quota"): void`

From `@vllnt/convex-quota/test`. Registers the component's schema and modules
with a `convex-test` instance built from any host schema. It ships as
TypeScript source and calls Vite's `import.meta.glob`, so the consuming app
needs `convex-test`, `vitest` and `vite`; see the README section
"Testing your app".

The package's own tests run in `convex-test`'s in-memory backend, including
adversarial input, civil-time transitions and scheduled erase batches. They do
not prove real Convex OCC retries or real scheduler delivery.

## Error codes

| Code                | Message                                                                                   | Thrown by                                          |
| ------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `INVALID_REF`       | `<name> must be 1..256 UTF-16 code units` for `subjectRef`, `key`, `scope` or `periodKey` | `consume`, `remaining`, `refund`, `eraseSubject`   |
| `INVALID_LIMIT`     | `limit must be a positive safe integer`                                                   | `consume`, `remaining`                             |
| `INVALID_AMOUNT`    | `amount must be a positive safe integer`                                                  | `consume`, `refund`                                |
| `INVALID_DURATION`  | `durationMs must be a positive safe integer`                                              | `consume`, `remaining` (rolling and epoch windows) |
| `INVALID_DURATION`  | `window end must be a positive safe integer`                                              | `consume`, `remaining` (rolling and epoch windows) |
| `INVALID_TIME_ZONE` | the rejected `timeZone` value                                                             | `consume`, `remaining` (calendar windows)          |
| `INVALID_BATCH`     | `batch must be a positive integer`                                                        | `eraseSubject`                                     |
| `POLICY_MISMATCH`   | `Use a new key to change window policy`                                                   | `consume`, `remaining`                             |

Read the code from `error.data.code` after checking
`error instanceof ConvexError`.
