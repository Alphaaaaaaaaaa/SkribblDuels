# Challenge Definitions v0.11.0

## Need some space?

- Event: `CORRECT_GUESS`
- Actor: local player
- Lobby: public only
- Requirement: the confirmed word contains whitespace between two non-whitespace parts
- `New York` qualifies
- `New-York` does not qualify
- Guess position and guess time do not matter

## Alliteration

- Event: `CORRECT_GUESS`
- Actor: local player
- Lobby: public only
- Requirement: the first Unicode letter in the local player name equals the first Unicode letter in the confirmed word
- Comparison ignores case and combining accents
- `Alpha` + `Atlantis` qualifies
- `Älpha` + `Apfel` qualifies
- `Alpha` + `Banane` does not qualify
