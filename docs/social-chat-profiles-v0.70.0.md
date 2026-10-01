# Social chat, profiles and playing presence — v0.70.0

This release requires Gateway v0.12.0 and Gateway Contract v17. It retains the
v0.69.1 friend-response fix and all 53 Challenges and Duel timing rules.

## Upgrade from v0.69.1

1. Apply `supabase/migrations/202610010002_add_friend_chat_history.sql` in the
   Supabase SQL Editor. The existing Social graph and friend-response hotfix
   must already be installed. The migration is additive and may be reapplied.
2. Deploy the included Gateway source or `dist/gateway` build, with the existing
   server environment. No new Railway variable or browser secret is needed.
3. Wait for `/readyz` to report `socialHealthy: true`. The Gateway requires
   `gateway_social_contract_version()` to return `17`.
4. Install `Skribbl-Duels-v0.70.0.user.js` and refresh Skribbl on both clients.

Contract v16 clients cannot connect to a Contract v17 Gateway. Keep the Gateway
and userscript upgrade interval short. The additive migration can remain in
place during rollback, but a v0.69.1 Gateway expects the probe to return 16;
restore the probe definition from the v0.69.1 hotfix if rolling back the Gateway.

## Messaging and retention

The Gateway stores a message before acknowledging it. Sends are authorized
against the current friendship and both block directions, then serialized for
capacity checks. `(sender_id, client_message_id)` is unique: retrying the same
message returns its existing record; reusing its ID with a different body or
recipient fails. The browser inserts a pending row immediately and reconciles
it by that ID when confirmed. Rejected sends and interrupted connections show
Retry. Incoming events update the open history without replacing the form,
losing focus, or clearing the draft. A reconnect fetches the latest page again.

`duel_friend_messages` stores server timestamps, monotonic sequences and read
markers. It is inaccessible to browser roles; only the authenticated service-
role Gateway calls the RPCs. History reads expose only the latest 24 hours for
current, unblocked friends. Each indexed page contains up to 200 messages, with
an older-page cursor. Offline recipients receive the unread ping after their
next connection; opening the conversation marks displayed incoming sequences
read. Both users can send to an offline friend.

Expired rows are removed on connection, before writes and every five minutes
while the Gateway is running. When Supabase Cron (`pg_cron`) is already enabled,
the migration also schedules `skribbl-duels-friend-chat-cleanup` every five
minutes and prunes only that job's run records after seven days. If Cron is
enabled later, reapply this migration to register the job. The read-time cutoff
always applies, even if the Gateway and cleanup job are stopped.

Browser-local history is optional best-effort storage of the latest 1,000
cached messages per account; older messages may remain there after server
expiry. It is stored in the participating browser's local storage. Unsent drafts
remain in memory, and account changes clear them. This is ordinary private
friend chat; message bodies are not end-to-end encrypted.

## Database capacity

The live project's remaining quota was not inspected. Instead, the write RPC
checks total database size and retained-message count in the same transaction.
It rejects new messages at **450 MiB total database size** or **20,000 retained
messages**, reserving headroom below the standard 500 MB Free-plan allowance.
Other Duels features continue; the sender sees a recoverable storage error.
Accepted retries still succeed when capacity is full. This limit is deliberately
conservative and applies even if the deployment uses a larger database plan.

A local PostgreSQL test with 20,000 maximum-length four-byte Unicode messages,
three indexes and unique constraints used approximately 32 MiB for the chat
table and indexes. Actual database size also includes profiles, Duel history,
other tables, indexes and PostgreSQL overhead. Retention removes rows; vacuum
and database-size behavior still matter for a long-running deployment.

Inspect the deployed project in SQL Editor before release:

```sql
select public.gateway_social_contract_version() as social_contract;
select pg_database_size(current_database()) as database_bytes;
select count(*) as retained_messages,
       pg_total_relation_size('public.duel_friend_messages') as chat_table_bytes
from public.duel_friend_messages;
select extname from pg_extension where extname = 'pg_cron';
```

If Cron is enabled, inspect `cron.job` for the named cleanup job. The Gateway
logs cleanup failures as `social-chat-cleanup-error`. The migration's
storage thresholds are fixed constants; any later capacity change should be a
separate reviewed migration.

## Profile cards and custom emojis

Other users' avatars in Friends, Quick Messages, notifications and Duels open a
profile card with the chosen Versus avatar, presence badge, Duels name, status
icon/text, two pinned statistics and the Friends/Add action. The newly supplied
`res/friend-system/friend-add.gif` is embedded. Profile and lobby privacy are
filtered on the server. Blocked profiles do not expose pinned values.

The first two configured local profile statistics are shared as display strings
(maximum 64 characters each, known statistic IDs only). They are last reported
values, refreshed when the owner is connected; they do not grant or validate
ratings, wins or Challenge rewards. Elo/Ranking remains a later feature.

Slimy, immediately left of Send, opens 104 emojis from the requested groups:
Challenge icons except One Line; Block/Friends/Ping; Skribble result/Coin icons;
Slots Seven/Eraser/Heart; and the requested subset of statistic icons. Tokens
are plain stored text such as `:slot/heart:`. Only allowlisted tokens become
embedded images. All other text, including HTML-looking content, remains plain
text. The picker respects the message limit and current insertion point.

## Playing presence and friends controls

An unset public-lobby maximum was previously coerced to one. Reports with more
than one player then failed Contract validation, leaving the default Homepage
activity visible. The adapter now uses a valid capacity of at least the observed
player count (default eight), recognizes a visible game even before hydration,
and separates playing activity from availability. A missed lobby ID still shows
playing; joining becomes available only once a real public ID is known. Leaving
the visible game clears playing even when old telemetry metadata remains.
Rejected reports are retried instead of being cached as successful.

The floating list offers Always/Homepage/Never. Existing hidden-list settings
migrate to Never; existing enabled/default settings migrate to Homepage. Both
server and browser sort Pin, Active Duel, Online, Idle, then Offline, with stable
name/account tie-breaks. Pins sit at the upper right over the card edge, use
0.6/1 opacity and transitions, and reorder optimistically with error rollback.
General/Social selected tabs use #53e237 and hover #38c41c. Social action toasts
use the existing 3.5-second expiry and 150 ms closing transition.

## Verification

Run the release gate with Node 24:

```text
npm ci
npm run typecheck
npm test
npm run build
```

`npm run test:v070` executes the migration and persistence adapter in local
PostgreSQL (PGlite), including permissions, friendship checks, offline inbox,
read markers, deduplication, pagination, retention and the 20,000-message cap.
DOM tests cover live and optimistic messages, drafts, retries, offline pings,
profile cards, participant-avatar clicks, emoji insertion/text safety, pin
sorting/rollback, list modes, toast timers and rejected-presence retry. Contract
tests cover malformed frames and partial lobby metadata. The complete existing
suite remains required. These local checks do not replace a two-account smoke
test against the deployed Supabase/Railway environment.
