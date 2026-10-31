# Verification and release limits

This branch is unreleased. Independent current-target review and a demonstrated
second consumer remain publication gates. No publication, tags, visibility changes
or production deployment occurred during these checks.

## Reproduced local checks

Node 26.7.0, pnpm 9.15.4, Convex CLI/client 1.45.0 on Darwin arm64:

- `pnpm install --frozen-lockfile`
- `pnpm build`
- `pnpm lint` (shared strict base over src, Convex rules over component and example
  wrappers; generated files excluded; existing positional client methods have
  narrow max-params compatibility exceptions)
- `pnpm typecheck` and `pnpm typecheck:ci` (source plus examples/test sources)
- `pnpm test:coverage` (includes the published src/test.ts helper)
- `pnpm generate:llms` checks the maintained `llms.txt`; review its content against the README and API reference.
- `pnpm pack --pack-destination /tmp/quota-local-audit`
- Extracted tarball consumer TypeScript compilation imports root, config,
  generated ComponentApi and ./test with an unrelated host schema, using
  `tsc --ignoreConfig --noEmit --module ESNext --moduleResolution Bundler
  --target ES2024 --skipLibCheck check.ts`; root runtime import also passes.

The tracked `pnpm check:pack` reproduces packed public export and unrelated-host
schema typing checks in a temporary directory and removes it afterward.
The tarball consumer resolves Convex, convex-test and Vite from the installed
locked dependency versions; this is not proof against every compatible version.
CI uses Node 22. Reproduced on Node 22.23.2 with pnpm 9.15.4:
`npx -y -p node@22 -p pnpm@9.15.4 -c 'node --version && pnpm --version &&
pnpm install --frozen-lockfile && pnpm build && pnpm lint && pnpm typecheck:ci &&
pnpm test:coverage'`. All passed; 39 tests and 100% statements, branches,
functions and lines.

## Real local backend

A disposable copy of src, example, package.json, tsconfig files and convex.json
was created at /tmp/quota-local-audit/project. It links installed node_modules;
HOME points at /tmp/quota-local-audit/home. Its convex.json disables AI-file
installation to avoid touching instruction files. No cloud credentials are used.

`CONVEX_AGENT_MODE=anonymous HOME=/tmp/quota-local-audit/home node
local-backend-check.mjs` runs the repository's scripts/local-backend-check.mjs
from that isolated project. The script starts the local CLI on ports 3310/3311,
waits for readiness, checks real HTTP calls, then stops its owned child with
SIGINT. Run inside a bounded process group (60-second timeout, 2GiB RSS cap).
The managed-process tool was unavailable; bounded foreground execution supplied
process-group cleanup. Early SIGTERM shutdown attempts timed out; SIGINT cleanup
then completed normally, with no listeners remaining on either port.

Correction after independent review: the original runner used the HTTP client's
mutation queue, so its Promise.all did not establish concurrent HTTP calls.
The corrected runner sets `skipQueue: true` and instruments its fetch transport,
asserting overlapping HTTP requests. Reproduced peak in-flight = 20; exactly five
allowed and fifteen denied consumes against limit 5, with stored used=5. A batch-size-2 scheduled erasure drained eight allowance rows while
preserving another scope. A second mount accepted the identical scope/subject/key
with independent used=1. These are bounded real-backend observations, not a
proof of all concurrency or scheduler conditions.

The CLI generated component api.ts/component.ts and example api.d.ts in the
isolated project. Those outputs were copied unchanged back to their corresponding
_generated paths; no generated binding was manually edited.

## Release recovery

Stable (`@latest`) publication runs only from a pushed `vX.Y.Z` tag whose commit
is on `main` and matches `package.json` and a `CHANGELOG.md` entry; runs are
serialized and never automatically cancelled. Version and changelog changes go
through a normal reviewed PR. Publishing uses npm trusted publishing (OIDC) with
provenance and no token. Local alpha/release and login scripts do not exist.
`pnpm check:release`, included in lint, guards these invariants.

If publication fails or completion is uncertain, do NOT bump or rerun blindly.
A maintainer must compare the registry artifact and provenance with the exact
workflow SHA/version. If the version exists, npm will reject republication:
verify that artifact rather than attempting to overwrite it. Confirm a version
is absent before retrying. Any later repository release metadata follows the
normal signed maintainer process, outside this publication job. Never delete
an existing npm version or move an existing tag.
