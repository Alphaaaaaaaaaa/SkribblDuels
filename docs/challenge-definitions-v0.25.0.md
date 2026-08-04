# Challenge definitions v0.25.0

## Paparazzi'd

- Event chain: `LOBBY_HYDRATED`/self rename -> foreign `CHAT_MESSAGE_RECEIVED`.
- Public lobbies only.
- The full normalized local player name must appear as a whole phrase.
- Self messages and substrings inside longer words do not count.

## As close as it gets

- Event chain: `CLOSE_GUESS` -> immediate next `GUESS_SUBMITTED` -> self `CORRECT_GUESS`.
- The correct event must arrive within 500 ms of the close event, inclusively.
- A second submitted guess before the correct result invalidates the chain.
- All events must share the same drawing-turn session.
