# Challenge definitions v0.21.1

## Ultimate Comeback v3

A lobby hydration during an active public game captures the immutable join baseline.

1. At least one other player must lead the local player by `lead` points (default 1250).
2. The local player must later strictly overtake at least one of those baseline targets.
3. That overtake is retained as a milestone, even if another non-target or later joiner becomes the leader.
4. The challenge completes only when the local player later becomes the sole #1 in the same game session.
5. `GAME_ENDED`, a changed `gameSessionId`, or any observed total-score decrease invalidates the baseline.

Evidence contains the hydration event, the baseline-target overtake event and the later first-place event.

## Language-scoped official word lists

The shared word-list service loads:

`https://raw.githubusercontent.com/pospos21/words/main/lists/<Language>_List_Final.json`

The language name comes from normalized socket telemetry. A specific homepage language selector is used only for preloading before lobby hydration.

The loader:

- reads object entries through the `Word` property;
- normalizes case and whitespace;
- caches each language separately in localStorage;
- exposes loading/error/unsupported warnings;
- provides word-length metrics for future Small Words and Long Words definitions;
- optionally uses a userscript `GM.xmlHttpRequest` API if available, otherwise uses CORS-enabled `fetch` while retaining `@grant none` and page-context relay compatibility.

Public inspector API:

```js
skribblDuelsWordLists.getStatus()
skribblDuelsWordLists.getWords()
skribblDuelsWordLists.getLengthMetrics()
skribblDuelsWordLists.load(undefined, undefined, true)
skribblDuelsWordLists.subscribe(status => console.log(status))
```

Mogged v2 only evaluates a correct guess when the active language list has state `ready`. Unsupported languages expose a warning so the final board generator can exclude word-list-dependent challenges.
