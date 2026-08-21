# Gateway chat and telemetry authority v0.47.0

## Scope

v0.47.0 completes two previously reserved Gateway paths without adding database
persistence:

1. private Duel chat transported through the authenticated match;
2. normalized telemetry replay and authoritative Challenge claim resolution.

The lifecycle remains in memory for the existing reconnect grace window.
Supabase match history and Ranked rating changes remain a later milestone.

## Gateway Contract v5

Contract v5 makes the reserved messages operational and adds the state required
for exact reconnect restoration:

- `DUEL_CHAT_SEND` and `DUEL_CHAT_MESSAGE`;
- typed `TELEMETRY_BATCH` envelopes and `TELEMETRY_ACK` cursors;
- `CLAIM_CANDIDATE` with the last evidence sequence;
- `CLAIM_RESOLUTION` with owner, definition version, server time and revision;
- authoritative claims, winner and finish time in `MATCH_SNAPSHOT`;
- the `finished` match phase and `MATCH_FINISHED` event.

Contract v4 clients are intentionally rejected instead of receiving a partial
authority model.

## Private Duel chat

The Gateway checks that the authenticated account belongs to the exact match.
It then normalizes NFC text, removes control characters, collapses whitespace,
trims the result and limits it to 300 Unicode code points. Each participant may
send at most eight messages per ten-second sliding window.

The key `(accountId, clientMessageId)` is idempotent. A replay returns the
original server message to the sender and is not broadcast again. The latest
100 messages remain in the active match and are replayed only to a successfully
resumed participant.

## Telemetry sequence and validation

Each browser creates match-local envelopes with a contiguous sequence beginning
at one. The client batches at most 64 envelopes. Only one batch is in flight;
the Gateway acknowledges its last accepted sequence. On reconnect the server
sends its cursor before replaying the match snapshot, allowing a reloaded client
to continue without claiming an unprocessed event.

The Contract validates the full normalized telemetry shell. The Gateway also
rejects gaps, overlaps, duplicate event IDs inside one batch, batches above
256 KiB and event times outside the running-match window. Fully acknowledged
duplicate batches are idempotent.

## Server Challenge Engines

At the synchronized match start, the Gateway creates one independent Challenge
Engine for each real participant and activates only the frozen board fields.
Events use their monotonic server replay order and event timestamps. A local
browser completion remains `pending` and submits its challenge, definition
version, evidence IDs and the sequence through which those events were sent.

The Gateway accepts a candidate only when:

- the match is still running and the account is a participant;
- the field exists on the authoritative board and is still unclaimed;
- the definition version equals the board version;
- telemetry is acknowledged through the declared sequence;
- the Gateway engine independently produced a completion candidate;
- the evidence event-ID set matches exactly.

An accepted claim increments the match revision, broadcasts the same resolution
to both parties, closes that field in both server engines and enters `finished`
when the owner reaches five Casual or thirteen Ranked fields. The browser may
continue observing Skribbl locally, but no further Duel telemetry or board
mutation is accepted.

The Gateway is authoritative over replay, field ownership and the final Duel
state. Normalized Skribbl telemetry still originates in each participant's
browser; it is structurally and semantically replay-validated but is not a
cryptographic anti-cheat signal. A later high-trust mode would require an
independent signed relay or direct server observation.

## Official word lists

The production Gateway loads the English, German, French, Korean and Spanish
official lists before opening its listener. Failure stops startup. This avoids
drafting word-list challenges that the authority cannot reproduce.

## Explicitly deferred: forfeits and agreed draws

The next match-lifecycle milestone adds two server-owned conclusions:

- immediate unilateral forfeit, awarding the opponent the match;
- a draw proposal that concludes the match only after the other participant
  accepts it.

The draw flow must include one active proposal, proposer withdrawal, rejection,
timeout, reconnect restoration and simultaneous-action idempotency. Neither
client may set a draw or result directly.
