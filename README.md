<!-- Badges -->
[![convex-component](https://img.shields.io/badge/convex-component-EE342F.svg)](https://www.convex.dev/components)
[![license](https://img.shields.io/npm/l/@vllnt/convex-quota.svg)](./LICENSE)

# @vllnt/convex-quota

Scheduled-reset per-subject allowances as a Convex component.

Readable remaining in a window — calendar day/week/month, rolling, or epoch.
Daily/weekly play caps, free-tier slots, Codex-style limits. Not a silent 429
(`@convex-dev/rate-limiter`), not billable usage (`@vllnt/convex-metering`), not
a persistent balance (`@vllnt/convex-wallet`).

```ts
const quota = new Quota(components.quota);
const r = await quota.consume(ctx, subjectRef, "plays", 3, {
  kind: "calendar",
  period: "day",
  timeZone: "Europe/Paris",
});
if (!r.allowed) throw new Error(`try again at ${r.resetsAt}`);
```

## Installation

```bash
pnpm add @vllnt/convex-quota
```

Peer dependency: `convex@^1.45.0`.

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import quota from "@vllnt/convex-quota/convex.config";

const app = defineApp();
app.use(quota);
export default app;
```

The host owns auth and passes an opaque `subjectRef`. Time is server-sourced.

**Host rules (do not skip):**

- Never take `limit` or `amount` from the end-user. The host supplies them.
- `consume` is not idempotent. Wrap retries with `@vllnt/convex-idempotency`.
- `refund` is a privileged host operation, not a client-facing undo.

## Author

Maintained by [bntvllnt](https://github.com/bntvllnt) · [bntvllnt.com](https://bntvllnt.com)

The [@vllnt](https://github.com/vllnt) OSS package fleet — [vllnt.com](https://vllnt.com)
