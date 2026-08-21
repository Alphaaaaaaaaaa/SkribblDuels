# Gateway Deployment v0.37.1

The Contract v1 Gateway is deployed at:

```text
https://skribblduels-production.up.railway.app
```

`GET /healthz` must return:

```json
{"status":"ok","service":"skribbl-duels-gateway","contractVersion":1}
```

The URL is public browser configuration and is the telemetry-inspector build default. A build may override it with `VITE_GATEWAY_URL`.

The deployment confirmation proves that Railway can install, build, start, expose, and health-check the Gateway. The authenticated browser milestone additionally requires a signed-in userscript to receive `WELCOME` with the server-authoritative profile identity.

## Live verification

The authenticated browser path was confirmed on 2026-08-04. The deployed
Gateway returned `WELCOME` for the signed-in Supabase/Discord profile and the
userscript displayed the server-authoritative identity. Queue membership and
the 30-second ready check are therefore unblocked as the next milestone.
