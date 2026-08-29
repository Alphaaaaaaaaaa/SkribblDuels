# Duel Profile, statistics, SFX and Challenges — v0.59.0

## Delivered Profile behavior

The compact `.scd-modal-account` is now an accessible button with the normal
accent hover/active states. Its avatar always follows the saved Versus-avatar
choice: Discord uses the Discord image, while Skribbl uses the selected
Skribbl avatar parts and the existing renderer.

Opening it creates `Skribbl Duel Profile`:

- the left identity column contains the Versus avatar, Duel display name with
  its custom color, an optional locally selected Challenge-icon status, muted
  status text, the private Discord username and the account creation date;
- the right column contains twelve main statistics;
- the first two statistic cards are pin controls and can independently choose
  any registered statistic;
- `View all Stats` opens all 45 statistics, language coverage and the top 25
  occurrence-sorted word records.

The status choice and pinned slots are local UI preferences. They are not
published to Supabase and do not weaken the profile privacy boundary. Missing
stat, pin or Challenge artwork uses an honest fallback. The registries remain
the stable integration point for later supplied GIF/PNG files.

## Local statistics schema v2

Schema v2 migrates schema-v1 lifetime aggregates rather than resetting them.
New distribution values use bounded rolling samples (latest 512) so storage
cannot grow without limit. Trends compare the latest 20 eligible samples with
the previous 20; until both windows exist the value is reported as unavailable.

New registered groups include:

- typing Median/P90 and personal WPM trend;
- Guess accuracy, First-Guesser rate, WPM/time Median/P90 and both improvement
  trends;
- Drawing effectiveness (unique correct foreign guessers divided by eligible
  opponents), Drawing round score and received reactions;
- longest session, play days and current/best play-day streak;
- current/best Skribbl and Duel win streaks;
- the existing activity, lobby, social, win, Challenge, word and per-language
  coverage values.

All values remain local observations. They are not authoritative leaderboard
records. A later public profile or world-record feature must use explicit
opt-in and server-certifiable evidence.

## SFX diagnosis and browser permissions

The initially restored local workspace contained zero of the eight declared
audio files, which explained the silent v0.58 build. Refreshing `origin/main`
revealed the four files the user had already pushed: Join Queue, Leave Queue,
Countdown and Match Found. The final v0.59 build embeds those four. The other
four paths remain deliberate silent no-ops. This was a stale build/input issue,
not a missing Tampermonkey file permission.

The userscript metadata uses `@grant none`. Existing audio is compiled into
the userscript as a `data:audio/...` URL, so it needs neither `GM_getResourceURL`
nor a host/connect permission. A Chrome autoplay rejection can still occur
when a sound starts before any trusted user gesture. v0.59.0 therefore:

- prewarms one embedded audio element on the first trusted pointer/key event;
- records synchronous and asynchronous `play()` failures such as
  `NotAllowedError`;
- reports embedded/missing file counts and the last playback result;
- exposes a settings-side Test sound action.

This workspace has no Chrome/Chromium binary, so the release gate covers the
metadata, embedded-data path, volume, unlock and rejected-Promise behavior in
runtime tests, but cannot pretend to be a real audible browser/device test.
Once files are supplied, test one sound after clicking the Hub and inspect the
diagnostic line if Chrome still refuses playback.

Expected optional files are:

| Effect | Registry path |
| --- | --- |
| Join queue | `sound-effects/join-queue.ogg` — embedded |
| Leave queue | `sound-effects/leave-queue.ogg` — embedded |
| Countdown tick | `sound-effects/countdown.ogg` — embedded |
| Challenge completion | `sound-effects/challenge-completion.ogg` — missing/silent |
| Match Chat ping | `sound-effects/match-chat.ogg` — missing/silent |
| Match found | `sound-effects/match-found.ogg` — embedded |
| Intro | `sound-effects/intro.ogg` — missing/silent |
| Match win | `sound-effects/match-win.ogg` — missing/silent |

`.ogg`, `.mp3` and `.wav` are accepted by the generator. A missing file stays
a silent no-op.

## Chrome extension assessment

| Area | Current userscript | Manifest V3 extension |
| --- | --- | --- |
| Earliest injection | `document-start` | `document_start`; no inherent timing win |
| Skribbl/Typo access | Same page world, direct DOM/custom-event access | Isolated content-script world needs a small main-world bridge for page APIs/events |
| Audio | Embedded data URLs; Chrome activation applies | Packaged resources/offscreen options, but ordinary page audio still obeys user activation |
| Distribution | One Raw GitHub/Tampermonkey install link and metadata updates | Store/private deployment, manifest signing/review and separate release pipeline |
| Asset management | Build embeds optional files | `web_accessible_resources` or extension-owned playback plus CSP declarations |

Changing packaging alone will not fix missing files and will not bypass
Chrome's autoplay policy. The extension becomes valuable for a store-based
install, explicit permissions, background notifications or extension-owned
features—not for lower-latency Challenge telemetry.

Estimated engineering effort from the current modular codebase:

- basic Chrome MV3 wrapper with content/main bridge and the existing bundle:
  roughly 2–4 development days;
- robust feature parity, lifecycle tests, assets, OAuth/update/release handling:
  roughly 1–2 weeks;
- Chrome + Firefox, store/privacy material and production release automation:
  roughly 2–4 weeks.

If an extension is introduced later, keep the same core packages and produce a
second shell instead of replacing the userscript immediately.

## Challenge expansion and certification boundary

v0.59.0 expands the live manifest from 47 to 49:

| Challenge | Deterministic rule | v0.59 status |
| --- | --- | --- |
| Transcended | Hold a positive score and lead every active opponent by at least 2,000 points. | User-certified; Casual and Ranked eligible; supplied GitHub artwork embedded. |
| Ate and left no crumbs | Earn positive points in every regular drawing turn of one fully observed public game. Missing/zero own score fails; explicit drawer-left turns are skipped. | Full-game/zero/missing/mid-join replay fixtures passed; Casual enabled, Ranked awaiting live two-client certification. |
| GuessingOAT | Be First Guesser in every regular foreign drawing turn of one fully observed public game. Own and explicit drawer-left turns are skipped. | Full-game/other-first/no-first/mid-join replay fixtures passed; Casual enabled, Ranked awaiting live two-client certification. |
| Drop Streak | Catch five consecutively spawned Typo drops. | Deferred fail-closed until correlated `TYPO_DROP_SPAWNED` and `TYPO_DROP_MISSED` evidence exists. |

Each new Challenge already owns its unique icon path. The Gateway uses the
same 49-definition manifest and remains the authority for accepted telemetry
and Claims.

## Deferred Profile roadmap

1. Show all server-certified global top-three Challenge badges with tooltips
   on Ready Check.
2. Add private, friends-only and public profile visibility.
3. Add a friend/request system and the privacy-aware public profile projection.
4. Make Match Chat names open profiles; private profiles reveal only avatar,
   username, lock notice and an allowed friend-request action.
5. Add Ranked placement/history and opt-in server-certified records after the
   rating and anti-farming rules are finalized.
