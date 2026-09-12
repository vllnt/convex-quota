# First npm publication — canary only

This maintainer bootstrap command is for an **unpublished npm package**, not a
stable release or a retry mechanism. It publishes public package contents even
when the GitHub repository is private. Review the tarball and resolve the recorded
adoption/security/integration release blockers before confirming publication.
Preparing this script does not constitute publication approval.

## Prerequisites

- Node 22.12+ and the packageManager-pinned pnpm 9.15.4; npm on PATH.
- A clean, committed, reviewed checkout of this package (feature branches work;
  the command does not merge, push, tag, or change repository visibility).
- For actual publication: log in separately using `npm login
  --registry=https://registry.npmjs.org`, with npm organization publish rights
  and required 2FA. Never commit credentials. The first publish uses your local
  npm authentication, not GitHub OIDC; configure trusted publishing afterward.

## Run inside this package repository

```sh
# Safe default: quality gates, real tarball preparation, npm publish --dry-run.
pnpm canary:first

# Explicit, irreversible npm write — run only after reviewing the dry run.
pnpm canary:first --publish --confirm @vllnt/convex-quota
```

The current `0.1.0` base becomes **`0.1.0-canary.0`**, published only with
`--tag canary --access public` to `https://registry.npmjs.org`. There is no tag,
version, registry, or skip-check override, and no stable/latest publication path.
Install explicitly with `pnpm add @vllnt/convex-quota@canary`.

Both modes require npm's public package endpoint to return HTTP 404. Existing
packages, authentication errors, network failures, and rate limits stop the run.
A private/invisible existing package may also return 404; npm remains the final
write authority and a failure is never automatically retried.

Before staging, the command runs frozen install, strict lint (including bootstrap
regressions), CI typechecks, 100% coverage gates, build, the package's existing
packed-consumer check, and generated-doc equality through a clean Git check.
It packs the built package in a temporary directory, changes only that staged
manifest to the canary version, removes staged lifecycle scripts, then packs
again. Source versions and lockfiles are never bumped. The exact staged tarball
is dry-run validated before the one optional real publish; lifecycle hooks are
disabled in pack/publish, so they cannot trigger a second release.

Temporary artifacts are retained under the OS temp directory (`first-canary-*`)
for inspection/recovery. They may be removed after verification. No provenance
claim is made for this local bootstrap. Subsequent CI canaries can use the existing
OIDC workflow after separately configuring npm trusted publishing and enabling
`CANARY_ENABLED`; this script changes neither that flag nor `RELEASE_ENABLED`.

## Verify and recover

```sh
npm view @vllnt/convex-quota dist-tags --registry=https://registry.npmjs.org --@vllnt:registry=https://registry.npmjs.org
npm view @vllnt/convex-quota@0.1.0-canary.0 dist.integrity --registry=https://registry.npmjs.org --@vllnt:registry=https://registry.npmjs.org
```

A publish error or interrupted connection may still mean publication succeeded.
Inspect npm and the retained tarball before taking another action. Do not delete
tags, overwrite versions, automatically retry, or bump a version to hide an
uncertain outcome. Once the package exists, this first-publication command refuses
both modes; use the reviewed canary CI process for subsequent prereleases.
