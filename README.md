# @vllnt/convex-quota

TypeScript Convex component for quotas and allowances: daily, weekly, monthly, rolling or epoch reset windows per user or key, with a readable remaining count.

## For coding agents

Docs for the installed version ship in the package: `README.md`, `CHANGELOG.md`, `llms.txt`, `docs/API.md` and typed `src/` under `node_modules/@vllnt/convex-quota/`. Read them before writing code.

## When to use

Use it when:

- A user, API key or tenant gets a number of actions per calendar day, week or month in a given IANA timezone, and the UI shows how many are left and when they reset.
- An allowance resets on a rolling duration that starts at first use, or on fixed epoch-aligned buckets such as every hour.
- A cancelled action should give its units back within the same window.

Do not use it when:

- You need throttling or rate limiting of bursts: use `@convex-dev/rate-limiter`.
- The count never resets: a balance that is spent and topped up (`@vllnt/convex-wallet`), or an API key's lifetime use limit (`@vllnt/convex-api-keys`).
- You need billable usage records rolled up per billing period: use `@vllnt/convex-metering`.

## Install

```bash
pnpm add @vllnt/convex-quota
```

## Quick start

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import quota from "@vllnt/convex-quota/convex.config";

const app = defineApp();
app.use(quota);
export default app;
```

```ts
// convex/plays.ts
import { v } from "convex/values";
import { Quota } from "@vllnt/convex-quota";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";

const quota = new Quota(components.quota);
const DAILY_PLAYS = 5; // host-owned, never from the client
const daily = {
  kind: "calendar",
  period: "day",
  timeZone: "Europe/Paris",
} as const;

export const play = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const r = await quota.consume(
      ctx,
      identity.tokenIdentifier,
      "plays",
      DAILY_PLAYS,
      daily,
    );
    if (!r.allowed) throw new Error(`Daily cap reached until ${r.resetsAt}`);
    return null;
  },
});

