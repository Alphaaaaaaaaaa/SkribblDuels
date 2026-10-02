# Skribbl Duels v0.72.0 — upgrade

From v0.71.0, deploy **Gateway 0.14.0 / wire Contract 19**, then install the
v0.72.0 userscript and reload Skribbl once. Client and Gateway must use the same
wire contract. There is **no new Supabase migration** and no new Railway setting.
The Social database still uses the v0.71.0 schema/readiness revision 18.

If starting from an older release, apply all included earlier migrations in
filename order, including `202610010002_add_friend_chat_history.sql` and
`202610010003_social_lobby_join_permissions.sql`, before upgrading the Gateway.

The default **General → Telemetry port → Auto · Duels + Typo compatible** uses
the independent game port. Typo may stay enabled. **Duels port** and **Typo port
(legacy)** are available for diagnosis; switching while playing applies to the
next lobby or a reload. The status beside the selector shows the active source.
Without Typo, its feature-dependent Challenges are removed from shared drafts.

Lobby permission **Always** means friends may join public and private lobbies.
Existing Public/Private/None preferences are preserved, with Private relabeled
Always. Native friend joining uses the normal Skribbl invite URL when Typo is
absent; the Gateway still controls whether that URL is disclosed.

Match chat now includes the same emoji picker as Quick Messages. Use **Ctrl+E**
while its input is focused; **Shift-click** keeps the picker open. The score
emojis are **:closed:** and **:open:**, and old chat tokens still render.

The ZIP includes full source, built userscript/Gateway, the compact roadmap,
gamePatch review and offline probe results. `review-supplied-gamepatch.cjs`
accepts only the exact reviewed attachment hash and runs against local stubs.
The supplied third-party game source is not bundled or injected by Duels.

For a source install, use `npm ci`, `npm run typecheck`, `npm test` and
`npm run build`. The ASCII-safe installable script is
`userscript/skribbl-duels-telemetry-inspector.user.js`; the raw client build is
under `dist/telemetry-inspector` and the Gateway build is under `dist/gateway`.

Keep a v0.71.0 client and Gateway pair for rollback. Since there is no schema
change, rollback does not require undoing a migration. Active matches should
finish or be deliberately ended before switching Gateway wire contracts.
