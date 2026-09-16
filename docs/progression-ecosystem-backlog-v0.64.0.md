# Progression ecosystem backlog — v0.64.0

This document records the proposed Achievements, Skribbl Coins, Mini-Games,
Pets and Chain Reaction ideas without coupling them to Ranked rating. Ranked
rating must never be purchasable or influenced by this ecosystem.

> v0.65.0 status: the append-only Coin ledger and authoritative Daily Word
> pilot are implemented with one 10–25 Coin daily reward and a one-Coin
> cosmetic celebration-replay sink. Achievement rewards, inventories, Pets and
> Arcade Reel remain backlog items. See
> `docs/skribbl-coins-skribble-v0.65.0.md`.

## Achievement architecture

Achievements are durable, versioned progression records rather than Duel board
Claims. Every definition needs an ID, version, progress target, evidence
authority, privacy visibility and optional reward.

Three evidence classes are required:

- **Local:** useful for personal badges, but not eligible for valuable
  server-currency rewards because browser storage can be edited.
- **Gateway-certified:** replayable from accepted versioned telemetry and safe
  for account-wide rewards.
- **Manual/special:** awarded from an explicit controlled account or operator
  event, never inferred from a display name.

Suggested catalog:

| Family | Achievement ladder | Target |
| --- | --- | --- |
| High-score wins | Skribbl Pro / Skribbl Expert / Skribbl God | Win with 7,000 / 9,000 / 10,000+ points |
| Lobby discovery | Lobby Scout / Lobbyist / Lobby Fetcher | Enter 50 / 100 / 999 distinct lobbies |
| Drawing likes | Likable / Like this, like that / Ultimate Artist | Receive 100 / 1,000 / 10,000 thumbs-up votes |
| Play time | Skribbl Enthusiast / Skribbl Mainer / Skribbl No-Lifer | Observe 24 / 100 / 1,000 hours of active play |
| Correct guesses | Guessing Gamer / Guessing Berserk / I Guess that's it | Guess 100 / 1,000 / 5,000 words |
| Reactions cast | Expressionist / Strong-opinionated / Rate-limited | Cast 100 / 1,000 / 9,999 likes or dislikes |
| Word coverage | So many words… / …and counting / Wordmaxxing | See 25% / 50% / 75% of the active official language list |
| Same-lobby time | Acquaintance / Friendship / Family | Remain in one lobby for 1 / 2 / 8 active hours |
| Skribbl win streak | Double the trouble / PentaWin / Untouchable | Reach 2 / 5 / 10 consecutive complete-game wins |
| Special encounters | Special Spotter / ThIs Is A mOd!! | Observe an entitled special avatar / meet the controlled developer account |
| Tied victory | I… wait — We won! | Finish a complete game tied for first with a positive score |
| Languages | Mr. International | Correctly guess at least one word in every supported official language |
| Successful votekicks | Skribbl Police | Participate in 50 completed votekicks |

“AFK/misbehaving” cannot be inferred reliably from a vote alone. Skribbl
Police should therefore count only a successful votekick event and must not
claim that the target deserved it.

The existing local-stat store already covers much of lobby, time, guessing,
reaction and word-coverage progress. Migration to account-wide Achievements
must preserve per-language denominators and must not silently convert
editable local history into reward-bearing certified history.

## Skribbl Coins

Skribbl Coins require an authoritative append-only ledger before any shop or
Mini-Game reward ships.

Each transaction needs:

- transaction ID and idempotency key;
- account ID;
- signed integer amount;
- source/sink type and source entity ID;
- balance before/after;
- rules version and occurred-at time;
- reversal link rather than destructive edits.

Safe earn sources include first completion of Gateway-certified Achievements,
one Daily Word solve per UTC day, capped Mini-Game results and seasonal
cosmetic participation rewards. Repeating local-only Achievements, private
Invite farming and Ranked rating changes are not earn sources.

Initial sinks should be cosmetic: Pet food/items, Pet appearances, profile
decorations and Mini-Game entry tokens with clearly bounded rewards. Coins
must have no cash value, purchase path or competitive Duel effect.

## Mini-Game catalog

### Daily Word

- One server-selected language-scoped word/seed per day.
- Versioned clue/attempt rules and one rewarded solve per account/day.
- Client input is checked by the Gateway; the answer is not shipped in advance.
- Practice remains possible after completion but gives no further Coins.

### Pets

A Pou-like cosmetic companion system can consume words, guesses or cosmetic
food items, but progression is its own state machine:

- owned Pet ID and cosmetic variant;
- hunger/happiness/experience with bounded clock updates;
- selected Pet presentation;
- versioned item inventory and ledger-backed purchases;
- no Ranked bonuses and no Challenge auto-completion.

Pets may react to accepted game events, but must not require forwarding private
chat content.

### Arcade Reel

The special-sprite “Slot Machine” should be framed as an Arcade Reel because
skribbl.io has a young audience. It must use only non-purchasable Coins,
publish transparent odds, have no cash-out/trading, guarantee bounded cosmetic
rewards and enforce a daily spend/reward cap. A deterministic server seed plus
commit/reveal audit can make outcomes verifiable without letting the browser
choose them.

## New Duel Challenge: Chain Reaction

Proposed v1 definition:

> Be the First Guesser, then have at least three other distinct players guess
> correctly within five seconds of your confirmed correct Guess.

This means four total correct guessers including the completing player. The
five-second window begins at the completing player's authoritative
`CORRECT_GUESS`, not at Drawing start. The round must have an observed start,
the completing player must be the confirmed First Guesser, and each later
guesser must be a distinct active non-drawer.

Reconnect, duplicate Guess packets, players leaving, fewer than four eligible
guessers and same-timestamp ordering need deterministic fixtures. Chain
Reaction should launch Casual-only until a live multi-client replay is
certified.

## Suggested sequence

1. Finish the Ranked rating transaction/history foundation.
2. Create the generic Achievement definition/progress contract with local
   badges only.
3. Add the server Coin ledger and one harmless earn/sink pair. **Delivered in
   v0.65.0.**
4. Pilot Daily Word. **Delivered in v0.65.0.**
5. Add one Pet with a minimal state loop.
6. Consider Arcade Reel only after age-appropriate economy/odds rules are
   approved.
7. Implement Chain Reaction independently through the existing Challenge
   definition and live-certification gates.
