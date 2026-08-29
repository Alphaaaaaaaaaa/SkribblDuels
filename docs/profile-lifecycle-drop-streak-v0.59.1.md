# Profile, same-lobby lifecycle and Drop Streak — v0.59.1

## Duel Profile

The identity card uses `var(--COLOR_PANEL_BG)`. It renders, in order, the
selected Versus avatar, colored Duel display name, private Discord identity,
status controls and the member date. The former explanatory Discord-privacy
sentence is removed.

Status is deliberately split into two local preferences:

- a decorative icon chosen from every Challenge in the current manifest;
- an independent normalized status message of up to 80 characters.

Neither value is uploaded or treated as an earned badge. Member dates are
rendered from the stored UTC calendar date as `DD.MM.YYYY`. Pin pickers now say
`Choose 1st pinned statistic` and `Choose 2nd pinned statistic`.

The supplied stat registry is complete: all 45 statistic assets plus the pin
utility are embedded. `drawing-reactions.png` preserves its PNG MIME type.

## Coverage and word-table interaction

`All languages` and every observed language are buttons. Selecting one filters
the 25-row word query and keeps the chosen coverage card visibly selected.
The table supports stable two-way sorting:

| Column | First click | Second click |
| --- | --- | --- |
| Word | A–Z | Z–A |
| Language | A–Z | Z–A |
| Seen | Most seen | Least seen |
| Guessed | Most guessed | Least guessed |
| Avg WPM | Fastest | Slowest |
| Avg guess | Fastest | Slowest |

Words without a WPM or guess-time sample remain at the bottom in either
direction instead of appearing as artificial best/worst values.

## Same-lobby game boundary

Skribbl clients do not always observe state 1 between public games. The
canonical reducer now treats every transition from terminal game results
(state 6) to an active/pre-round state (1–5) as a new `gameSessionId`. The
critical observed path is `6 → 2`, the next round-one announcement.

This preserves the lobby identity but prevents later `GAME_ENDED` events from
being deduplicated as the previous game. Back to back can therefore count two
same-lobby wins. Ate and left no crumbs and GuessingOAT also accept an observed
`6 → 2` boundary as the beginning of a full game; an ordinary mid-game round
announcement still cannot start either Challenge.

## Drop Streak authority

Drop Streak is Challenge 50 and remains Casual-only until live certification.
The default target is five consecutive caught drops. The adapter emits a local
observation ID at spawn and copies it only onto a compatible confirmed own
claim. DOM removal is given a short grace period for the Typo confirmation
message; if none arrives, a miss is emitted.

The streak resets for an explicit miss, a replacement before resolution, a
claim without a correlated spawn, an out-of-order claim or lobby exit.
Duplicate claims for an already resolved observation are ignored. Completion
evidence contains all five spawn/claim pairs.

The existing Typo UI works through `.typo-drop` observation plus the confirmed
`You caught/cleared the drop` line. The example relay exposes direct spawn,
miss and claim hooks for a future first-party Typo integration. Missing
`challenge-icons/drop-streak.gif` remains a visual fallback only.

No Supabase migration, Railway variable or Gateway Contract bump is required.
Deploy Gateway v0.59.1 before distributing the userscript.
