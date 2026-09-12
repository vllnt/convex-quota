<!-- Badges -->
[![convex-component](https://img.shields.io/badge/convex-component-EE342F.svg)](https://www.convex.dev/components)
[![npm](https://img.shields.io/npm/v/@vllnt/convex-quota.svg)](https://www.npmjs.com/package/@vllnt/convex-quota)
[![CI](https://github.com/vllnt/convex-quota/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-quota/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@vllnt/convex-quota.svg)](./LICENSE)

# @vllnt/convex-quota

Scheduled-reset per-subject allowances as a Convex component.

Readable remaining in a window — calendar day/week/month, rolling, or epoch.
Daily/weekly play caps, free-tier slots, Codex-style limits.

Not a silent 429 (`@convex-dev/rate-limiter`), not billable usage
(`@vllnt/convex-metering`), not a persistent balance (`@vllnt/convex-wallet`).

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

- **Readable remaining** — `consume` / `remaining` return `{ allowed, used, remaining, limit, periodKey, resetsAt }`.
- **Window kinds** — calendar (`day` / `week` / `month` + IANA timezone), rolling (from first consume), epoch (`floor(now / durationMs)`).
- **Server-sourced time** — window math uses `Date.now()` inside the component.
- **Opaque refs** — `subjectRef` and `key` are host strings (max 256 chars).
- **Bounded erase** — `eraseSubject` deletes in batches and reschedules until clean.
- **Scopes** — default `"global"`, or namespace per tenant / product.

## Installation

```bash
pnpm add @vllnt/convex-quota
```

Peer dependency: `convex@^1.45.0`.

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
- `refund` is a privileged host operation, not a client-facing undo.

## API Reference

| Method | Kind | Result |
|--------|------|--------|
| `consume(ctx, subjectRef, key, limit, window, opts?)` | mutation | `{ allowed, remaining, used, limit, periodKey, resetsAt }` |
| `remaining(ctx, subjectRef, key, limit, window, scope?)` | query | same fields without `allowed` |
| `refund(ctx, subjectRef, key, amount, periodKey, scope?)` | mutation | `{ refunded, used, remaining }` |
| `eraseSubject(ctx, subjectRef, scope?, batch?)` | mutation | `number` deleted this pass |

Full reference: [docs/API.md](docs/API.md).

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

Tests run against the real component runtime via `convex-test` (`@edge-runtime/vm`).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

Built by [bntvllnt](https://github.com/bntvllnt) · [bntvllnt.com](https://bntvllnt.com) · [X @bntvllnt](https://x.com/bntvllnt)

Part of the [@vllnt](https://github.com/vllnt) Convex component fleet — [vllnt.com](https://vllnt.com)

If this is useful, [sponsor the work](https://github.com/sponsors/bntvllnt).

## License

MIT — see [LICENSE](LICENSE).
