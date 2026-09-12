<!-- Badges -->
[![convex-component](https://img.shields.io/badge/convex-component-EE342F.svg)](https://www.convex.dev/components)
[![npm](https://img.shields.io/npm/v/@vllnt/convex-quota.svg)](https://www.npmjs.com/package/@vllnt/convex-quota)
[![CI](https://github.com/vllnt/convex-quota/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-quota/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@vllnt/convex-quota.svg)](./LICENSE)

# @vllnt/convex-quota

Scheduled-reset per-subject allowances as a Convex component.

Readable remaining in a window — calendar day/week/month, rolling, or epoch.
Daily/weekly play caps, free-tier slots, Codex-style limits.

The official `@convex-dev/rate-limiter` already supports fixed windows, token
buckets, readable status and React hooks. Prefer it for general throttling.
This experimental component explores the narrower calendar/timezone reset and
privileged allowance-refund surface. It is not billable metering or a persistent
balance. Publication remains blocked on demonstrated independent consumers and
justification of this boundary; readable remaining alone is not a distinction.

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

- **Readable remaining** — both return `{ used, remaining, limit, periodKey, resetsAt }`; only `consume` includes `allowed`.
- **Window kinds** — calendar (`day` / `week` / `month` + IANA timezone), rolling (from first consume), epoch (`floor(now / durationMs)`).
- **Server-sourced time** — window math uses `Date.now()` inside the component.
- **Opaque refs** — `subjectRef`, `key`, and `scope` are host strings (1..256 UTF-16 code units).
- **Bounded erase** — `eraseSubject` deletes in batches and reschedules until clean.
- **Scopes** — default `"global"`, or namespace per tenant / product.

## Installation

```bash
pnpm add @vllnt/convex-quota
```

Node.js >=22.12.0; peer dependency: `convex@^1.45.0`.

## Usage

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import quota from "@vllnt/convex-quota/convex.config";

const app = defineApp();
app.use(quota);
export default app;
```

```ts
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";
import { Quota } from "@vllnt/convex-quota";

const quota = new Quota(components.quota);

export const play = mutation({
  args: {},
  handler: async (ctx) => {
    const subjectRef = /* host-resolved identity */ "user_1";
    const r = await quota.consume(ctx, subjectRef, "plays", 5, {
      kind: "calendar",
      period: "day",
      timeZone: "Europe/Paris",
    });
    if (!r.allowed) throw new Error("daily cap reached");
  },
});
```

**Host rules:**

- Never take `limit` or `amount` from the end-user. The host supplies them.
- `consume` is not idempotent. Wrap retries with `@vllnt/convex-idempotency`.
- `refund` is privileged and **not idempotent**. Deduplicate refund events in the host transaction; `periodKey` is a window label, not a receipt or replay token.
- Keep window policy fixed for each `(scope, subjectRef, key)`; changes throw `POLICY_MISMATCH`. Use a new key for a new policy. Limits may change without resetting usage.
- Stop new consumes before erasing a subject and keep them stopped until scheduled passes drain. Erasure is not a tombstone; concurrent writes can survive or be swept.
- The example wrappers are unauthenticated test fixtures, not production endpoints.

## API Reference

| Method | Kind | Result |
|--------|------|--------|
| `consume(ctx, subjectRef, key, limit, window, opts?)` | mutation | `{ allowed, remaining, used, limit, periodKey, resetsAt }` |
| `remaining(ctx, subjectRef, key, limit, window, scope?)` | query | same fields without `allowed` |
| `refund(ctx, subjectRef, key, amount, periodKey, scope?)` | mutation | `{ refunded, used, remaining }` |
| `eraseSubject(ctx, subjectRef, scope?, batch?)` | mutation | `number` deleted this pass |

Full reference: [docs/API.md](docs/API.md).

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

Backend-only — no `./react` entry. Remaining is typically shown through the host's own query.

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

Unit/integration tests use the **mock backend** `convex-test` (`@edge-runtime/vm`).
They do not establish real-backend OCC or scheduler guarantees.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

Built by [bntvllnt](https://github.com/bntvllnt) · [bntvllnt.com](https://bntvllnt.com) · [X @bntvllnt](https://x.com/bntvllnt)

Part of the [@vllnt](https://github.com/vllnt) Convex component fleet — [vllnt.com](https://vllnt.com)

If this is useful, [sponsor the work](https://github.com/sponsors/bntvllnt).

## License

MIT — see [LICENSE](LICENSE).
