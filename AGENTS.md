<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, read the official [Convex guidelines](https://version.convex.dev/v1/guidelines)
for API and component patterns. The generated local guidance file is not tracked.
<!-- convex-ai-end -->

# @vllnt/convex-quota

Scheduled-reset per-subject allowances as a Convex component. Follows the vllnt
Component Standard (see the `oss-packages` hub `AGENTS.md`).

## Agent instructions

`AGENTS.md` is the sole agent-instruction source for this repository. Do not add
`CLAUDE.md` or `.claude` content.

## Architecture

```
src/
├── shared.ts              # window math (calendar / rolling / epoch)
├── test.ts                # convex-test register()
├── client/                # Quota class
└── component/
    ├── schema.ts          # allowances
    ├── convex.config.ts   # defineComponent("quota")
    ├── mutations.ts       # consume, refund, eraseSubject
    ├── queries.ts         # remaining
    └── validators.ts
```

## Ownership boundary

- **Component owns:** the current-window allowance row, window math, server time.
- **Host owns:** auth, meaning of `subjectRef` / `key`, the numeric `limit`.
- **Not this component:** persistent balances (`convex-wallet`), billable meters
  (`convex-metering`), silent 429s (`@convex-dev/rate-limiter`).

## Conventions

- Mutations in `mutations.ts`, queries in `queries.ts`.
- Explicit `args` + `returns` on every Convex function.
- No bare `v.any()`.
- 100% test coverage is BLOCKING.
- Runtime deps: only official `@convex-dev/*` + `@vllnt/*`.
- Type-A generated code: `**/_generated/**` is Convex CLI-owned; run `pnpm codegen`.
