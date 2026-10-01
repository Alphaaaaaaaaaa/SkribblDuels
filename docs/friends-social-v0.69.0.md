# Friends and Social presence — v0.69.0

v0.69.0 introduces the first durable Friends vertical slice. The browser may
request Social actions, but the Gateway owns relationship changes, visibility
filtering and Match-invite delivery. The release upgrades the wire boundary to
Gateway Contract v15.

## Shipped behavior

- Friendships, requests, ignored requests, directional blocks, per-owner pins,
  Social privacy and profile status are durable Supabase records. Direct browser
  table access is revoked; only the service-role Gateway mutates the graph.
- Friend lookup is an exact, case-insensitive Discord username match. A trailing
  legacy `#0` is optional. PostgreSQL `ILIKE` wildcard characters such as `_`
  and `%` are escaped, so a username such as `lboot__` is not treated as a
  pattern and symbols are not an account/login restriction.
- Incoming requests may be accepted, declined, ignored or blocked. Ignored
  requests stay visible, outgoing requests may be withdrawn, and acceptance is
  an atomic row-locked database operation that creates one canonical friendship.
- Presence supports Online, Idle and Offline. An active Duel replaces
  Online/Idle with Active Duel; manually selecting Offline hides both the Duel
  and lobby state from other accounts.
- Profile-status and lobby visibility are independently configurable as
  Everyone, Friends or Nobody. Joining is offered only for a visible public
  lobby when the owner also enabled lobby joining; the browser delegates the
  actual transition to Typo's `joinLobby` event.
- Quick Messages are deliberately live-only. The Gateway does not persist their
  content. Each participating browser stores its own bounded local history, and
  offline delivery fails explicitly instead of pretending that a message was
  queued.
- Friend Duel invitations reuse the existing durable, single-use Match invite
  authority. The Social event contains the live token only for the intended
  recipient; acceptance enters the normal Ready/Draft/Countdown pipeline.
- The homepage list is optional, corner-positionable, scroll-bounded to roughly
  five rows and sorted with pinned friends first. Action toasts expose avatars
  and direct request/message/invite actions.
- All twelve Profile overview statistic slots are selectable. The first two
  remain visually pinned and changing to an already-used statistic swaps slots,
  preserving a unique twelve-card overview.

## Privacy and authority boundaries

- `public.profiles` remains the identity source and still contains no email.
- The Gateway applies status/lobby privacy before serializing every profile.
  Hidden data is omitted rather than hidden only by CSS.
- Blocks are treated symmetrically for lookup/request authorization, while the
  durable block row records who initiated the block.
- Social messages share account-scoped abuse limits; Quick Messages also honor
  operator chat mutes.
- Manual status from v0.68 is uploaded once when a new revision-zero Social
  profile is first encountered, avoiding loss during the local-to-server move.

## Deployment

1. Apply `supabase/migrations/202609300001_add_social_graph.sql` after the
   v0.68 profile-sync migration.
2. Deploy Gateway v0.11.0 / Contract v15. `/readyz` reports Social persistence
   unhealthy when the migration is missing.
3. Distribute the v0.69.0 userscript only after the new Gateway is ready.

No new Railway variable is required. The existing server-only
`SUPABASE_SERVICE_ROLE_KEY` owns the Social tables. Contract v15 clients are not
wire-compatible with a Contract v14 Gateway; the additive database migration
may remain in place during a Gateway/userscript rollback.

## Deliberately deferred decisions

- Whether Last Seen should become durable across Gateway restarts. v0.69 only
  reports a process-lifetime timestamp and otherwise returns no timestamp.
- A block-management/unblock screen, friend-count/request pagination and
  configurable retention for local Quick Message history.
- Whether a future durable inbox should exist. It requires a separate privacy,
  moderation, deletion/export and encryption decision; v0.69 intentionally does
  not imply offline delivery.
- Rich presence, cross-device unread synchronization, group conversations and
  friend notes are outside this release.
- Public profile discovery remains exact username search. Fuzzy/global search
  is deferred to avoid unnecessary account enumeration.

## Verification

`npm run test:v069` covers the migration boundary, Contract v15 guards, request
acceptance, privacy filtering, manual Offline precedence, public-lobby joining
metadata, live Quick Messages and friend Match-invite events. The complete
release still requires `npm run typecheck`, `npm test` and `npm run build`.
