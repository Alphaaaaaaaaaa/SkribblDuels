# Challenge recovery, Rematch and Match UI v0.49.0

## Challenge integration recovery

The `/credits` failure was a reconnect ordering bug rather than a Bloodline
reducer bug. The Credits DOM adapter could produce a valid `CREDITS_OPENED`
completion while the restored local match was waiting for its Gateway resume
snapshot. The first snapshot then treated that same match as new and reset all
Challenge instances before the Claim could be submitted.

The Product UI now distinguishes a compatible persisted match from a genuinely
superseding Gateway match. Compatible instance IDs and definition versions are
reconciled in place. New telemetry is buffered while the authoritative ACK
cursor is unknown, then sequenced after that cursor. Every still-pending local
candidate is submitted after the running snapshot and ACK are both present.
The Gateway remains the only component that validates evidence and awards a
field.

The integration suite exercises the complete path:

```text
local telemetry → sequence envelope → Gateway replay → Claim validation → board Claim
```

Forged or mismatched evidence remains rejected.

## Challenge definition changes

| Challenge | v0.49.0 rule |
| --- | --- |
| Bloodline | Preserve and submit the valid `/credits` candidate through reconnect |
| Ouch | Self correct guess at most 200 ms after the observed first guesser |
| Picasso | Four simultaneous unique likes on the current own drawing |
| Cool Number Detected | Positive score divisible by 500 |
| Fanboy | Like every eligible drawing in one fully observed Skribbl round |
| Color Picker | Use all palette IDs 0–25 and have every eligible player guess before round end |
| Time Waste | Foreign canvas continuously fully white for at least 50 seconds |
| Mogged | Three official-list wrong guessers before the self player's first guess |
| Need some space? | Required component count derived from the active official language list |
| Smol words | First guesses; short threshold and required count derived per language |
| Big word | First guesses; long threshold and required count derived per language |
| Hint Reflexes | Within two seconds of the first hint only if nobody guessed before it |

The public IDs remain unchanged. Definition versions changed so incompatible
persisted runtime state is skipped safely.

## Contract v7 Rematch

`MATCH_REMATCH` is an authenticated, action-ID-based request. Finished match
snapshots expose `rematchReadyAccountIds`. The conclusion remains immutable
while readiness changes. Both ready participants cause a fresh server-owned
ready check and a new match ID; the old match and its telemetry authorities are
retired. A simulated opponent is ready immediately.

## Finished Match and chat UX

The Match tab now shows the winning profile/Skribbl avatar with the native crown
and trophy assets, owner-colored result text, a human duration, the final score
and Return, New Match and Rematch buttons. The optional overlay uses the same
avatar and the `player_winner` keyframes.

Match Chat uses a 300-code-point counter, stops input at the limit, scrolls to
the newest message after submit, fades older content at the top while scrolled
and uses the Skribbl panel scrollbar colors. Optional notifications reuse an
existing `.typo-toast-container` when available and otherwise provide the same
markup and motion locally.

## Deployment

Deploy the Contract v7 Gateway before distributing the v0.49.0 userscript.
No new Supabase migration or environment variable is required for this release.
