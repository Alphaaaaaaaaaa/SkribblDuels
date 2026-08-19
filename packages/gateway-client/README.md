# Gateway Client

Socket.IO transport for the browser userscript. It places the current Supabase access token in the connection handshake, sends a token-free Contract v8 `HELLO`, validates server messages and exposes authenticated queue, invite and match state to the Duel UI. It also owns bounded private-chat history, telemetry batching/ACK flow and deferred Claim submission until the evidence sequence is server-confirmed.

The client exposes validated queue and match snapshots plus `joinMatchmaking`, `leaveMatchmaking`, `setReady` and revision-checked `pickDraftChallenge`. Page eligibility remains a product-UI decision; the client emits the required `page: 'home'` declaration.

The latest match ID and server revision are retained in session storage. Socket
reconnects and page/runtime reloads submit them as a resume cursor. The client
keeps its current board while transport reconnects, accepts only the Gateway's
explicit resume confirmation and then replaces local state with the republished
authoritative snapshot.

Unacknowledged telemetry batches and unresolved Claim candidates are also
retained in session storage. A `/credits` navigation or runtime reload replays
them against the exact resumed match and removes them only after the Gateway's
ACK/Claim resolution.

`forfeitMatch`, `proposeDraw`, `respondToDraw`, `withdrawDraw` and `requestRematch` generate
unique action IDs so safe retries are idempotent. Draw proposal state is always
rendered from the Gateway snapshot rather than inferred locally.

An empty `VITE_GATEWAY_URL` keeps the transport disabled without producing background connection failures. Set the public HTTPS Gateway URL during the userscript build after the server has been deployed.
