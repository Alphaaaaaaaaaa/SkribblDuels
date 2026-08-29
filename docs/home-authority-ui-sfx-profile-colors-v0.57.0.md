# Homepage authority, UI/SFX and profile colors — v0.57.0

## Homepage matchmaking authority

The client no longer equates “latest event is null” with an empty homepage.
It starts one current-runtime authority state from both the real rendered `/`
homepage and the canonical lobby snapshot:

- a visible homepage plus an unhydrated, empty lobby snapshot starts `home`;
- lobby IDs/session IDs, players or join-request telemetry move it to `lobby`;
- neutral startup anomalies do not revoke an already verified homepage;
- avatar/logo events, a canonical self `PLAYER_LEFT`, or Typo's `leftLobby`
  event confirm `home` again.

The visible `#home` check remains mandatory. An active lobby snapshot therefore
continues to block a DevTools-only `display:flex` change. Typo `leftLobby` is
bridged as the versioned `TYPO_LOBBY_LEFT` Telemetry event and covers both its
normal Exit Lobby action and synthetic Practice leave.

## UI and Match Chat integration

The Settings surface now separates:

- Challenge completion lines in Skribbl chat;
- Match Chat toast notifications;
- confirmed Match Chat lines mirrored into Skribbl chat;
- one configurable Match Chat command prefix;
- Win animation.

The normalized default is `/sdchat`. A missing slash is inserted automatically,
the command ID is restricted to safe command characters and `/msg`/`/chat` are
not aliases. The same configured command is intercepted in vanilla Skribbl chat
and `#typo-command-input`. A compatible command result is injected into Typo's
`.typo-command-preview`, including the `text` parameter and submission state.

## Optional SFX registry

`sound-effects/registry.template.json` owns all paths. `.ogg`, `.mp3` and `.wav`
are accepted. Build-time registry syntax, path and extension errors fail the
build; an intentionally absent audio file is omitted from the generated assets
and playback becomes a silent no-op.

Registered hooks cover queue join/leave, Match found, five per-second countdown
ticks, Challenge completion, Match Chat ping, intro and Match win. Button SFX
remain deferred. The UI exposes a Skribbl-style 0–100 volume slider with
`audio.gif`/`audio_off.gif` states and an independent Match Chat ping toggle.

## Authoritative name and Claim colors

Migration `202608280001_add_duel_name_colors.sql` adds one constrained profile
index from 0 through 27. Contract v11 projects it through `WELCOME` and every
match participant. Clients never submit CSS or markup.

The Duel profile opens a separate simplified color-atlas modal with only a
close button, one color sprite and left/right color arrows. Solid names use one
color. Two-color names alternate by visible grapheme parity, and owned board
Claims use the corresponding two-color stripe. The same identity color is used
for Versus names, Match Chat senders and Challenge/Win chat lines.

The corrected canonical palette is:

| Index | Primary | Alternating |
| ---: | --- | --- |
| 0 | `#ed2b34` | — |
| 1 | `#ff7b00` | — |
| 2 | `#ffff1b` | — |
| 3 | `#67db14` | — |
| 4 | `#00f2ff` | — |
| 5 | `#4058f6` | — |
| 6 | `#ab04f9` | — |
| 7 | `#ff75db` | — |
| 8 | `#00eda2` | — |
| 9 | `#ff7a7d` | — |
| 10 | `#847e87` | — |
| 11 | `#423f43` | — |
| 12 | `#8f563b` | — |
| 13 | `#663931` | — |
| 14 | `#eec39a` | — |
| 15 | `#ed2b34` | `#aa1f00` |
| 16 | `#ffff1b` | `#fecc10` |
| 17 | `#67db14` | `#4f8b01` |
| 18 | `#1cffff` | `#45beff` |
| 19 | `#4058f6` | `#3f25d7` |
| 20 | `#e23af2` | `#ab04f9` |
| 21 | `#9badb7` | `#847e87` |
| 22 | `#8f563b` | `#663931` |
| 23 | `#eec39a` | `#ed9e6d` |
| 24 | `#00eda2` | `#09a98f` |
| 25 | `#ff7a7d` | `#d84c69` |
| 26 | `#ffffff` | — |
| 27 | `#ffffff` | `#e8e8e8` |

Entitlement details are presentation feedback only after Save Profile. Closing
the profile clears that feedback until the next save.

## Prioritized remaining development

### P0 — deploy and live-certify v0.57.0

1. Apply the profile-color migration, deploy Contract v11 Gateway first and
   then install the v0.57.0 userscript.
2. Run two-client checks for clean homepage reload, forged `#home` in an active
   lobby, vanilla leave, Typo Exit Lobby and Practice leave.
3. Verify all 28 color indexes (especially 15, 26 and 27), striped Claims,
   reconnect projection and Profile Save/close feedback.
