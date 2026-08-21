# Challenge definitions v0.27.0

## Noob vs. Pro vs. Hacker v2

Collected positions are normalized and deduplicated on every correct guess. Repeated positions leave progress unchanged and cannot block later new positions. The regression sequence `1,1,2,2,3,4,4,5,6,7` completes at 7/7.

## Reflexes like a cat

Completes on an own `TYPO_DROP_CLAIMED` event with `catchTimeMs <= 750` in a public lobby.

## Drop down

Completes on an own clearing/final `TYPO_DROP_CLAIMED` event with `clearedDrop === true` and `catchTimeMs >= 1000` in a public lobby.

## Drop telemetry

The preferred source is a direct Typo relay from `processClaim(claim, true)`. Until that relay is integrated into Typo, the adapter parses only Typo's own server-confirmed message: `You caught/cleared the drop after Nms`.
