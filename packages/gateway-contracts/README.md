# Gateway Contracts

Versioned Socket.IO messages between the Skribbl Duels userscript and the authoritative match server.

The Supabase access token is sent only through the Socket.IO handshake `auth` payload. Once middleware has verified that token, the client sends a token-free `HELLO` through the shared `gateway:message` event. The server responds with `WELCOME` after loading the authenticated database profile.

Matchmaking uses the same event for homepage-only queue requests, authoritative queue status, ready changes and revisioned match snapshots/events. A new matchmaking request supersedes the account's older queue or match. `DRAFT_PICK` carries the client's last observed revision; every accepted or automatic pick produces a new authoritative snapshot containing the turn, deadline, pick history, remaining compatible IDs and completed board.

Contract v17 adds `SOCIAL_PROFILE_STATS_SET`, `FRIEND_PROFILE_GET`,
`FRIEND_CHAT_HISTORY_GET` and `FRIEND_CHAT_READ`. New server frames expose
privacy-filtered profile cards, paginated 24-hour friend history and unread
inbox counts. Chat events contain stored message IDs and monotonic sequences
for optimistic reconciliation. Lobby IDs may be null when a visible game is
observed before metadata; joining still requires a known public ID. The Social
readiness probe now requires v17. Pinned stat strings are display data only;
clients cannot award ratings or Challenge results through this channel.

Contract v16 repairs the row-locked Friend-response boundary, adds a
privacy-safe `FRIEND_UNBLOCK` command and requires every search result to state
whether its authenticated viewer owns the directional block. The Gateway's
Social readiness probe must report the same contract before serving clients.

Contract v15 added durable Friends requests/relationships/pins, Social privacy
and presence, exact Discord-username search, live-only Quick Messages and
friend Match invitations. `SOCIAL_SNAPSHOT` contains only data already filtered
for its authenticated viewer; clients never receive a hidden status or lobby
and cannot choose another account's visible presence.

Contract v14 raises authoritative Slots reward bounds for rules v2. Effect
replacement pools and final reward calculation remain Gateway-only; browser
messages cannot select their outcome.

Contract v13 added authenticated Skribbl Slots open/spin actions, ordered effect
steps, final payline outcomes, Free Spins and Heart progress. It also discloses
the Skribble answer only after a solved/lost terminal state and removes the old
celebration-replay sink. The browser can request an action but cannot choose
reels, effects, answers, rewards or its Coin balance.

Contract v12 introduced authenticated Daily Skribble open/guess actions,
answer-private playing state/results and authoritative Coin balance/transaction
updates.

Contract v11 adds the server-validated 0–27 Duel name/Claim color index to the
authenticated identity and every match participant. Clients receive only a
palette index and cannot inject CSS or markup.

Contract v10 added the originating `clientMessageId` to confirmed Duel Chat
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
