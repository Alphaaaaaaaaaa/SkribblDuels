# Fixtures

Store anonymized normalized telemetry fixtures here.

Recommended naming:

```text
<category>-<scenario>-v<fixture revision>.fixture.json
```

Examples:

- `guessing-quickscope-v1.fixture.json`
- `guessing-first-guesser-streak-v1.fixture.json`
- `score-over-4000-game-end-v1.fixture.json`
- `drawing-one-line-v1.fixture.json`

Do not commit raw socket exports when a compact telemetry fixture is sufficient.

- `starter-challenges-with-sniper-strict-reset-v4.fixture.json`: completes all six current sandbox challenges; the dirty second round resets Sniper to zero, followed by three new clean rounds.
- `starter-challenges-with-sniper-v3.fixture.json`: legacy fixture retained for comparing the former non-reset behavior.

## starter-challenges-with-omg-hacker-v6.fixture.json

Completes all currently registered sandbox challenges, including five consecutive self `FIRST_GUESS` events for OMG Hacker. The five turns use distinct `roundSessionId` values while remaining compatible with the turn-aware Sniper model.

- `starter-challenges-with-fanboy-v7.fixture.json`: completes all eight starter definitions and verifies Fanboy deduplication and dislike filtering.

## v11 – winner ranking, private lobby and red avatar

`starter-challenges-with-owner-red-caught-winner-v11.fixture.json` completes all 14 current starter challenges. It verifies that Caught in 4k requires the highest final score, Owner of the Lobby requires a local private-lobby create request, and My favorite color is Red requires an observed red avatar randomization followed by red login and public lobby hydration.

## starter-challenges-with-word-analysis-v14.fixture.json

Combined 19-challenge fixture. Adds a confirmed self guess of `New York` for **Need some space?** and reuses `Alpha` + `Atlantis` for **Alliteration**.

## starter-challenges-with-ultimate-comeback-wordlists-v18.fixture.json

Completes all 24 current definitions. Ultimate Comeback first overtakes an original 1250+ baseline target while remaining second, then later displaces a non-target leader. Mogged uses a deterministic test word list.


## starter-challenges-with-smol-big-words-v19.fixture.json

Completes all 26 current definitions. Mogged requires three distinct official-list attempts. `Hai` completes Smol words at the language-specific fifth-percentile threshold, while `Atlantis` completes Big word at the ninetieth-percentile threshold.

## starter-challenges-with-final-drawing-v20.fixture.json

Completes all 29 current starter challenges. The final drawing sequence includes a single pointer-correlated stroke, one color family, three start-of-turn eligible guessers and a 97% white canvas snapshot.

## starter-challenges-with-paparazzid-as-close-v22.fixture.json

Completes all 31 current starter challenges, adding a whole-name public chat mention and a close-to-correct reaction chain within 500 ms.

## starter-challenges-with-drop-challenges-v24.fixture.json

Completes all 35 current starter challenges. It interleaves a duplicate guessing position before later unique positions to regress the Noob vs. Pro vs. Hacker bug, then emits a 700 ms own Typo drop catch and a 1250 ms own final/clearing catch for the two drop challenges.

## starter-challenges-with-instalike-bullet-v25.fixture.json

Completes all 37 starter challenges. Adds the 500 ms Drop It Like It's Hot threshold, the Final Drop display name, an exact 200 ms InstaLike, and five distinct Bullet skribbl.io guesses at or below 10 seconds.


## starter-challenges-with-deserved-back-to-back-v26.fixture.json

Completes all 39 starter challenges. InstaLike uses the inclusive 250 ms boundary. Deserved records sole first place, then validates at game end even though Alpha finishes second. Back to back observes and wins two complete subsequent games consecutively.

## starter-challenges-with-solitary-pointsmaxxing-v27.fixture.json

Completes all 41 starter challenges. Deserved begins from a mid-game score snapshot and completes immediately on sole first place; Back to back counts two same-lobby `GAME_ENDED` wins without requiring `GAME_STARTING`. Solitary completes only after round end with Alpha as the sole guesser, and Pointsmaxxing uses a 501-point own drawing result.

## starter-challenges-with-spamguessing-autodraw-v28.fixture.json

Completes all 43 starter challenges. Spamguessing uses three official three-letter guesses (`Ski`, `Hai`, `Zoo`) for a three-letter target followed by `SPAM_DETECTED`. Autodraw detected! contains a correlated `.skd` load and paste event during an own public drawing turn.
