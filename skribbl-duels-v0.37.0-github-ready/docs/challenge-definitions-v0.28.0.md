# Challenge definitions v0.28.0

## Drop It Like It's Hot v2

User-facing rename of the existing `reflexes-like-a-cat` definition. Completes on an own `TYPO_DROP_CLAIMED` event with `catchTimeMs <= 500` in a public lobby. The stable internal ID avoids breaking integrations; the definition version invalidates old 750 ms persisted state.

## Final Drop v2

User-facing rename of the existing `drop-down` definition. Completes on an own clearing/final `TYPO_DROP_CLAIMED` event with `clearedDrop === true` and `catchTimeMs >= 1000` in a public lobby.

## InstaLike

Tracks a freshly observed foreign `ROUND_STARTED` and completes when the self player submits a like (`VOTE_SUBMITTED`, vote `1`) in the same drawing turn at `0–200 ms`. Own drawings, dislikes, mid-turn joins and late likes do not qualify.

## Bullet skribbl.io

Collects five distinct public foreign drawing turns in which the self player correctly guesses at or below 10,000 ms after a witnessed `ROUND_STARTED`. Each drawing turn can count once. Progress persists across lobby changes; joining an already-running turn cannot qualify.

## Drop telemetry

The preferred source is a direct Typo relay from `processClaim(claim, true)`. Until that relay is integrated into Typo, the adapter parses only Typo's own server-confirmed message: `You caught/cleared the drop after Nms`.
