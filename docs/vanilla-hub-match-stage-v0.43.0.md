# Vanilla Hub and match-start stage v0.43.0

## Visibility lifecycle

The Hub is closed whenever the runtime starts. The homepage button and floating
Skribbl Duels icon are explicit entry points; no Gateway update opens the Hub.

The main navigation is phase-aware:

- before a match, the only main tab is `Duels`;
- during Ready, Draft and Countdown, the Hub is hidden behind a dedicated stage;
- after the synchronized start, the only main tab is `Match`;
- Settings and About remain header icons rather than main tabs.

Starting or resuming a running match selects `Match` without opening it. The
user must invoke the Skribbl Duels icon to reveal the Hub.

## Versus and Ready

A `ready-check` snapshot renders a central Versus screen with both display
names, portrait surfaces, individual Ready states and the authoritative
30-second deadline. The authenticated user's current Discord image is used when
available; other portraits fall back to initials until the profile/avatar
migration supplies server-owned identities.

`challenge-icons/checkmark.gif` and `challenge-icons/crossmark.gif` are reserved
for Ready, not-ready and cancel states. Text glyphs remain functional fallbacks
while artwork is absent. All icon surfaces scale to `1.1` on hover.

## Draft

The `draft` phase renders no Hub chrome. Its central stage contains only:

1. the incremental Challenge Board;
2. one panel-background container for the current two options;
3. the turn deadline and match-format/opponent line beneath those options.

The board-count, server revision, pick-history, Homepage Matchmaking copy and
abort control are not rendered in this stage. Click and Left/Right Arrow input
share the existing single-submission guard. Clock updates mutate only deadline
text and never rebuild the Draft DOM on the 700-ms mount guard.

## Countdown and Match

After the server reveals the final field, the completed board remains central.
Its normal `Self · 0:0 · Opponent` line is temporarily replaced by
`Match starts in Ns`. At the synchronized start the stage disappears, the
floating board becomes available, challenge instances activate and the closed
Hub changes its only main tab to `Match`.

The Match view now contains the existing private Duel-chat surface. Enter is
handled inside its form so it cannot submit the Skribbl chat at the same time.

## Compatibility

This is a browser UI lifecycle change. Gateway Contract v3, the 30-second
reconnect grace period, Draft authority, final parity selection, countdown
timestamps and all profile/database schemas remain unchanged.
