# @skribbl-duels/telemetry-contracts

Stable, versioned TypeScript contracts shared by Skribbl Duels telemetry and the future challenge engine.

The package contains no socket relay, DOM selector, RxJS dependency or UI. Challenge code may depend on this package, but must not import `telemetry-core` internals.

Important rules:

- `roundIndex` is the raw zero-based skribbl value.
- `roundNumber` is the one-based value used by UI and challenges.
- `gameSessionId` and `roundSessionId` identify actual game/round instances.
- Draw command batches are live-only and are not retained by default.
- Adding an optional field is backwards-compatible. Removing or changing event semantics requires a contract version bump.
