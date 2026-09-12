# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial implementation of `@vllnt/convex-quota` (not yet released).
- Calendar (day / week / month), rolling, and epoch windows.
- `consume`, `remaining`, `refund`, `eraseSubject` (batched).
- Ref length limits (1..256). Server-sourced window math.

### Fixed

- Reject unsafe numeric allowance values, invalid query inputs, unbounded scopes,
  and overflowing or sub-millisecond durations.
- Bind each allowance to its window policy and reject policy reinterpretation.
- Resolve skipped/repeated civil midnights and reject refunds of expired rows.
- Correct mock-backend testing claims and document refund deduplication,
  subscription expiry, erasure races, and multi-mount behavior.

### Migration note

- The unreleased allowance schema now requires `policyKey`. Existing development
  rows must be cleared in an isolated development deployment before updating;
  no production migration has been performed.
