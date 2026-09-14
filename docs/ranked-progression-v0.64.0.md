# Authoritative Ranked progression foundation — v0.64.0

## Status and safety boundary

This version starts P2 without pretending that Ranked persistence is already
live. It freezes the first deterministic rating rules in
`apps/gateway/src/rankedRating.ts` and tests them independently of browsers,
Supabase and Socket.IO.

The reported local-only Claim/reconnect regression remains P0. It does not
block design and deterministic rating work, but it **does block enabling public
rating mutations**: a Ranked result is only fair when both clients converge on
the same authoritative Claims and conclusion.

No rating migration, production write or leaderboard is enabled by this
foundation.

## Rating algorithm v1

Skribbl Duels uses a deliberately small, transparent Elo model for its first
1v1 season. Glicko-2 remains a possible later upgrade once the player
population is large enough to justify rating deviation and inactivity models.

| Rule | v1 decision |
| --- | --- |
| Initial rating | 1000 |
| Expected-score scale | 400 Elo points |
| New-account placements | 10 rated matches |
| Returning-account recalibration | 5 rated matches after a season reset |
| Placement K-factor | 64 when either participant is still provisional |
| Established K-factor | 32 |
| Win / Draw / Loss score | 1 / 0.5 / 0 |
| Score margin or match duration multiplier | None |
| Rating floor | 0 |
| Rounding | Nearest whole point; a decisive rated result moves at least 1 point |
| Pair farming limit | At most 3 rated conclusions for the same pair in a rolling 24 hours |

For player A:

```text
expectedA = 1 / (1 + 10 ^ ((ratingB - ratingA) / 400))
deltaA = round(K * (actualA - expectedA))
deltaB = -deltaA
```

Using one shared K-factor preserves a zero-sum result. The Challenge score and
elapsed time are stored in history but do not alter rating; this avoids
incentives to delay a won match or farm extra fields.

### Worked examples

| Before | Situation | K | Change | After |
| --- | --- | ---: | ---: | --- |
| 1000 vs 1000 | A wins while either player is provisional | 64 | +32 / -32 | 1032 / 968 |
| 1000 vs 1000 | A wins; both established | 32 | +16 / -16 | 1016 / 984 |
| 1200 vs 1000 | Favourite A wins | 32 | +8 / -8 | 1208 / 992 |
| 1200 vs 1000 | Underdog B wins | 32 | -24 / +24 | 1176 / 1024 |
| 1000 vs 1000 | Mutual Draw | 32 | 0 / 0 | 1000 / 1000 |
| Any pair | Fourth rated meeting inside 24 hours | — | 0 / 0 | unchanged |

## Which matches are rated

A match is rating-eligible only when all of these are true:

1. The authoritative format is Ranked.
2. The synchronized running phase was reached and `startedAt` exists.
3. The match originates from public Ranked matchmaking, or is a Rematch of an
   eligible rated match.
4. The exact pair has fewer than three already-rated conclusions in the
   preceding rolling 24 hours.
5. The Gateway owns a final immutable conclusion.

Private Invite matches use the Ranked board when selected but remain unrated.
A Rematch inherits the rated/unrated status of its originating match and still
counts toward the pair limit.

| Conclusion | Rating result |
| --- | --- |
| Win target reached | Winner 1, loser 0 |
| Explicit Forfeit after match start | Opponent 1, forfeiting player 0 |
| Disconnect after the existing 30-second grace expires | Connected player 1, disconnected player 0 |
| Mutually accepted Draw | 0.5 / 0.5 |
| Ready-check expiry or cancellation | Unrated |
| Draft cancellation or server abort before `startedAt` | Unrated |
| Gateway failure without an immutable conclusion | Unrated and recoverable, never guessed by a client |

A player cannot avoid a loss by closing the page after the running phase starts.
Conversely, no rating changes merely because a Ready check or Draft could not
finish.

## Seasons and placements

Season creation and rollover are Gateway/operator actions with explicit
`starts_at` and `ends_at` values; the browser never decides the active
season.

- A new account begins internally at 1000 and is displayed as **Unranked** for
  its first 10 eligible results.
- At season rollover, established ratings soft-reset halfway toward 1000:
  `1000 + (oldRating - 1000) × 0.5`.
- Returning players complete 5 recalibration games. Their numeric rating and
  provisional state may be shown, but leaderboard placement waits until all
  five are complete.
- New accounts entering mid-season still use 10 placements.
- Permanent named tiers should be set only after beta distribution data exists;
  v1 exposes the number and placement state instead of inventing unstable
  boundaries.

## Exactly-once persistence design

The implementation phase should add three service-role-only data structures:

1. `duel_ranked_seasons`: immutable season identity and time window.
2. `duel_ranked_ratings`: one locked current row per season/account with
   rating, placements remaining, wins, losses, draws and revision.
3. `duel_ranked_rating_events`: one immutable audit event per Match ID,
   containing conclusion revision, both before/after ratings, deltas, outcome,
   pair-window count and rules version.

The mutation must be one PostgreSQL function/transaction:

1. Read the terminal `duel_match_authority` row and verify the persisted
   snapshot, Ranked format, `startedAt`, participants and conclusion.
2. Derive the canonical pair key by sorting account IDs.
3. Lock both rating rows in sorted account-ID order.
4. Count already-rated pair events in the rolling window.
5. Calculate both changes with rating rules version 1.
6. Insert the Match audit event with `match_id` as a unique key.
7. Update both rating rows only if that insert succeeded.
8. Return the existing immutable event when the same Match is retried.

The idempotency identity is the authoritative Match ID plus terminal revision,
not a browser request ID. A repeated Gateway callback, process restart or
Supabase retry therefore returns the same event and cannot award rating twice.
A conflicting terminal revision for an already-rated Match is a critical
diagnostic and performs no mutation.

## Match history, rank and leaderboard order

Implementation order remains:

1. Private Match History
2. Current numeric rating and placement progress
3. Opt-in leaderboard

Each private history entry contains:

- Match ID and season
- format and rated/unrated reason
- opponent display name snapshot
- start/end time and duration
- final Challenge score
- complete drafted board
- accepted authoritative Claims with definition versions
- conclusion reason
- rating before, delta and after
- rating rules version

History is cursor-paginated and account-private by default. The client receives
only its own rating perspective; it never receives another player's private
history.

The public leaderboard is opt-in, defaults to off and exposes only Duel display
name, approved avatar presentation, rating, placement state and aggregate
record. Discord IDs, usernames, Match IDs, opponent history and raw telemetry
are never public.

## Privacy, export and deletion

- Account export contains the user's season rating rows and private Match
  history in a versioned JSON document.
- Deletion immediately removes the current rating and leaderboard presence.
- The opponent may retain the factual Match entry, but the deleted participant
  is rendered as `Deleted player` and no longer resolves to a public profile.
- Minimal pseudonymized rating audit data may be retained only for
  exactly-once/anti-fraud integrity under a documented retention period; this
  requires a privacy-policy decision before public launch.
- Raw chat, access tokens and raw telemetry are not copied into rating history.

## Release gates

Public rating mutations stay disabled until all are true:

- the Claim reconnect P0 matrix converges under forced transport failures;
- migration/RPC tests prove transaction rollback and duplicate safety;
- Gateway restart tests replay a conclusion without a second mutation;
- history RLS tests prove cross-account isolation;
- pair-limit and season-boundary clock tests pass;
- one closed-beta season validates rating distribution before tier boundaries
  or a public leaderboard are enabled.