4. Supply repository-owned audio files and verify browser playback/volume on
   queue, countdown, completion, win and only recent opponent Match Chat.

### P1 — local WPM and word-stat Telemetry

1. Add versioned input-start/submission evidence with character count,
   duration, paste/autofill and IME-composition flags; derive WPM as
   `(characters / 5) / minutes` in the shared authority rule.
2. Persist per-language/per-word typed count, correct guesses, occurrence,
   average guess time, average/best WPM, first/last seen and distinct coverage.
3. Add occurrence sorting and authoritative word-list coverage percentage.
4. Keep local Telemetry running outside Duel matches; upload only explicitly
   opted-in, server-certifiable records.

### P2 — Challenge expansion and certification

The pool continues to grow; every new Challenge gets its own registry path and
stays out of Ranked until deterministic replay, false-positive and live metrics
pass.

| Order | Challenge | Remaining authoritative work |
| ---: | --- | --- |
| 1 | Ate and left no crumbs | Implemented with full-game, zero/missing score, drawer-left and mid-join fixtures in v0.59.0; Casual live certification remains. |
| 2 | GuessingOAT | Implemented with full-game, other/no First Guesser, own/interrupted turn and mid-join fixtures in v0.59.0; Casual live certification remains. |
| 3 | Drop Streak | Five consecutive caught Typo drops; requires correlated `TYPO_DROP_SPAWNED` and `TYPO_DROP_MISSED`, because claims alone cannot prove a streak. |
| 4 | Internet Explorer | First Guesser below 10 WPM; requires certified WPM/anti-paste evidence. |
| 5 | WPMaster | Ten correct guesses at 150+ WPM; decide First-Guesser requirement and preserve distinct round IDs. |
| 6 | TypeRacer | One correct guess at 250+ WPM with anti-paste evidence. |

Transcended is Challenge 47, user-certified for Ranked and its GitHub icon is
embedded in v0.59.0. TL;DR v2 and all existing
Challenges still need real two-client exposure metrics (recommended: at least
100 eligible exposures and 20 genuine completions per definition).

After those new candidates, the older balance ideas for existing definitions
remain a separate review queue. Bloodline's reload persistence from that queue
is complete; the remaining proposals still need these product decisions:

| Existing Challenge | Deferred balance idea / decision still needed |
| --- | --- |
| Ouch | Consider reducing the post-First-Guesser window from 500 ms toward 200 ms after real latency measurements. |
| Picasso | Consider likes from at least 75% of the lobby; define denominator, self-votes and disconnects. |
| Cool Number Detected | Consider divisibility by 500 instead of 250 after measuring normal-game frequency. |
| Fanboy | Supply a replacement for “like three different drawings.” |
| Color Picker | Count only defined rainbow color groups; lock the palette mapping first. |
| Time Waste | Decide whether the white-canvas threshold should move to 50 seconds. |
| Mogged | Count only the player's first guess after three wrong guessers; define reconnect behavior. |
| Need some space? | Derive a language-specific word-count threshold from authoritative lists. |
| Smol words | Supply the replacement/refinement for “first on two short words.” |
| Big word | Supply the replacement/refinement for “first on one long word.” |
| Hint Reflexes | Require nobody to guess before the first hint; define equal-timestamp ordering. |

### P3 — Ranked, profiles, records and history

1. Define rating/provisional/season rules plus Draw, Forfeit, disconnect and
   reconnect-timeout effects; make rating updates idempotent.
2. Add repeated-opponent farming protection, leaderboard and match history
   (opponent, board, claims, score, result and duration).
3. Build the full User Profile with local achievements, opted-in word/WPM
   statistics, Ranked placement and server-certified world records such as
   fastest valid WPM and fastest Challenge completion.
4. Finish public/private profile fields, entitlement/moderation administration,
   account export/deletion and record privacy policy.

### P4 — invite-only Bingo (deferred confirmed MVP)

- shared identical server-seeded 5×5 board;
- 1v1 only;
- first row, column or diagonal wins;
- no free center;
- no Ranked/leaderboard interaction in the MVP.

Local marks may keep network traffic small, but the Gateway must run the same
25 authoritative Challenge runtimes per player and validate the five fields in
the winning line. Simultaneous line completion remains idempotent. Group Bingo
is a later architecture change because current ready/chat/conclusion contracts
are pair-based.

### P5 — product/release completion

Complete German/English copy, keyboard/ARIA/focus QA, responsive and
reduced-motion testing, two-browser E2E, forced reconnect/Gateway-restart and
load tests, staging/canary gates, migration-first deployment automation,
rollback and operator/incident documentation. Also decide whether friendly
invites receive a distinct history/format flag before Ranked history ships.
