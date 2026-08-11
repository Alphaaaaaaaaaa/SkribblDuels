# Gateway Contracts

Versioned Socket.IO messages between the Skribbl Duels userscript and the authoritative match server.

The Supabase access token is sent only through the Socket.IO handshake `auth` payload. Once middleware has verified that token, the client sends a token-free `HELLO` through the shared `gateway:message` event. The server responds with `WELCOME` after loading the authenticated database profile.

Matchmaking uses the same event for homepage-only queue requests, authoritative queue status, ready changes and revisioned match snapshots/events. A new matchmaking request supersedes the account's older queue or match. `DRAFT_PICK` carries the client's last observed revision; every accepted or automatic pick produces a new authoritative snapshot containing the turn, deadline, pick history, remaining compatible IDs and completed board.

Contract v6 retains private Duel chat, telemetry ACKs and authoritative Claims,
and adds action-ID-based `MATCH_FORFEIT`, `DRAW_PROPOSE`, `DRAW_RESPOND` and
`DRAW_WITHDRAW`. Snapshots carry either one active Draw proposal or one immutable
win/Draw conclusion. The browser can request an action but cannot award a field
or result.
