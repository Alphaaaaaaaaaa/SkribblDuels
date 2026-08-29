# Native Chat Stat Display — v0.61.0

## Scope

v0.61.0 adds two opt-in presentation settings to Skribbl Duels without
changing the 53-Challenge pool, Gateway Contract v11 or any authoritative
match behavior.

`Show WPM stat display` supports:

- `Disabled`: no WPM suffix is rendered.
- `Correct Guesses`: a clean local WPM sample is appended only after the
  corresponding correct Guess is confirmed.
- `All Typed Messages`: the same correct-Guess suffixes are shown and clean
  local WPM is also appended to ordinary locally typed chat messages.

`Show guess time behind guess messages` supports:

- `Disabled`: native correct-Guess messages are unchanged.
- `Self Guesses`: the local player's correct Guess shows its absolute elapsed
  time from the beginning of the Drawing turn.
- `All Guesses`: the first correct Guesser shows the absolute elapsed time;
  later Guessers show the positive delta from the immediately preceding
  correct Guess.

Both settings default to `Disabled` so an existing installation retains its
current chat presentation.

## Presentation rules

- Absolute examples: `(5.385s)`, `(5.520s)`, `(1m 15s)`.
- Relative examples: `(+529ms)`, `(+11.593s)`, `(+1m 1s)`.
- WPM is rounded to the nearest whole number and rendered as `183wpm`.
- When both values exist, the suffix order is Guess Time followed by WPM:
  `Alpha guessed the word! (5.520s) 183wpm`.
- Guess Time uses `var(--COLOR_CHAT_TEXT_GUESSED)`.
- WPM uses the existing `.scd-muted` color.

The adapter appends dedicated spans to a newly observed native Skribbl chat
row. It does not rewrite the native player name or message text. A runtime
reload removes only Skribbl Duels-owned suffix spans.

## WPM trust boundary

Displayed WPM uses the existing local `TEXT_INPUT_MEASURED` pipeline. A sample
is displayable only when it comes from the DOM input adapter, is confirmed and
trusted, matches the measured Unicode character count, lasts from 250 ms to
five minutes and produces at most 609 WPM. Paste and autofill remain excluded.

For a correct Guess, the display correlates the clean measurement with the
outgoing `GUESS_SUBMITTED` event and the self `CORRECT_GUESS` event in the same
lobby/round boundary. The display does not weaken or replace the stricter
Gateway-replayable evidence used by Internet Explorer, WPMaster and TypeRacer.

Other players' WPM cannot be measured locally and is never inferred. The All
Typed Messages mode therefore means all locally typed messages, while the All
Guesses time mode can cover every confirmed player because correct-Guess
elapsed time is part of the normalized Telemetry Event Contract.

## Lifecycle and deployment

Telemetry annotations and newly observed DOM rows are correlated inside a
bounded eight-second window. Event identifiers, measurements, annotations and
per-round timing maps are bounded or cleared at round/lobby boundaries.
Duplicate telemetry cannot append a duplicate suffix.

No Gateway deployment, database migration or new environment variable is
required. The v0.60.0 Gateway remains compatible; distribute the v0.61.0
userscript after the usual local typecheck, test and build verification.
