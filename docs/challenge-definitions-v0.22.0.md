# Challenge definitions v0.22.0

## Mogged v3

For one freshly observed public guessing turn, collect visible attempts from distinct non-self, non-drawer players. A player qualifies when at least one submitted message exactly matches the normalized official word list for the lobby language.

The local correct guess completes the challenge after **three** distinct qualified players. Only the first three qualifying players are retained as completion evidence.

## Smol words v1

A confirmed local `CORRECT_GUESS` in a public lobby qualifies when:

1. the active language list has state `ready`;
2. the revealed word exists in that official list;
3. its normalized letter length is less than or equal to the language's fifth-percentile threshold.

Spaces and hyphens do not contribute to the calculated length.

## Big word v1

A confirmed local `CORRECT_GUESS` in a public lobby qualifies when:

1. the active language list has state `ready`;
2. the revealed word exists in that official list;
3. its normalized letter length is greater than or equal to the language's ninetieth-percentile threshold.

## Threshold calculation

For the sorted list of normalized word lengths, the threshold index is:

```text
floor((wordCount - 1) × percentile)
```

The configured percentiles are:

```text
Smol words: 0.05
Big word:   0.90
```

Inspector API:

```js
skribblDuelsWordLists.getStatus()
skribblDuelsWordLists.getWords()
skribblDuelsWordLists.getLengthMetrics()
skribblDuelsWordLists.getLetterLength('Roter Panda')
skribblDuelsWordLists.load(undefined, undefined, true)
```
