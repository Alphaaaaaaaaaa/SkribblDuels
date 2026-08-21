# Invite links — v0.52.0 implementation

Invite links ship after the v0.51.2 production correctness hotfix and before
multi-instance Gateway scaling so closed two-client beta tests can use real
authenticated players without QueueBots.

## Authoritative flow

1. An authenticated player selects Casual or Ranked and requests an invite.
2. The Gateway creates a random, single-use, expiring token and persists only
   its hash, owner, format, expiry and lifecycle state.
3. The UI copies a `https://skribbl.io/?scd-invite=<token>` link.
4. A second authenticated client opens the link and explicitly joins it.
5. The Gateway atomically consumes the invite, rejects self-use, reuse and
   expiry, and creates the normal 30-second two-player Ready check.
6. From Ready onward, the existing durable Draft, countdown, telemetry,
   Challenge Claim, conclusion and Rematch authority is reused unchanged.

## v0.52.0 implementation and release gate

- Implemented Invite creation, automatic copy, cancellation and expiry UI.
- Implemented link bootstrap after Discord authentication.
- Implemented durable, idempotent accept/cancel operations in
  `202608200001_create_duel_invites.sql`.
- Invite creators are removed from public queues and cannot hold two live
  matchmaking lifecycles.
- Runtime/contract tests cover accept, cancel, restart restore, self-use and
  duplicate link use. Real two-browser expiry/reconnect testing remains the
  beta release gate.
- QueueBots remain an optional staging fixture and are not part of an invite
  match.

Multi-instance Socket.IO routing and the shared adapter remain a production
scaling requirement, but they do not block the first closed real-client beta on
one Gateway instance.
