# Telemetry, chat and Challenge hardening v0.56.0

## Matchmaking authority

Matchmaking still requires a visible `/` homepage and a rendered `#home`, but
DOM state alone is no longer sufficient. The most recent Telemetry event must
also be one of:

- no event in the current runtime;
- `AVATAR_RANDOMIZED`, `LOGO_AVATAR_CLICKED` or `SPECIAL_AVATAR_FOUND`;
- a self-authored `PLAYER_LEFT` with the canonical `DISCONNECT`, `KICKED` or
  `BANNED` reason.

An active-lobby event therefore keeps matchmaking locked even when `#home` is
changed to `display:flex` in developer tools. Opponents leaving do not unlock
the state.

## Challenge corrections

- Back to back v6 counts two consecutive `GAME_ENDED` wins by the local player
  in the same `lobbyId`. Either game may already be running when observed.
- Deserved? v5 completes only from a coherent round/game result where the local
  player has a positive score strictly above every active opponent. A zero,
  tie, transient per-player score update or any observed local First Guesser
  disqualifies that result.
- Transcended owns the reserved `challenge-icons/transcended.gif` path. Missing
  Challenge artwork is legal at build time and uses the initial-letter fallback;
  required UI/countdown artwork remains fail-fast.

Every Challenge registry entry now owns `challenge-icons/<challenge-id>.gif`
or `.png`. This is the required convention for future pool additions.

## TL;DR v2 offline prose detector

TL;DR no longer accepts length-only random text. It requires 50 visible
characters, eight lexical words, roughly 90% recognized words and no single
word repeated in more than 40% of the message. URLs, mentions, number-only and
emoji-only segments cannot provide the word count.

The build contains the top 5,000 frequency entries for all 28 Skribbl language
IDs as exact and one-deletion Bloom filters. Words of at least five Unicode code
points accept one insertion, deletion, substitution or adjacent transposition.
There is no runtime request, AI call or token consumption. The generated data
records a source and selected-word SHA-256 per language. Source data is Hermit
Dave FrequencyWords under MIT; its license is stored in
`third_party/FrequencyWords-LICENSE.txt`.

The detector uses 16 bits per item and 11 hashes. This keeps the userscript
asset compact while making isolated Bloom false positives rare; message-level
repetition and 90% thresholds prevent random strings from qualifying.

## Match Chat integration

- The chat log and form are separate CSS Grid rows; Draw/Rematch controls can no
  longer scroll messages behind the input.
- A focused input, its draft, selection and caret are restored after incoming
  messages, spam warnings and Match state rerenders.
- Confirmed private messages are mirrored into vanilla Skribbl chat with the
  sender's Versus avatar, Duel display name and message. Historical reconnect
  replay is not mirrored.
- `/sdchat message`, `/msg message` and `/chat message` send only to Match Chat.
  The capture path supports both the vanilla input and Typo's
  `#typo-command-input`, and stops the command before Skribbl can publish it.

## Deferred sound system

Implement sounds behind one shared audio controller rather than separate event
listeners. Store a `masterVolume` value from 0–1 and independent toggles for at
least button feedback and Match Chat pings; Challenge completion, countdown and
queue transition sounds can use the same controller. Audio should unlock after
the first user gesture, respect reduced-motion/sound preferences, avoid pinging
for replayed or self-authored history, and use repository-owned versioned
assets. The feature waits for the final sound pack.

## Deferred custom name and Claim colors

Persist only a server-validated palette index from 0–27, never arbitrary CSS.
The first 16 indexes map to one supplied color; the remaining 12 map to a pair.
For paired colors, alternate by visible grapheme parity in the display name and
Claim name rendering. The profile RPC, database constraint, Gateway identity
projection and participant contract must all be updated together so an edited
client cannot inject markup or CSS. The user's supplied 28-color atlas palette
is the canonical design input for that migration.

| Index | Primary | Alternating color |
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
| 15 | `#ffffff` | — |
| 16 | `#ed2b34` | `#aa1f00` |
| 17 | `#ffff1b` | `#fecc10` |
| 18 | `#67db14` | `#4f8b01` |
| 19 | `#1cffff` | `#45beff` |
| 20 | `#4058f6` | `#3f25d7` |
| 21 | `#e23af2` | `#ab04f9` |
| 22 | `#9badb7` | `#847e87` |
| 23 | `#8f563b` | `#663931` |
| 24 | `#eec39a` | `#ed9e6d` |
| 25 | `#00eda2` | `#09a98f` |
| 26 | `#ff7a7d` | `#d84c69` |
| 27 | `#ffffff` | `#e8e8e8` |

## Bingo recommendation and open product decisions

Bingo is a strong invite-only format and should not enter Ranked. The safe MVP
is 1v1, one server-seeded shared 5×5 board, no free center, local per-player
visual marks and the first completed row, column or diagonal winning.

The server should not trust a browser's single `line complete` claim. It can
avoid broadcasting every cell, but it must consume the same authoritative
Telemetry stream, maintain the 25 Challenge runtimes per player internally and
certify that the submitted line's five fields are complete. There are twelve
possible lines, and finalization must be idempotent to handle simultaneous
wins. This preserves the lightweight local UI without making DevTools a win
button.

Product choices needed before implementation:

1. shared identical board (recommended) or a different deterministic board per
   player;
2. 1v1 MVP (recommended) or group lobbies in the first release;
3. first line wins (recommended), best-of-lines, or full-house continuation;
4. no free center (recommended) or a traditional free square.

Group Bingo is a later architecture step because the current Match authority,
ready check, chat, conclusion and participant contracts are pair-based.
