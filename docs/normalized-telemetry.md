# Normalized Telemetry Layer

Version: 0.4.0

## Purpose

The protocol decoder and canonical lobby reducer describe skribbl.io. The telemetry layer describes gameplay concepts used by challenges.

Challenge implementations must subscribe to telemetry events rather than packet IDs, DOM selectors or reducer internals.

## Event envelope

```ts
interface TelemetryEvent {
  schemaVersion: 1;
  eventId: string;
  telemetrySequence: number;
  type: string;
  category: string;
  occurredAt: number;
  monotonicMs: number;
  actor: { playerId: number | null; name: string | null; isSelf: boolean } | null;
  context: TelemetryContext;
  source: TelemetrySource;
  payload: unknown;
  confidence: 'confirmed' | 'derived' | 'provisional';
  highVolume: boolean;
}
```

## Round values

`context.roundIndex` preserves the zero-based server value.

`context.roundNumber` is one-based and must be used by UI and challenge rules.

## Event sources

State-change events produce semantic telemetry such as guesses, scores and round transitions.

Decoded packets are consumed directly only when the reducer intentionally does not retain their detailed payload, especially draw-command batches and outgoing submissions.

## High-volume policy

`DRAW_COMMAND_BATCH` and `DRAW_COMMAND_BATCH_SUBMITTED` are emitted live with full decoded commands. They are not retained in telemetry history. Raw packet ID 19 remains available in IndexedDB when detailed forensic analysis is explicitly required.

## Current semantic events

### Lobby

- `LOBBY_HYDRATED`
- `LOBBY_CHANGED`
- `PLAYER_JOINED`
- `PLAYER_LEFT`
- `PLAYER_UPDATED`
- `PLAYER_RENAMED`
- `LOBBY_SETTING_CHANGED`
- `LOBBY_OWNER_CHANGED`
- `PRIVATE_LOBBY_CREATE_REQUESTED`
- `LOBBY_JOIN_REQUESTED`
- `PRIVATE_LOBBY_READY`

### Round and scoring

- `GAME_STATE_CHANGED`
- `LOBBY_WAITING`
- `GAME_STARTING`
- `ROUND_ANNOUNCED`
- `WORD_SELECTION_STARTED`
- `ROUND_STARTED`
- `DRAWING_STARTED`
- `ROUND_ENDED`
- `WORD_REVEALED`
- `ROUND_RESULTS_AVAILABLE`
- `GAME_ENDED`
- `SERVER_TIME_CHANGED`
- `SCORE_CHANGED`

### Guessing and chat

- `TEXT_SUBMITTED`
- `GUESS_SUBMITTED`
- `CHAT_MESSAGE_RECEIVED`
- `WRONG_GUESS`
- `CLOSE_GUESS`
- `CORRECT_GUESS`
- `FIRST_GUESS`
- `HINT_REVEALED`
- `SPAM_DETECTED`

### Drawing

- `DRAW_COMMAND_BATCH`
- `DRAW_COMMAND_BATCH_SUBMITTED`
- `CANVAS_CLEARED`
- `CLEAR_CANVAS_SUBMITTED`
- `STROKE_UNDONE`
- `UNDO_SUBMITTED`
- `VOTE_RECEIVED`
- `VOTE_SUBMITTED`
- `LIKE_RECEIVED`
- `DISLIKE_RECEIVED`

### Home and moderation

- `RED_AVATAR_LOGIN_CONFIRMED`
- report/mute/votekick/host moderation submission events
- `PROTOCOL_ANOMALY`
