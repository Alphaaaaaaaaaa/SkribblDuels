# Reload, ImageLab and retry hardening v0.55.1

## Durable Claim resume

Telemetry batches and dependent Claim candidates remain in session storage
across navigation. An authenticated replacement socket now flushes restored
telemetry immediately after `WELCOME`; the following authoritative snapshot and
ACK can therefore release dependent candidates normally. This closes the
specific `/credits` boundary which previously blocked Bloodline and every later
Claim in that page session.

The Supabase Site URL does not need a wildcard for this transport. OAuth redirect
allow-list rules and in-match telemetry delivery are separate concerns.

## Typo and ImageLab

The relay listener still starts synchronously at `document-start`. While either
Typo MessagePort is absent it additionally publishes an exponential retry
handshake through both a DOM event and `postMessage`; a Typo build loaded later
can transfer fresh ports without restarting Skribbl Duels.

Autodraw now supports three evidence paths:

1. a direct versioned Typo event;
2. an observed `.skd` file plus exact outgoing command matching;
3. the real ImageLab saved-command row, its `.skd` filename, the emitted
   `performDrawCommand` sequence and the end of Typo's locked playback state.

The third path matches the supplied Svelte implementation and works even when a
detached file picker is invisible to the userscript sandbox.

## Word-list retry

An early `languageId: -1`, `languageName: null` state is transient. The runtime
probes the homepage select after 250 ms and exponentially backs off to ten
seconds until a selectable language becomes available. Network errors retry the
specific canonical language with a forced load; a known, successfully fetched
list stops the timer. Every canonical Skribbl ID from 0 through 27 is eligible.

## Local WPM and profile telemetry contract (next implementation)

Local telemetry continues independently of Duel match state. The planned
versioned aggregate is keyed by canonical language ID and canonical word and
stores only the measurements needed for local statistics:

- typed count, correct-guess count and observed-word occurrence count;
- total/average time to correct guess, total/average WPM and best WPM;
- first/last observed timestamps and distinct official words guessed;
- word-list coverage as `distinct official guessed / authoritative wordCount`.

Each WPM sample starts with the first user edit of a non-empty input and ends at
submission. Duration, Unicode character count, paste/autofill flag and IME
composition flag are the evidence; WPM is derived from `(characters / 5) /
minutes`. Raw unrelated chat text is not required for the aggregate.

Future User Profiles can expose opted-in local achievements, Ranked placement
and server-certified records such as fastest valid WPM or fastest Challenge
completion. Ranked/history and public world records require separate durable
server tables, anti-paste certification, privacy controls and idempotent record
updates; they must not treat a browser-only aggregate as authoritative.
