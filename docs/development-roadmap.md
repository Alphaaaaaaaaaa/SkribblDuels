# Skribbl Duels Development Roadmap

## Completed foundation

| Phase | Status | Result |
| --- | --- | --- |
| Telemetry and protocol state | Complete | Versioned telemetry contract, replay fixtures and protocol/lobby state |
| Challenge system | Complete | 46 modular challenges with automated runtime coverage |
| Product foundation | Complete | Casual 3×3, Ranked 5×5, conflict-aware draft generation and match freeze |
| Account identity | Complete | Discord OAuth through Supabase, RLS profiles and automatic profile synchronization |
| Gateway foundation | Complete | Railway HTTPS service, token verification, profile lookup, `HELLO`/`WELCOME` and heartbeat |
| Release delivery | Complete | ASCII-safe installable userscript tracked at a stable GitHub path |
| Match lifecycle | Complete | New starts abort old local/server matches and dispose superseded userscript runtimes |
| Matchmaking and ready check | Complete | Homepage-only Gateway queues, simulated opponents and 30-second ready state |

## Active development sequence

### 1. Server-authoritative draft

- Casual board: 3×3, five fields required to win.
- Ranked board: 5×5, thirteen fields required to win.
- Randomly choose the starting player.
- Allow 15 seconds for each draft selection.
- Enforce challenge conflicts on the Gateway. Blind Guess and Drunk Vision can
  never share a board; Deaf Guess may appear with either one.

### 2. Match start and synchronization

- Start the match timer after the fixed 10-second countdown.
- Broadcast versioned match snapshots and revisions.
- Restore a live match after a short reconnect without trusting browser state.
- Reset series challenges when a player changes skribbl lobby.

### 3. Telemetry and claim authority

- Batch normalized telemetry from each browser over Contract v1.
- Validate challenge claim candidates on the Gateway.
- Broadcast accepted and rejected claim resolutions with monotonic revisions.
- Keep skribbl.io and local telemetry running after a Duel finishes while
  suppressing further Duel claims and board changes.

### 4. Persistence and competition

- Persist matches, participants, boards, claims and final results in Supabase.
- Add Ranked rating updates and match history only after result validation is
  replay-tested.
- Implement two-complete-game series behavior such as Back to back without
  weakening lobby-change resets.

### 5. Product completion

- Private Duel chat with server-side delivery and moderation boundaries.
- Reconnect/error UX, observability and abuse limits.
- Closed two-player tests, then Casual beta, then Ranked beta.

The immediate next milestone is phase 1: the server-authoritative 15-second
draft using the already selected random starting player.
