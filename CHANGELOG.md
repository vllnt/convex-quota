# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

First stable release. Builds published to the `canary` dist-tag (first on
2026-09-12) carry the same API.

### Added

- Calendar (day / week / month), rolling, and epoch windows.
- `consume`, `remaining`, `refund`, `eraseSubject` (batched).
- Ref length limits (1..256). Server-sourced window math.
- `@vllnt/convex-quota/test` registers the component with `convex-test`; the
  consuming app needs `convex-test` and `vitest`.

### Fixed

- Reject unsafe numeric allowance values, invalid query inputs, unbounded
  scopes, and overflowing or sub-millisecond durations.
- Bind each allowance to its window policy and reject policy reinterpretation.
- Resolve skipped/repeated civil midnights and reject refunds of expired rows.
- Correct mock-backend testing claims and document refund deduplication,
  subscription expiry, erasure races, and multi-mount behavior.
- The `/test` entry now type-checks for consumers using `moduleResolution`
  `nodenext` (explicit `.js` relative imports, Vite client types).

### Changed

- Releases are published only from `v*.*.*` tags through npm trusted publishing
  with provenance; the local first-canary scripts were removed.
