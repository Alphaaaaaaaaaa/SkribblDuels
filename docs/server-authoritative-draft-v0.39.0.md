# Server-authoritative Draft v0.39.0

## State ownership

The Gateway creates the draft only after both ready-check participants are
ready. The randomly selected starting account from v0.38.0 takes the first
turn; turns then alternate between the two participants. The browser submits
only a challenge ID, match ID and its last observed server revision.

Every accepted pick increments the match revision. Stale revisions,
out-of-turn accounts, already selected challenges and challenges absent from
the current authoritative option list are rejected. A corrected snapshot is
sent when a stale revision is detected.

## Selection window and simulated opponents

Each turn receives exactly 15 seconds. The deadline is included in every draft
snapshot and is checked again when a pick reaches the server, so a delayed
timer cannot allow a late browser message. When the deadline expires, the
Gateway selects one of the remaining compatible challenges automatically.

With `MATCHMAKING_SIMULATED_PLAYERS=true`, QueueBot makes its own server-side
selection after a short development delay. The browser never creates or sends
the simulated pick.

## Challenge authority

The Gateway builds the same versioned 46-challenge manifest used by the
userscript. Before drafting, it intersects the capabilities declared by both
clients. Each available option must be valid for the selected format, supported
by both participants and leave enough compatible challenges to finish the
entire board.

Casual completes after nine picks and publishes a 3×3 board with a five-field
win target. Ranked completes after 25 picks and publishes a 5×5 board with a
thirteen-field win target. Pick order becomes field order.

The general manifest conflict metadata remains authoritative. In particular,
Blind Guess and Drunk Vision share `primary-visual-obstruction` and cannot
coexist. Deaf Guess has no such conflict key and remains compatible with either
one.

## Contract snapshot

While selecting, `MATCH_SNAPSHOT.state.draft` contains:

- required pick count;
- active account and selection deadline;
- ordered pick history with definition versions and automatic-pick markers;
- IDs still valid for the next selection;
- `board: null`.

After the final pick, the draft status becomes `complete`, turn and deadline
become `null`, the available list becomes empty and `board` contains the fully
validated immutable board snapshot. v0.39.0 stops at that boundary. The next
milestone consumes this board for the synchronized 10-second countdown and
match start.

Contract v1 guards continue to accept a v0.38.x snapshot without the newly
added `draft` field during a rolling deployment. Such a client can stay
connected, but selections are enabled only after the v0.39.0 Gateway publishes
the complete draft state.
