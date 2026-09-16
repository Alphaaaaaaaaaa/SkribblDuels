# Skribbl Coins and Daily Skribble — v0.65.0

v0.65.0 establishes the first server-authoritative progression vertical slice:
one append-only currency ledger, one bounded earn source and one cosmetic sink.
Coins have no cash value, purchase route, transfer route, Ranked effect or Duel
advantage.

## Authority boundary

| Concern | Authority | Fail-safe behavior |
| --- | --- | --- |
| Daily word | Gateway + persisted UTC date/language row | The answer is never included in a client state message |
| Valid guesses | Gateway official word-list authority | Unavailable lists display an explicit unsupported-language notice |
| Attempts and result | Gateway + `skribble_daily_runs` | Ten accepted guesses; invalid words do not consume an attempt |
| First reward of the day | Append-only Coin ledger | One idempotency key per account/UTC date across all languages |
| Coin balance | Row-locked database RPC | A sink cannot move a balance below zero |
| Practice | Gateway session | Always unrewarded and never mutates the daily run |
| Celebration replay | Gateway ledger sink | Costs exactly one Coin and requires a rewarded solve for that date |

The Gateway derives a candidate Daily word with HMAC-SHA-256 over UTC date,
language ID and the official-list hash, then persists the first candidate for
that date/language. A later deployment or list change therefore cannot replace
an already established Daily word. Practice uses a private random valid word.

## Skribble rules v1

- The selected Skribbl language comes from local storage language ID 0–27.
- A language is playable only when its official list was fetched and validated
  by the Gateway at startup.
- Valid words contain 2–32 Unicode code points after NFKC normalization. Spaces,
  hyphens, Cyrillic and other language-specific characters remain supported.
- The player has ten accepted guesses. Membership is checked by the Gateway.
- Accepted Daily request IDs are persisted with the run, so a retried socket
  command cannot consume the same attempt twice, including after restart.
- Feedback uses a two-pass duplicate-character algorithm: exact positions are
  consumed first, then remaining answer occurrences can produce yellow marks.
- The first successful Daily run on an account in a UTC day awards 10–25 Coins.
  Solving another language, replaying the Daily or using Practice gives no
  additional reward.
- The client receives guesses, feedback, status and the next reset timestamp,
  but no answer field.

## Ledger invariants

`apply_skribbl_coin_transaction` creates/locks the account row, repeats the
idempotency lookup while holding that lock, rejects a reused key with a changed
fingerprint, validates reversal ownership and refuses negative balances. The
transaction table rejects updates and deletes; corrections append one linked
reversal instead.

Daily rewards use `skribble:daily-solve:<account>:<UTC-date>`. A concurrent
second-language solve rereads the winning transaction and stays unrewarded.
If a process stops after the ledger commit but before the Daily run stores the
transaction ID, reopening the Daily reconciles the link without adding Coins.

The Coin audit tables intentionally do not cascade from `auth.users`: account
identity deletion must not mutate an append-only financial-style audit. The
ledger stores only the pseudonymous account UUID and transaction facts; Daily
run rows still cascade with the auth identity. Public launch still requires the
documented account export/deletion policy for the wider progression ecosystem.

## UI and assets

The Skribble launcher appears only on the visible homepage at roughly 25% of
viewport height. Its modal contains Help, close control and a reusable Coin
balance pill. Each row stays on one line; all rows use the tile size required by
the widest current guess. The native input remains accessible but visually
hidden and drives custom tiles, Unicode-safe backspace/input, Enter submission,
ignored Shift+Enter and normal Tab focus movement.

The following paths are part of the release registry:

| Asset | Release state |
| --- | --- |
| `res/skribbl-coin.gif` | Embedded, supplied 40×40 GIF |
| `res/skribble.gif` | Embedded, supplied 275×40 logo GIF |
| `res/empty.gif` | Embedded, supplied 32×32 neutral tile GIF |
| `res/correct.gif` | Embedded, supplied 32×32 correct tile GIF |
| `res/semicorrect.gif` | Embedded, supplied 32×32 semicorrect tile GIF |
| `res/incorrect.gif` | Embedded, supplied 32×32 incorrect tile GIF |

The CSS/text fallback remains available for every registered asset. Replacing
one of these files and rebuilding is sufficient; no TypeScript change is required.

## Other v0.65 hardening

- Queueing is cancelled when homepage authority transitions into a lobby.
- A match found during the lobby-transition race uses a ten-second leave-lobby
  toast/clock, countdown sound at 5–1 and safe Ready cancellation at zero. The
  blocking Duel stage remains hidden during this hand-off.
- The Quick Access launcher can be configured to appear only from Ready check
  through a running Duel.
- Sound files are created and preloaded on product startup before asynchronous
  queue/Match events need them.
- `TEXT_INPUT_MEASURED` includes the number of trusted inserted characters.
  WPM display/statistics and the three WPM Challenges require at least the
  submitted character count to have been genuinely typed.

## Deployment order

1. Back up Supabase and apply
   `supabase/migrations/202609160001_create_skribbl_coin_ledger.sql`.
2. Generate a stable random secret of at least 32 characters and set the
   server-only Railway variable `SKRIBBLE_DAILY_SECRET`. Never expose or rotate
   it casually: changing it changes future Daily selections and reward amounts.
3. Deploy the v0.65.0 Gateway (Contract v12).
4. Verify `/healthz`, then `/readyz`; `supabase`, `progression`, `realtime` and
   `matchAuthority` must all report healthy.
5. Smoke-test sign-in, Coin balance, one Practice guess and an unsupported-list
   notice before enabling a rewarded Daily run.
6. Distribute the v0.65.0 userscript only after the Gateway is ready.

Contract v11 clients and the Contract v12 Gateway are intentionally not treated
as progression-compatible. Rollback therefore means restoring both Gateway and
userscript together; the new append-only tables may remain in place.
