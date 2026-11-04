# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

First stable release.

### Added

- `Quota` client with `consume`, `remaining`, `refund` and `eraseSubject`
  (batched, reschedules until clean). `consume` returns
  `{ allowed, used, remaining, limit, periodKey, resetsAt }`, `remaining` the
  same without `allowed`, `refund` `{ refunded, used, remaining }`, and
  `eraseSubject` the number of rows deleted in that pass.
- Window kinds: calendar (`day` / `week` / `month` in an IANA timezone, Monday
  or Sunday week start), rolling (starts at the first allowed consume) and
  epoch. Time is read on the server. Skipped and repeated civil midnights
  resolve deterministically.
- A fixed window policy per `(scope, subjectRef, key)`; changing it throws
  `POLICY_MISMATCH`. The limit may change without resetting usage.
- Fail-closed input validation with `ConvexError` codes: `INVALID_REF`,
  `INVALID_LIMIT`, `INVALID_AMOUNT`, `INVALID_DURATION`, `INVALID_TIME_ZONE`,
  `INVALID_BATCH`. Refs and scopes are 1..256 UTF-16 code units; limits, amounts
  and durations are positive safe integers.
- `refund` only applies to the stored, unexpired period; otherwise it returns
  `refunded: false`.
- `@vllnt/convex-quota/test` registers the component with `convex-test`; the
  consuming app needs `convex-test` and `vitest`. It type-checks under both
  `bundler` and `nodenext` module resolution.
- Multiple named mounts and runtime scopes.

### Notes

- `consume` and `refund` are not idempotent. See the README host rules.
- Releases are published only from `v*.*.*` tags through npm trusted publishing
  with provenance. Builds from `main` use the `canary` dist-tag.