export const playsLeft = query({
  args: {},
  returns: v.object({ remaining: v.number(), resetsAt: v.number() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const { remaining, resetsAt } = await quota.remaining(
      ctx,
      identity.tokenIdentifier,
      "plays",
      DAILY_PLAYS,
      daily,
    );
    return { remaining, resetsAt };
  },
});
```

Run `npx convex dev` after mounting so `components.quota` is generated. The host
authenticates, derives the `subjectRef` (here the caller's `tokenIdentifier`)
and owns the limit and the window; the component never sees the end user's
request.

[![Convex component](https://img.shields.io/badge/convex-component-EE342F.svg)](https://www.convex.dev/components)
[![npm version](https://img.shields.io/npm/v/@vllnt/convex-quota.svg)](https://www.npmjs.com/package/@vllnt/convex-quota)
[![CI status](https://github.com/vllnt/convex-quota/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-quota/actions/workflows/ci.yml)
[![MIT license](https://img.shields.io/npm/l/@vllnt/convex-quota.svg)](./LICENSE)

## API

Full reference: [docs/API.md](./docs/API.md).

| Export                                                | Kind                           | What it does                                                                                       |
| ----------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| [`Quota`](./docs/API.md#quota)                        | class (`@vllnt/convex-quota`)  | Client: `new Quota(components.quota, options?)`                                                    |
| [`consume`](./docs/API.md#consume)                    | method, `runMutation` ctx      | Use `amount` units if they fit; returns `{ allowed, used, remaining, limit, periodKey, resetsAt }` |
| [`remaining`](./docs/API.md#remaining)                | method, `runQuery` ctx         | Read the current window without writing; returns `{ used, remaining, limit, periodKey, resetsAt }` |
| [`refund`](./docs/API.md#refund)                      | method, `runMutation` ctx      | Give units back to the stored, unexpired window; returns `{ refunded, used, remaining }`           |
| [`eraseSubject`](./docs/API.md#erasesubject)          | method, `runMutation` ctx      | Delete a subject's rows in one scope in batches; returns the count deleted in the first pass       |
| [`QuotaOptions`](./docs/API.md#quotaoptions)          | type                           | Constructor options: `{ defaultScope?: string }`                                                   |
| [`ConsumeOptions`](./docs/API.md#consumeoptions)      | type                           | `consume` options: `{ amount?: number; scope?: string }`                                           |
| [`WindowSpec`](./docs/API.md#windowspec)              | type                           | Window policy: `calendar` (`day` / `week` / `month` in a timezone), `rolling` or `epoch`           |
| [`ConsumeResult`](./docs/API.md#consumeresult)        | type                           | Return type of `consume`                                                                           |
| [`RemainingState`](./docs/API.md#remainingstate)      | type                           | Return type of `remaining`                                                                         |
| [`RefundResult`](./docs/API.md#refundresult)          | type                           | Return type of `refund`                                                                            |
| [`QuotaComponent`](./docs/API.md#quotacomponent)      | type                           | The function references the client needs (`components.quota`)                                      |
| [`convex.config` default](./docs/API.md#convexconfig) | component (`/convex.config`)   | The component definition for `app.use(...)`, mounted as `quota` by default                         |
| [`register`](./docs/API.md#register)                  | function (`/test`)             | `register(t, name = "quota")` mounts the component in a `convex-test` instance                     |
| [`ComponentApi`](./docs/API.md#componentapi)          | type (`/_generated/component`) | Generated type of the mounted component's functions                                                |

## Common tasks

**Pick a window.** A `WindowSpec` is fixed per `(scope, subjectRef, key)`:

```ts
// convex/windows.ts
import type { WindowSpec } from "@vllnt/convex-quota";

// Resets at local midnight in Paris.
export const daily: WindowSpec = {
  kind: "calendar",
  period: "day",
  timeZone: "Europe/Paris",
};
// Resets on Sunday at local midnight (the default week start is Monday).
export const weekly: WindowSpec = {
  kind: "calendar",
  period: "week",
  timeZone: "America/New_York",
  weekStartsOn: "sunday",
};
// Resets on the 1st of each month at UTC midnight.
export const monthly: WindowSpec = {
  kind: "calendar",
  period: "month",
  timeZone: "UTC",
};
// 24 hours from the first allowed consume.
export const rolling: WindowSpec = { kind: "rolling", durationMs: 86_400_000 };
// Fixed hourly buckets aligned to the Unix epoch.
export const hourly: WindowSpec = { kind: "epoch", durationMs: 3_600_000 };
```

**Consume several units or use a tenant scope.** Pass `{ amount, scope }` as
the last argument of `consume`, or set `defaultScope` once with
`new Quota(components.quota, { defaultScope: "tenant-a" })`. `remaining`,
`refund` and `eraseSubject` take `scope` as their last optional argument.

```ts
// convex/exports.ts
import { v } from "convex/values";
import { Quota } from "@vllnt/convex-quota";
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";

const quota = new Quota(components.quota);
const MONTHLY_CREDITS = 100;
const EXPORT_COST = 10; // host-owned, never from the client
const monthly = { kind: "calendar", period: "month", timeZone: "UTC" } as const;

export const startExport = mutation({
  args: {},
  returns: v.object({ allowed: v.boolean(), remaining: v.number() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const { allowed, remaining } = await quota.consume(
      ctx,
      identity.tokenIdentifier,
      "credits",
      MONTHLY_CREDITS,
      monthly,
      { amount: EXPORT_COST, scope: "exports" },
    );
    return { allowed, remaining };
  },
});
```

An `amount` larger than what is left is denied in full; nothing is consumed
partially.

**Make `consume` and `refund` retry-safe.** `consume` and `refund` are not
idempotent: a retried mutation consumes again. Claim the request with
`@vllnt/convex-idempotency` inside the same host mutation; the claim, the
consume and the completion commit or roll back together. Mount both components:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import idempotency from "@vllnt/convex-idempotency/convex.config";
import quota from "@vllnt/convex-quota/convex.config";

const app = defineApp();
app.use(quota);
app.use(idempotency);
export default app;
```

```ts
// convex/safe_plays.ts
import { v } from "convex/values";
import { Idempotency } from "@vllnt/convex-idempotency";
import {
  Quota,
  type ConsumeResult,
  type RefundResult,
} from "@vllnt/convex-quota";
import { components } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";

const quota = new Quota(components.quota);
const consumeIdempotency = new Idempotency<ConsumeResult>(
  components.idempotency,
);
const refundIdempotency = new Idempotency<RefundResult>(components.idempotency);
const DAILY_PLAYS = 5;
const daily = {
  kind: "calendar",
  period: "day",
  timeZone: "Europe/Paris",
} as const;
const consumeResult = v.object({
  allowed: v.boolean(),
  limit: v.number(),
  periodKey: v.string(),
  remaining: v.number(),
  resetsAt: v.number(),
  used: v.number(),
});

export const play = mutation({
  args: { requestId: v.string() },
  returns: consumeResult,
  handler: async (ctx, { requestId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const scope = identity.tokenIdentifier; // dedupe per caller
    const key = `consume:${requestId}`; // namespaced per operation
    const claim = await consumeIdempotency.begin(ctx, key, { scope });
    if (claim.state === "done" && claim.result !== undefined) {
      return claim.result;
    }
    if (claim.state !== "fresh") throw new Error("Retry shortly");
    const result = await quota.consume(
      ctx,
      identity.tokenIdentifier,
      "plays",
      DAILY_PLAYS,
      daily,
    );
    const done = await consumeIdempotency.complete(ctx, key, result, {
      scope,
      claimId: claim.claimId,
    });
    if (!done.recorded) throw new Error(`Claim lost: ${done.reason}`);
    return result;
  },
});

// Privileged: only trusted host code (a webhook handler or a scheduled job
// after a verified cancellation) calls this, with values from the host's own
// record of the play, never from an end-user argument.
export const refundPlay = internalMutation({
  args: {
    subjectRef: v.string(),
    requestId: v.string(),
    periodKey: v.string(),
  },
  returns: v.object({
    refunded: v.boolean(),
    used: v.number(),
    remaining: v.number(),
  }),
  handler: async (ctx, { subjectRef, requestId, periodKey }) => {
    const scope = subjectRef;
    const key = `refund:${requestId}`; // namespaced per operation
    const claim = await refundIdempotency.begin(ctx, key, { scope });
    if (claim.state === "done" && claim.result !== undefined) {
      return claim.result;
    }
    if (claim.state !== "fresh") throw new Error("Retry shortly");
    const result = await quota.refund(ctx, subjectRef, "plays", 1, periodKey);
    const done = await refundIdempotency.complete(ctx, key, result, {
      scope,
      claimId: claim.claimId,
    });
    if (!done.recorded) throw new Error(`Claim lost: ${done.reason}`);
    return result;
  },
});
```

The same `play` and `refundPlay` are tested in
[`example/convex/idempotency.test.ts`](https://github.com/vllnt/convex-quota/blob/main/example/convex/idempotency.test.ts):
a duplicate `requestId` replays the stored result and consumes once, a new
`requestId` consumes again, the caller `scope` isolates identical request IDs,
a host failure after `consume` rolls back both the allowance and the claim, and
a refund deduplicated by `requestId` refunds once. Caveats:

- A denied consume (`allowed: false`) is recorded too, so a replay returns the
  same denial even if units were freed in between.
- The claim lives for the idempotency component's done grace (24 hours by
  default). A retry after that is a new request and consumes again.
- Do no external work between `begin` and `complete`; use a separate action
  for network calls.
- Namespace the idempotency key per operation (`consume:${requestId}`,
  `refund:${requestId}`). The ledger is keyed by scope and key only, so two
  operations sharing a key would replay each other's stored result.
- Never accept refund IDs or a `periodKey` from the end user: a public refund
  endpoint lets a caller fabricate cancellations and clear their own quota.

**Mount the component more than once.** Each named mount has its own tables:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import quota from "@vllnt/convex-quota/convex.config";

const app = defineApp();
app.use(quota, { name: "webQuota" });
app.use(quota, { name: "mobileQuota" });
export default app;
```

```ts
// convex/mounts.ts
import { Quota } from "@vllnt/convex-quota";
import { components } from "./_generated/api";

export const webQuota = new Quota(components.webQuota);
export const mobileQuota = new Quota(components.mobileQuota);
```

Use `scope` instead when you need namespaces at runtime inside one mount.

**Erase a subject.** `quota.eraseSubject(ctx, subjectRef, scope?, batch?)`
deletes that subject's rows in one scope and schedules further passes until a
pass deletes fewer than `batch` rows. Stop new consumes for the subject first.

**Show the remaining count in a UI.** Read it through your own query, as
`playsLeft` does in the [Quick start](#quick-start). There is no React entry
point. A subscription does not refresh when the window resets on its own; use
`resetsAt` to know when to read again.

**Test your app.** Mount the component in `convex-test`; see
[Testing your app](#testing-your-app).

## Errors and fixes

Invalid input throws a `ConvexError` whose `data` is `{ code, message }`:

| Error (`data.code`) | Message                                                                        | Cause                                                                                                                      | Fix                                                                                  |
| ------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `INVALID_REF`       | `subjectRef must be 1..256 UTF-16 code units` (or `key`, `scope`, `periodKey`) | An empty string or more than 256 UTF-16 code units in `subjectRef`, `key`, `scope` or the refund `periodKey`               | Pass a non-empty value of at most 256 code units; hash longer identifiers            |
| `INVALID_LIMIT`     | `limit must be a positive safe integer`                                        | `consume` or `remaining` got a `limit` that is 0, negative, fractional, `NaN`, infinite or above `Number.MAX_SAFE_INTEGER` | Pass a positive integer limit from host config                                       |
| `INVALID_AMOUNT`    | `amount must be a positive safe integer`                                       | `consume` or `refund` got an `amount` that is 0, negative, fractional or not a safe integer                                | Pass a positive integer, or omit it on `consume` (default 1)                         |
| `INVALID_DURATION`  | `durationMs must be a positive safe integer`                                   | A `rolling` or `epoch` window has a `durationMs` that is 0, negative, fractional or not a safe integer                     | Pass whole milliseconds, for example `86_400_000` for one day                        |
| `INVALID_DURATION`  | `window end must be a positive safe integer`                                   | The server time plus `durationMs` is above `Number.MAX_SAFE_INTEGER`                                                       | Use a shorter `durationMs`                                                           |
| `INVALID_TIME_ZONE` | the `timeZone` value, for example `Not/AZone`                                  | A `calendar` window's `timeZone` is not accepted by `Intl.DateTimeFormat`                                                  | Pass an IANA name such as `Europe/Paris` or `UTC`                                    |
| `INVALID_BATCH`     | `batch must be a positive integer`                                             | `eraseSubject` got a `batch` that is 0, negative, fractional, `NaN` or infinite                                            | Pass a positive integer or omit it (default 200); values above 500 are capped to 500 |
| `POLICY_MISMATCH`   | `Use a new key to change window policy`                                        | `consume` or `remaining` got a different window policy than the stored row for this `(scope, subjectRef, key)`             | Keep the window fixed per key, or use a new `key` for the new policy                 |

## Limits and gotchas

- Defaults: `scope` `"global"`, `amount` 1, `weekStartsOn` `"monday"`,
  `eraseSubject` batch 200. A batch above 500 is capped to 500, not rejected.
- Refs (`subjectRef`, `key`, `scope`, refund `periodKey`) are 1 to 256 UTF-16
  code units. Limits and amounts are positive safe integers. Durations are
  positive safe integer milliseconds.
- `consume` and `refund` are not idempotent. A retried mutation consumes or
  refunds again; see [Common tasks](#common-tasks) for the idempotency pattern.
- A denied `consume` writes nothing: it does not start a rolling window and
  does not store the new limit. An `amount` above what is left is denied in full.
- The window policy is fixed per `(scope, subjectRef, key)`. Changing the kind,
  `durationMs`, calendar `period`, `timeZone` spelling, or the week start of a
  `week` window throws `POLICY_MISMATCH`, even after the window expired. The
  limit may change at any time without resetting usage; a lower limit can
  return `used` above `limit` with `remaining: 0`.
- `refund` only applies when `periodKey` matches the stored row and that window
  has not ended. Otherwise it returns `refunded: false` with the stored row's
  `used` and `remaining` (zeros if there is no row) and writes nothing. Those
  numbers are not recomputed for the current window.
- `refund`'s `remaining` uses the limit stored by the last allowed `consume`. A
  refund on a matching row with `used: 0` returns `refunded: true` and writes
  nothing.
- `remaining` is a query: it never writes, never starts a rolling window, and
  reports an expired row as zero usage. Time passing alone does not invalidate a
  Convex query subscription, so treat `resetsAt` as an expiry hint; `consume`
  always rechecks server time.
- Rolling windows start at the first allowed `consume`. Epoch windows are
  `floor(now / durationMs)` buckets. Calendar days can last 23 or 25 hours; a
  repeated local midnight uses the earlier instant, and a skipped midnight or
  date advances through the gap.
- `periodKey` is an opaque window label, not a receipt or idempotency token. Do
  not parse it. After `eraseSubject`, the same calendar period can produce the
  same label again, so never replay old refunds against it.
- `eraseSubject` returns the count from its first pass only and schedules more
  passes while a pass is full, including a possible final empty pass. It is not
  a tombstone: a `consume` that races the sweep can survive or be deleted.
- One row per `(scope, subjectRef, key)`: concurrent consumes on the same key
  contend on that row (Convex retries conflicting mutations); different keys are independent.
- No usage history, receipts or audit events are stored. Record denials and
  refunds in your own tables if you need them.

## Compatibility

- Peer dependency: `convex@^1.45.0`. CI builds and tests against the locked
  dev version, `convex` 1.51.0.
- Node: `engines.node` is `>=22.12.0`. The package is ESM only.
- `@vllnt/convex-quota/test` ships as TypeScript source and needs `convex-test`
  (tested with 0.0.73, which itself needs `convex@^1.46.0`), `vitest` and
  `vite` in your app: it calls Vite's `import.meta.glob`, so add
  `/// <reference types="vite/client" />` to the test file.
- TypeScript: the packed exports and the `./test` helper type-check under both
  `bundler` and `nodenext` module resolution (`pnpm check:pack`).
- No React entry point: the package is backend only.
- Releases: stable versions are published to the `latest` dist-tag with npm
  provenance; builds from `main` go to `canary`
  (`pnpm add @vllnt/convex-quota@canary`).

## Testing

```bash
pnpm test           # single run
pnpm test:coverage  # 100% enforced on the source files listed in vitest.config.mts
```

Tests run the component's real functions in `convex-test`'s in-memory backend
(`@edge-runtime/vm`), including adversarial input, civil-time transitions and
scheduled erase batches. They do not prove real Convex OCC retries or real
scheduler delivery.

### Testing your app

`@vllnt/convex-quota/test` exports `register(t, name = "quota")` to mount the
component in a `convex-test` instance built from your app's schema:

```ts
// convex/plays.test.ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register } from "@vllnt/convex-quota/test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

test("a play uses one unit of the daily allowance", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  register(t);
  const user = t.withIdentity({ tokenIdentifier: "user|1" });
  await user.mutation(api.plays.play, {});
  const left = await user.query(api.plays.playsLeft, {});
  expect(left.remaining).toBe(4);
});
```

```ts
// convex/schema.ts
import { defineSchema } from "convex/server";

export default defineSchema({});
```

## Security

- Auth-agnostic: the host resolves identity and passes an opaque `subjectRef`.
- Tables are sandboxed: they are reached only through the exported functions.
- Server-sourced windows: a skewed client clock cannot pick the period.
- Never take `limit`, `amount`, `scope` or the window from an untrusted caller,
  and call `refund` only from verified host records.
- The functions in the repository's `example/convex/example.ts` are
  unauthenticated test fixtures, not production endpoints.

See [docs/API.md](./docs/API.md).

## Related packages

- [`@vllnt/convex-idempotency`](https://oss.vllnt.com/packages/convex-idempotency): the example app mounts both components and wraps `quota.consume` and `quota.refund` in `begin` → `complete` inside one host mutation, so a retried request is not counted twice.

## Contributing

See
[CONTRIBUTING.md](https://github.com/vllnt/convex-quota/blob/main/CONTRIBUTING.md).

## Links

- Docs and changelog: [oss.vllnt.com/packages/convex-quota](https://oss.vllnt.com/packages/convex-quota) · [release feed](https://oss.vllnt.com/packages/convex-quota/rss.xml)
- All @vllnt packages: [oss.vllnt.com](https://oss.vllnt.com) · [search packages and docs on index.vllnt.com](https://index.vllnt.com)
- Source and issues: [GitHub](https://github.com/vllnt/convex-quota) · [issues](https://github.com/vllnt/convex-quota/issues) · [npm](https://www.npmjs.com/package/@vllnt/convex-quota)
- Questions and updates: [Discord](https://bntvllnt.com/discord) · [X @bntvllnt](https://x.com/bntvllnt)
- Company and author: [vllnt.com](https://vllnt.com) · [bntvllnt.com](https://bntvllnt.com) · [GitHub @bntvllnt](https://github.com/bntvllnt) · [LinkedIn](https://linkedin.com/in/bntvllnt)
- Sponsor: [GitHub Sponsors](https://github.com/sponsors/bntvllnt)

## License

MIT, see [LICENSE](./LICENSE).

---

Part of [vllnt open source](https://oss.vllnt.com) · [Package page](https://oss.vllnt.com/packages/convex-quota) · [vllnt.com](https://vllnt.com) · Built by [bntvllnt](https://bntvllnt.com)
