# Local WPM and word statistics — v0.58.0

## Product decisions

- Equal saved colors remain valid profile identities. Only the opponent's
  local rendering moves to `(index + 2) mod 28`; no profile or Gateway value is
  rewritten.
- Claim colors are deliberately muted with `saturate(.68) brightness(.78)` and
  return to full color on hover in 100 ms. Palette indexes 26 and 27 use dark
  Claim text.
- Mirrored Match Chat lines keep Skribbl's normal chat/name color. Custom Duel
  colors remain in Duel-owned UI and completion/Claim presentation.
- The color picker is transactional: X and overlay are Cancel, Select commits
  to the Profile form draft, and Save Profile remains the server write.

## Input and WPM evidence

`TEXT_INPUT_MEASURED` starts with the first non-empty input edit and ends on
Enter. It carries the final Unicode character count, elapsed milliseconds,
correction count, input source, Paste, Autofill, IME-composition and trusted-
input flags. It never trusts a browser-provided WPM number.

The reducer derives standard five-character WPM:

`(Unicode characters / 5) / (durationMs / 60000)`

A lifetime WPM sample is clean only when it is trusted, neither pasted nor
autofilled, between 250 ms and five minutes, and at most 609 WPM. Composition
is retained as a quality dimension but is not rejected: excluding it would
make legitimate Japanese, Korean and other IME input impossible to measure.

General WPM comes from all clean submitted non-command chat lines. Guess WPM is
the stricter subset correlated in order with `GUESS_SUBMITTED` and the user's
`CORRECT_GUESS`. The actual word is taken from the correct-guess packet or the
later `WORD_REVEALED` boundary, so arbitrary chat messages never become word
records.

## Durable local model

The `skribblDuelsLocalStats` IndexedDB contains one summary, per-language word
records and observed username records. Writes are debounced and incremental;
the data is not reset at Duel boundaries and survives normal reloads.

`window.skribblDuelsLocalStats` exposes:

- `getSnapshot()` for lifetime aggregates and language coverage;
- `getWordStats({ languageId, sort, direction, limit })`, occurrence-first by
  default;
- `getObservedUsernames()`;
- `export()` with an explicit privacy warning;
- `subscribe(listener)`, `flush()` and `clear()`.

Observed usernames and lobby IDs remain local. Upload is deferred until a user
explicitly opts in and the server can certify the uploaded record. Local top-
three Challenge times are personal records, not public leaderboard results.

## Statistics taxonomy and implementation order

| Priority | Area | Statistics | v0.58 status |
| --- | --- | --- | --- |
| P1 | Activity and reach | Visible active play time, distinct lobby IDs/sessions, unique usernames observed, language activity | Captured locally; usernames are not stable account IDs |
| P1 | Typing quality | Submitted/clean samples, average/best WPM, corrections, Paste, Autofill, IME and untrusted counts | Complete foundation |
| P1 | Guessing | Attempts, wrong/correct/First guesses, average/best Guess WPM, average/best Guess time | Complete foundation |
| P1 | Vocabulary | Per-language seen/typed/guessed occurrences and unique counts, word occurrence ranking, authoritative coverage | Complete foundation |
| P1 | Per word | Best/average WPM, best/average Guess time, seen/typed/guessed counts, first/last seen and guessed | Complete foundation |
| P1 | Skribbl results | Games and wins, win rate, average final score, best public/private score | Complete foundation |
| P1 | Social | Likes, dislikes, vote-kicks and host kicks given | Complete foundation |
| P1 | Duels/Challenges | Duel matches/wins/draws, total confirmed Claims and local top-three completion times | Complete foundation; Profile UI pending |
| P2 | Robust distributions | Median/P50/P90 Guess time and WPM, rolling 10/50-sample trend, PR improvement | Pending compact histogram/session records |
| P2 | Accuracy | Correct-Guess rate, First-Guesser rate, wrong guesses before correct, close-guess rate | Pending final denominator rules |
| P2 | Vocabulary insights | Hardest/fastest words, unseen-list targets, frequency vs. speed, per-language improvement | Pending Profile UI/query layer |
| P2 | Drawing/social response | Drawing rounds, average drawing score, likes/dislikes received, percentage of lobby guessing own drawings | Pending complete drawing-round reducer |
| P2 | Sessions/streaks | Longest session, daily/weekly activity, Skribbl/Duel win streaks, favorite language/mode | Pending session boundaries and calendar privacy choice |
| P3 | Ranked/profile | Rating, provisional/season placement, match history and challenge completion rate | Requires durable server model |
| P3 | Public records | Global top-three fastest WPM and Challenge completions | Server-certified only; local data cannot claim a world record |

Recommended extra statistics are the median and P90 alongside averages, sample
quality/eligibility rates, correct/First-Guesser rates, PR improvement over
time, hardest versus most frequent words, and drawing effectiveness. These add
interpretive value without turning every raw counter into a prominent Profile
card.

## Remaining release and feature priority

1. Supply and embed the actual SFX files, then live-test volume/autoplay for
   Queue Join/Leave, Match Found and each countdown tick. The current workspace
   has no audio bytes, so `0/8` assets are embedded despite the working player.
2. Deploy v0.58 Gateway first and run two-client regression for Claims plus
   vanilla/Typo WPM evidence; then publish the v0.58 userscript.
3. Add the local Stats/Profile presentation with language filter, occurrence
   table/graph, coverage and data-quality labels.
4. Live-certify Transcended and provide its dedicated Challenge icon.
5. Implement and certify the next deterministic Challenges: Ate and left no
   crumbs, GuessingOAT, then Drop Streak after spawn/miss telemetry.
6. Certify WPM policy and then add Internet Explorer, WPMaster and TypeRacer.
7. Finish Ranked rules/history, public profiles, opt-in record submission and
   server-certified leaderboards.
8. Keep invite-only Bingo deferred: identical server-seeded 5×5 board, 1v1,
   first line wins, no free center and no Ranked interaction in its MVP.

The existing balance queue (Ouch, Picasso, Cool Number Detected, Fanboy, Color
Picker, Time Waste, Mogged, Need some space?, Smol words, Big word and Hint
Reflexes), TL;DR live metrics and the broader accessibility/localization/load-
test gates remain listed in the v0.57 consolidated roadmap.
