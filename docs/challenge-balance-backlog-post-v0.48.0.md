# Deferred Challenge balance backlog after v0.48.0

No item in this document changes the v0.48.0 challenge definitions or the
published 46-ID pool. Each threshold needs replay coverage and, where relevant,
language-specific word-list evidence before implementation.

| Challenge | Candidate change | Open decision |
| --- | --- | --- |
| Bloodline | Preserve completion-pending across `/credits` until server validation | Reproduce the server reset race and define the authoritative transition |
| Ouch | Tighten the post-First-Guesser window from 500 ms toward 200 ms | Confirm latency tolerance before selecting 200 ms |
| Picasso | Require likes from at least 75% of the lobby | Define denominator, self-vote and disconnected-player handling |
| Cool Number Detected | Require a score divisible by 500 instead of 250 | Verify frequency across normal lobby lengths |
| Fanboy | Replace “like three different drawings” | New completion rule still unspecified |
| Color Picker | Count only rainbow color groups | Define exact palette-to-rainbow mapping |
| Time Waste | Consider 50 seconds before a white canvas | Confirm whether lower duration is the intended balance direction |
| Mogged | Count only the player's first guess after three others guessed wrong | Define “first” across round reconnect/state restoration |
| Need some space? | Require a language-specific word count | Determine per-language thresholds from official lists |
| Smol words | Replace or refine “first on two short words” | New completion rule still unspecified |
| Big word | Replace or refine “first on one long word” | New completion rule still unspecified |
| Hint Reflexes | Permit completion only if nobody guessed before the first hint | Define simultaneous guess/hint ordering from canonical timestamps |
