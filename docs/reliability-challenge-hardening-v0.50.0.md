# Reliability and Challenge hardening v0.50.0

## Scope

v0.50.0 closes the highest-risk match lifecycle and Challenge gaps found after
v0.47.0. Gateway Contract v7 and the database schema remain unchanged.

## Root causes and fixes

### Pending claims after Forfeit/Rematch

A direct Rematch does not call `joinMatchmaking()`. The client could therefore
retain an in-flight telemetry batch belonging to the finished match. Because
telemetry is ordered, that old batch remained at the head of the queue and
blocked every envelope and claim candidate belonging to the new match.

Every `MATCH_SNAPSHOT` with a different match ID now atomically clears:

- queued telemetry envelopes;
- the in-flight telemetry batch;
- pending claim candidates;
- the old telemetry ACK association.

Snapshots for a newer revision of the same match preserve the queue.

### Polling and reconnect recovery

The Socket.IO client now attempts WebSocket first and retains HTTP polling as a
fallback. Automatic retries still run, while the Match view also exposes:

- **Reconnect** to start a fresh authenticated connection;
- **End Match** to reconnect once and immediately submit an authoritative
  Forfeit. If the transport remains unavailable, the Gateway's reconnect grace
  timeout still releases the match.

### Bloodline recovery

The `/credits` navigation still restores the match, waits for the authoritative
telemetry ACK cursor and then forwards the deferred `CREDITS_OPENED` event.
Bloodline definition v3 invalidates old v2 `completion-pending` snapshots that
could contain evidence stranded by the former queue bug.

## Challenge definition changes

| Challenge | Definition | v0.50 behavior |
|---|---:|---|
| Bloodline | 3 | Discards stranded v2 pending state; clicked and fully loaded Credits navigation remains required. |
| Blind Guess | 3 | Typo effect active, own correct guess and first-guesser position required. |
| Drunk Vision | 3 | Typo effect active, own correct guess and first-guesser position required. |
| Deaf Guess | 3 | Typo effect active, own correct guess and first-guesser position required. |
| Back to back | 4 | Positive-score consecutive wins in the same lobby; the second game start must be observed. |

Noob vs. Pro vs. Hacker remains intentionally global for the active Challenge
instance: positions 1–7 survive public lobby and language changes. Bullet
skribbl.io likewise keeps completed fast turns globally, but each counted turn
must have its own observed `ROUND_STARTED` event.

## `.skd` compatibility

The Autodraw fallback accepts both:

- current Typo collection exports: `[{ name, commands }, ...]`;
- legacy bare command arrays.

Each drawing in a collection is fingerprinted separately. Detached file inputs
are observed even when a Typo build omits `accept=".skd"`; selected filenames
remain strictly filtered to `.skd`.

## UI behavior

- New Match and Rematch are disabled outside the visible Skribbl homepage.
- Accepted completion messages receive a 200 ms presentation window before the
  conclusion line, keeping the win message last.
- Versus avatars are smaller; Skribbl special layers render outside the base
  avatar box instead of being clipped.
- Result title and score are centered in the right-hand result column.
- Cards and buttons use the requested borderless panel/accent palette.

## Release order

1. Deploy the v0.50.0 Gateway with Challenge definitions v2.9.0.
2. Verify `/healthz` and one complete staging Duel including reconnect.
3. Publish/install the v0.50.0 userscript.
4. Do not resume an in-progress match created with the v2.8.0 definition set.

