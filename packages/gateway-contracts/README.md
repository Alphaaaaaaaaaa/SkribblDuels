# Gateway Contracts

Versioned Socket.IO messages between the Skribbl Duels userscript and the authoritative match server.

The Supabase access token is sent only through the Socket.IO handshake `auth` payload. Once middleware has verified that token, the client sends a token-free `HELLO` through the shared `gateway:message` event. The server responds with `WELCOME` after loading the authenticated database profile.

Later phases use the same event for matchmaking, draft, claim, telemetry and Duel-chat messages. The server remains authoritative for identity, queue state, match snapshots/events, claim resolutions and chat delivery.
