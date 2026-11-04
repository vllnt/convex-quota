<!-- Badges -->

[![convex-component](https://img.shields.io/badge/convex-component-EE342F.svg)](https://www.convex.dev/components)
[![npm](https://img.shields.io/npm/v/@vllnt/convex-quota.svg)](https://www.npmjs.com/package/@vllnt/convex-quota)
[![CI](https://github.com/vllnt/convex-quota/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-quota/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@vllnt/convex-quota.svg)](./LICENSE)

# @vllnt/convex-quota

Scheduled-reset per-subject allowances as a Convex component.

Readable remaining in a window — calendar day/week/month, rolling, or epoch.
Daily/weekly play caps, free-tier slots, Codex-style limits.

## When to use it

Use it for allowances that reset on a schedule and that your UI needs to read:
"3 plays left today", a weekly cap in the subject's own timezone, free-tier
slots, a refund when an action is cancelled.

- General throttling (token buckets, fixed windows, React hooks): use the
  official `@convex-dev/rate-limiter`.
- Billable usage records: use `@vllnt/convex-metering`.
- Balances that persist and are spent down: use `@vllnt/convex-wallet`.

```ts
const quota = new Quota(components.quota);
const r = await quota.consume(ctx, subjectRef, "plays", 3, {
  kind: "calendar",
  period: "day",
  timeZone: "Europe/Paris",
});
if (!r.allowed) throw new Error(`try again at ${r.resetsAt}`);
```

## Features

- **Readable remaining** — `consume` and `remaining` both return
  `{ used, remaining, limit, periodKey, resetsAt }`; only `consume` includes
  `allowed`.
- **Window kinds** — calendar (`day` / `week` / `month` + IANA timezone),
  rolling (from first consume), epoch (`floor(now / durationMs)`).
- **Server-sourced time** — window math uses `Date.now()` inside the component.
- **Opaque refs** — `subjectRef`, `key`, and `scope` are host strings (1..256
  UTF-16 code units).
- **Bounded erase** — `eraseSubject` deletes in batches and reschedules until
  clean.
- **Scopes** — default `"global"`, or namespace per tenant / product.

## Installation

```bash
pnpm add @vllnt/convex-quota
```

Node.js >=22.12.0; required peer: `convex@^1.45.0`. Stable releases are
published to the `latest` dist-tag with npm provenance. Unreleased builds from
`main` go to the `canary` dist-tag (`pnpm add @vllnt/convex-quota@canary`).

## Usage

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import quota from "@vllnt/convex-quota/convex.config";

const app = defineApp();
app.use(quota);
export default app;
```

The host authenticates, derives the `subjectRef`, and owns the limit and window.
The component never sees the end-user's request.

```ts
// convex/plays.ts
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { Quota } from "@vllnt/convex-quota";

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
    const subjectRef = identity.tokenIdentifier;
    const r = await quota.consume(ctx, subjectRef, "plays", DAILY_PLAYS, daily);
    if (!r.allowed) throw new Error("daily cap reached");
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

After mounting, run `pnpm convex dev` to generate the host's component
references.

**Host rules:**

- Never take `limit` or `amount` from the end-user. The host supplies them.
- `consume` is not idempotent. Pair it with `@vllnt/convex-idempotency` (see
  [Retries and idempotency](#retries-and-idempotency)).
- `refund` is privileged and **not idempotent**. Deduplicate refund events in
  the host transaction; `periodKey` is a window label, not a receipt or replay
  token.
- Keep window policy fixed for each `(scope, subjectRef, key)`; changes throw
  `POLICY_MISMATCH`. Use a new key for a new policy. Limits may change without
  resetting usage.
- Stop new consumes before erasing a subject and keep them stopped until
  scheduled passes drain. Erasure is not a tombstone; concurrent writes can
  survive or be swept.
- The example wrappers are unauthenticated test fixtures, not production
  endpoints.

## Configuration and limits

`new Quota(component, { defaultScope: "global" })` sets the only client option.
`consume` accepts `{ amount?: number, scope?: string }`; amount defaults to 1.
Limits and amounts must be positive safe integers. Erase batches default to 200
and are capped at 500. Calendar weeks default to Monday; set `weekStartsOn` to
`"sunday"` when needed. Rolling and epoch windows require a positive safe
integer `durationMs`. See the API reference for timezone transitions and error
codes.

## API Reference

| Method                                                    | Kind     | Result                                                     |
| --------------------------------------------------------- | -------- | ---------------------------------------------------------- |
| `consume(ctx, subjectRef, key, limit, window, opts?)`     | mutation | `{ allowed, remaining, used, limit, periodKey, resetsAt }` |
| `remaining(ctx, subjectRef, key, limit, window, scope?)`  | query    | same fields without `allowed`                              |
| `refund(ctx, subjectRef, key, amount, periodKey, scope?)` | mutation | `{ refunded, used, remaining }`                            |
| `eraseSubject(ctx, subjectRef, scope?, batch?)`           | mutation | `number` deleted this pass                                 |

Full reference: [docs/API.md](docs/API.md).

## Retries and idempotency

`consume` is not idempotent: a retried mutation consumes again. When a retry
must not double-count, claim the request with `@vllnt/convex-idempotency` inside
the **same host mutation**. The claim, the consume and the completion commit or
roll back together, so a failed attempt leaves nothing behind and a successful
one is replayed instead of re-run.

Install it next to this component:

```bash
pnpm add @vllnt/convex-idempotency
```

```ts
// convex/convex.config.ts — mount both components
import idempotency from "@vllnt/convex-idempotency/convex.config";
app.use(quota);
app.use(idempotency);
```

```ts
// convex/plays.ts
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
```

Refunds are privileged; trigger them only from verified host events. Expose them
as an `internalMutation` that a trusted caller (a webhook or a scheduled job
after a verified cancellation) invokes with values from the host's own record of
the play, never with a public argument chosen by the end user:

```ts
const refundIdempotency = new Idempotency<RefundResult>(components.idempotency);

export const refundPlay = internalMutation({
  args: {
    subjectRef: v.string(), // from the host's record of the play
    requestId: v.string(), // the request being cancelled
    periodKey: v.string(), // from the same record
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

This exact pattern is exercised in
[`example/convex/idempotency.test.ts`](example/convex/idempotency.test.ts): a
duplicate `requestId` replays the stored result and consumes once, a new
`requestId` consumes again, the caller `scope` isolates identical request ids, a
host failure after `consume` rolls back both the allowance and the claim, and a
refund event deduplicated by `requestId` refunds once.

Caveats:

- A denied consume (`allowed: false`) is recorded too, so a replay returns the
  same denial even if the allowance was freed in between.
- The claim lives for the idempotency component's done-grace TTL (24 hours by
  default). A retry after that is a new request and consumes again, so pick a
  TTL longer than your clients' retry horizon.
- Do no external work between `begin` and `complete`. Keep it to transactional
  host writes; use a separate action for network calls.
- Namespace the idempotency key per operation (`consume:${requestId}`,
  `refund:${requestId}`). The ledger is keyed by caller scope and key only, so
  two operations sharing a key would replay each other's stored result.
- Never accept refund ids or a `periodKey` from the end user: a public refund
  endpoint lets a caller fabricate cancellations and clear their own quota.

## Multiple mounts

```ts
app.use(quota, { name: "webQuota" });
app.use(quota, { name: "mobileQuota" });
// new Quota(components.webQuota), new Quota(components.mobileQuota)
```

Each mount has independent sandboxed tables. Use `scope` for runtime namespaces.

## Operational behavior

`remaining` is a snapshot when its query executes: **time passing alone does not
invalidate a Convex subscription**. Treat `resetsAt` as an expiry hint, not a
scheduled notification; `consume` always rechecks server time. Rolling windows
start on the first **allowed** consume. No history or audit events are retained.
Hosts should record denied decisions and privileged refunds in their own audit
system without logging sensitive refs. A hot allowance is one contended row;
different indexed keys remain independent. Monitor Convex OCC retries and
scheduled-function failures. Erasure returns only its first pass count.

## React

Backend-only — no `./react` entry. Remaining is typically shown through the
host's own query.

## Security

- Auth-agnostic — the host resolves identity and passes an opaque `subjectRef`.
- Tables sandboxed — reached only through the exported functions.
- Server-sourced windows — a skewed client clock cannot pick the period.

See [docs/API.md](docs/API.md).

## Testing

```bash
pnpm test
pnpm test:coverage
```

Unit/integration tests use the **mock backend** `convex-test`
(`@edge-runtime/vm`). They do not establish real-backend OCC or scheduler
guarantees.

### Testing your app

`@vllnt/convex-quota/test` exports `register(t, name = "quota")` to mount the
component in a `convex-test` instance. It needs `convex-test` and `vitest` (with
Vite's `import.meta.glob`) in the consuming app:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register } from "@vllnt/convex-quota/test";
import schema from "./schema";

const t = convexTest(schema, import.meta.glob("./**/*.ts"));
register(t);
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

Built by [bntvllnt](https://github.com/bntvllnt) ·
[bntvllnt.com](https://bntvllnt.com) · [X @bntvllnt](https://x.com/bntvllnt)

Part of the [@vllnt](https://github.com/vllnt) Convex component fleet —
[vllnt.com](https://vllnt.com)

If this is useful, [sponsor the work](https://github.com/sponsors/bntvllnt).

## License

MIT — see [LICENSE](LICENSE).
