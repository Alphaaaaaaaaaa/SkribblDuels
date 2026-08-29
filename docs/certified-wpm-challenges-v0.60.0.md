# Certified WPM Challenges — v0.60.0

v0.60.0 expands the live Challenge pool from 50 to 53 without changing the
rules of any existing Challenge.

## Rules

| Challenge | Rule | Lobby continuity | First Guesser | Ranked |
| --- | --- | --- | --- | --- |
| Internet Explorer | One correct Guess below 20 WPM | Not relevant after completion | Not required | Disabled pending live certification |
| WPMaster | Ten correct Guesses at 150+ WPM | Progress carries across lobby changes inside the active Duel | Required for every increment | Disabled pending live certification |
| TypeRacer | One correct Guess at 250+ WPM | Not relevant after completion | Required | Disabled pending live certification |

WPM is deterministically derived as:

`round(((characterCount / 5) / (durationMs / 60000)), 2)`

Internet Explorer uses a strict `< 20` comparison. WPMaster and TypeRacer use
inclusive `>= 150` and `>= 250` comparisons.

## Authoritative evidence chain

One qualifying Guess requires all three ordered events on the same lobby and
round boundary:

1. `TEXT_INPUT_MEASURED`: confirmed DOM-adapter input from self while eligible
   to Guess. The event must contain a non-duplicate attempt ID, matching Unicode
   character count, coherent clocks, 250–300000 ms duration, at most 609 WPM,
   trusted input, and no paste or autofill evidence.
2. `GUESS_SUBMITTED`: the decoded client-to-server Guess must match the
   normalized measured message within five seconds. Every outgoing Guess
   replaces the prior pending submission, including uncertified ones.
3. `CORRECT_GUESS`: Skribbl must confirm self as correct on the same boundary
   within five seconds. If the protocol includes the word, it must match the
   submitted message. WPMaster and TypeRacer additionally require both
   `position === 1` and `isFirstGuesser === true`.

The Gateway replays this reducer independently from accepted, ordered
telemetry. A completion therefore reaches the existing server-authoritative
auto-Claim path without trusting a browser-created Claim result.

## False-positive boundaries

- Paste, drop/replacement autofill and untrusted synthetic input never count.
- A later dirty submission cannot inherit an older clean timing sample.
- Missing, stale, reordered or cross-round correlations never count.
- Revealed-word mismatches never count.
- A round or attempt ID cannot increment progress twice.
- Fast non-first Guesses do not count for WPMaster or TypeRacer and do not
  erase valid WPMaster progress.
- WPMaster intentionally declares no lobby-change reset boundary.

## Product and release contract

- Challenge Definitions: `2.16.0`
- Product Core: `0.6.2`
- Userscript release: `0.60.0`
- Gateway app: `0.7.4`
- Gateway Contract: unchanged at v11
- Telemetry Contract: unchanged; v0.60.0 consumes existing events
- Icon paths: `challenge-icons/internet-explorer.gif`,
  `challenge-icons/wpmaster.gif`, and `challenge-icons/type-racer.gif`

The icon files are optional. Until supplied, the UI uses its established
Challenge fallback. No Supabase migration, Railway variable or OAuth change is
required. Deploy the Gateway before distributing the v0.60.0 userscript.
