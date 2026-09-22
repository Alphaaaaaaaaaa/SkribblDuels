# Firefox Auth and terminal/Slots UI polish — v0.68.0

v0.68.0 keeps Gateway Contract v14 and Slots rules version 2. It hardens the
browser OAuth callback and the Auth-to-profile provisioning boundary, then
finishes the requested Skribble and Skribbl Slots presentation changes.

## Firefox Discord OAuth

The client no longer delegates callback detection to an opaque background
initialization. It detects the returned authorization code itself, exchanges it
through Supabase Auth, reports the actual callback error in the account card and
removes OAuth parameters only after handling them. PKCE/session values are
mirrored to both same-origin `localStorage` and `sessionStorage`; either store
can restore the Firefox redirect tab if the other is unavailable to the
userscript realm.

Discord usernames and Duel display names are intentionally separate. A
provider username such as `lboot__` remains valid and is stored unchanged.
Only the player-facing Duel name uses the existing ASCII-alphanumeric rule.
Migration `202609220001_harden_discord_profile_sync.sql` reasserts that split,
uses an account-specific fallback after sanitization or collision, avoids stale
provider-link collisions aborting OAuth, and backfills Auth users whose profile
was missing after a historical partial sign-in.

Supabase's managed Discord provider still requests its provider-default email
scope. The userscript supplies no explicit `identify` or `email` scope. Removing
email from the Discord consent page requires replacing/configuring the managed
provider boundary, not another browser option.

## Skribble loss sequence

- Attempt tiles are Fisher–Yates shuffled.
- Two tiles begin falling every 50 ms; an odd last tile falls alone.
- The terminal message does not start until the last pair's 720 ms fall has
  completed.
- All “You lose!” tiles enter together while the board height contracts with a
  560 ms easing curve.
- The completed terminal layout remains stable when the modal is reopened.

## Skribbl Slots Help and Hearts

About/Help is now a dedicated modal view rather than an extra card above the
machine. The Return control restores the unchanged machine. Each transparent
weight card contains:

1. icon plus a first row with name and base rarity;
2. a second row containing Coins/Free Spins, `Effect`, `Nothing`, or
   `3 for 1 Free Spin` for Heart.

The responsive auto-fit grid prevents the name, rarity and reward from
overlapping. Reel backgrounds use Skribbl's `--COLOR_INPUT_BG`. A collected
Heart grows and returns to its original size over one second; only then does
the persistent Heart progress update.

## Deployment

1. Apply `202609220001_harden_discord_profile_sync.sql` after all v0.67
   migrations.
2. Install/distribute the v0.68.0 userscript.

The deployed Contract v14 Gateway remains compatible. No new Railway variable
is required.
