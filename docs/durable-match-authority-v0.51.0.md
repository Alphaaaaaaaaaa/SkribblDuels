# Durable Match Authority v0.51.0

v0.51.0 replaces the process-only Match authority with a restartable,
server-owned aggregate. Gateway Contract v7 and the frozen Duel rules remain
unchanged.

## Stored authority

Each `duel_match_authority` snapshot contains:

- Match ID, revision, format, phase and absolute deadlines;
- participant identities/capabilities, ready state and reconnect ownership;
- complete Draft state, frozen board and definition versions;
- accepted claims, immutable conclusion, Draw and Rematch readiness;
- bounded private-chat history and client-message lookup;
- processed action IDs and Claim candidate resolutions;
- every real participant's telemetry sequence and Challenge Engine snapshot.

The snapshot and `duel_match_idempotency` rows are written by one database RPC.
`duel_match_authority_events` retains one append-only entry per revision for
incident review. Browser roles have neither table access nor RPC execution.
Authoritative Socket.IO events, snapshots and telemetry ACKs are buffered until
that RPC succeeds. A failed write publishes only a non-recoverable authority
error and blocks later uncommitted transitions from being exposed.

## Restart behavior

Before the HTTP/Socket.IO server listens, the Gateway loads non-terminal,
non-expired snapshots. It validates their frozen Challenge versions, rebuilds
the per-player Challenge Engines and re-arms ready, Draft, final reveal,
countdown, Draw and reconnect timers from the stored absolute timestamps.

Real participants begin restored as disconnected and receive the normal
30-second resume grace. The first authenticated `HELLO` for the same account
rebinds its transport and receives the authoritative telemetry ACK, snapshot
and bounded chat history. Unsupported or malformed snapshots are finalized
fail-closed rather than interpreted with new rules.

## Idempotency

The durable ledger covers four namespaces:

| Namespace | Key | Restored result |
|---|---|---|
| `action` | account + action ID | action fingerprint |
| `chat` | account + client message ID | original message and message ID |
| `claim` | account + candidate ID | original accepted/rejected resolution |
| `telemetry` | account + last sequence | last accepted cursor |

The in-memory indexes are reconstructed from the same aggregate, so a retry
after a Gateway restart follows the same duplicate/conflict path as a retry in
the original process.

## Challenge and UI fixes bundled with v0.51.0

- Bloodline's `CREDITS_OPENED` candidate and processed event IDs survive a
  Gateway restart; the homepage selector accepts the current Credits anchor.
- Deserved? rejects zero-point first place and permits a positive tie.
- Back to back retains coherent positive scores when Skribbl's `GAME_ENDED`
  packet exposes an already-reset scoreboard.
- Autodraw detected recognizes the complete `performDrawCommand` stream for a
  loaded bare-array `.skd`, independent of outgoing packet batching.
- Restored claims/results rebuild local Match Chat without resending historical
  completion/win text to Skribbl chat.
- Visibility/focus recovery advances an expired countdown to the board even
  when background timer throttling suspended animation callbacks.

## Deployment order

1. Apply `supabase/migrations/202608190001_create_durable_match_authority.sql`.
2. Add `SUPABASE_SERVICE_ROLE_KEY` only to the Gateway deployment environment.
3. Deploy the v0.51.0 Gateway and check `/healthz` for enabled, healthy Match
   authority.
4. Publish/install the v0.51.0 userscript.
5. Run a two-client restart drill during Draft, countdown, running play and a
   finished match before promoting production traffic.

The migration must precede the Gateway. The userscript must follow it because
Challenge definitions v2.10.0 (Deserved? v3 and Back to back v5) need to match
the server authority.
