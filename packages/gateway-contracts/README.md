# Gateway Contracts

Versioned Socket.IO messages between the Skribbl Duels userscript and the authoritative match server.

The Supabase access token is sent only through the Socket.IO handshake `auth` payload. Once middleware has verified that token, the client sends a token-free `HELLO` through the shared `gateway:message` event. The server responds with `WELCOME` after loading the authenticated database profile.

Matchmaking uses the same event for homepage-only queue requests, authoritative queue status, ready changes and revisioned match snapshots/events. A new matchmaking request supersedes the account's older queue or match. `DRAFT_PICK` carries the client's last observed revision; every accepted or automatic pick produces a new authoritative snapshot containing the turn, deadline, pick history, remaining compatible IDs and completed board.

Contract v10 adds the originating `clientMessageId` to confirmed Duel Chat
messages so optimistic local messages can be reconciled without duplicates. A
terminal snapshot also exposes `departedAccountIds`, allowing stale Rematch
requests to disappear as soon as either participant leaves the result.

Contract v9 retained private Duel chat, telemetry ACKs, authoritative Claims,
Forfeit, Draw, idempotent Rematch and the v8 invite messages. It adds the
terminal `player-disconnect` conclusion reason: after a running Match exceeds
the reconnect grace period, the still-connected opponent receives an
authoritative win instead of a cancelled Match.

Contract v8 added `INVITE_CREATE`, `INVITE_ACCEPT`,
`INVITE_CANCEL` and `INVITE_STATUS` for expiring, single-use Friendly links.
Finished snapshots publish both participants' Rematch readiness; once both
agree, the Gateway creates a fresh match and ready check. The browser can
request an action but cannot award a field, result, invite consumption or
Rematch transition.
