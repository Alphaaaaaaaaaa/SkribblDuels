# Confirmed protocol findings

These shapes were confirmed against live Typo relay captures supplied during development.

## Game state IDs inside packet 11

| State ID | Meaning | Confirmed shape |
| ---: | --- | --- |
| 0 | Waiting for players | `{ id: 0, time, data: round }` |
| 1 | Game starting countdown | `{ id: 1, time: 3, data: round }` |
| 2 | Round announcement countdown | `{ id: 2, time: 2, data: round }` |
| 3 | Word selection | Other clients receive `{ id: drawerId }`; drawer may additionally receive `words` |
| 4 | Active drawing | Guessers receive `word: number[]`; drawer receives `word: string` |
| 5 | Round results | Contains `reason`, revealed `word`, and score triples |
| 6 | Game results | Payload not yet classified |
| 7 | Private lobby setup | Waiting/private-room state |

## Score triples

The state-5 score array is a flat series of triples:

```text
[playerId, totalScore, roundScore, playerId, totalScore, roundScore, ...]
```

Example:

```json
[5, 570, 135, 7, 280, 170]
```

becomes:

```json
[
  { "playerId": 5, "totalScore": 570, "roundScore": 135 },
  { "playerId": 7, "totalScore": 280, "roundScore": 170 }
]
```

## Player guessed

Packet 15 includes the word only for the local player who guessed correctly:

```json
{ "id": 15, "data": { "id": 21, "word": "Nagel" } }
```

Other clients see only the player ID:

```json
{ "id": 15, "data": { "id": 239 } }
```

## Time reduction

Packet 14 confirms the server-side timer reduction:

```json
{ "id": 14, "data": 32 }
```

## Vote direction

Outgoing vote:

```json
{ "id": 8, "data": 1 }
```

Incoming relayed vote:

```json
{ "id": 8, "data": { "id": 268, "vote": 1 } }
```
