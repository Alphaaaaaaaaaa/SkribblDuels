# Gateway Client

Socket.IO transport for the browser userscript. It places the current Supabase access token in the connection handshake, sends a token-free Contract v1 `HELLO`, validates server messages, and exposes the authenticated `WELCOME` state to the Duel UI.

The client exposes validated queue and match snapshots plus `joinMatchmaking`, `leaveMatchmaking` and `setReady`. Page eligibility remains a product-UI decision; the client emits the required `page: 'home'` declaration.

An empty `VITE_GATEWAY_URL` keeps the transport disabled without producing background connection failures. Set the public HTTPS Gateway URL during the userscript build after the server has been deployed.
