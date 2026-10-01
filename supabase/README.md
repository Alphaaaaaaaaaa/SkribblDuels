# Supabase database files

Apply migrations in filename order. For the current hosted development project, paste the complete migration into the Supabase SQL Editor and run it once.

After v0.44.0, apply `202608050002_enforce_ascii_duel_names.sql`. It limits
Duel display names to 3–24 ASCII alphanumeric characters and replaces an older
incompatible name with a deterministic account-specific fallback.

For v0.48.0, apply
`202608110001_add_invisible_avatar_entitlements.sql` before deploying the new
Gateway. The table grants only owner-readable entitlement rows; profile writes
with avatar components below `-1` remain blocked by the server-side RPC unless
the authenticated profile owns a grant. Use the admin template with the exact
new profile UUID rather than copying an older account ID.

For v0.51.0, apply
`202608190001_create_durable_match_authority.sql` before deploying the Gateway.
It creates Gateway-private Match snapshots, an idempotency ledger, append-only
revision history and two service-role-only RPCs. Configure the resulting
Gateway deployment with `SUPABASE_SERVICE_ROLE_KEY`; never expose that key to
the browser/userscript.

For v0.52.0, apply `202608200001_create_duel_invites.sql` after the durable
Match authority migration and before deploying Contract v8. It adds the
Gateway-private invite table plus service-role-only create/accept/cancel RPCs.
The table stores only the SHA-256 token hash; the copyable token exists only in
the creator's live client response.

For v0.54.0, apply `202608210001_create_gateway_abuse_controls.sql` after the
Invite migration and before the multi-instance Gateway. It adds private abuse
signals, scoped operator sanctions and the service-role-only operational purge
function. Run `select * from public.purge_duel_operational_data();` daily from a
trusted job to enforce 30-day Match/Invite/evidence retention and 90-day abuse-
signal retention.

For v0.57.0, apply `202608280001_add_duel_name_colors.sql` after the abuse-
control migration and before deploying Contract v11. It adds the constrained
0–27 `profiles.name_color_index`, replaces the profile-update RPC with its
six-argument version and keeps arbitrary CSS or markup out of profile data.

For v0.65.0, apply `202609160001_create_skribbl_coin_ledger.sql` after the
profile-color migration and before deploying Contract v12. It adds the
Gateway-private append-only Coin ledger, row-locked idempotent mutation RPC,
Daily Skribble words and per-language Daily runs. Also configure the Gateway's
server-only `SKRIBBLE_DAILY_SECRET`; `/readyz` reports progression unhealthy if
the migration is missing.

For v0.66.0, apply
`202609170001_add_skribbl_slots_and_harden_functions.sql` after the Coin/Daily
migration and before deploying Contract v13. It adds private persistent Slots
state, an append-only spin audit and one service-role-only atomic spin RPC. It
also fixes the mutable Coin-trigger search path and changes the authenticated
profile RPC from `SECURITY DEFINER` to `SECURITY INVOKER`, with own-row RLS and
the existing entitlement boundary enforced by a validating trigger.

For v0.66.1, apply
`202609170002_grant_analphabetism_slot_test_coins.sql` after the Slots migration.
It adds exactly one idempotent +99,999 ledger transaction to the supplied owner
account for Slots testing. The deterministic idempotency key prevents duplicate
credit on a rerun; the migration neither updates the balance directly nor adds
an account-wide owner bypass.

For v0.67.0, apply
`202609210001_upgrade_skribbl_slots_rules_v2.sql` after the v0.66 Slots and
testing-grant migrations and before deploying Contract v14. It expands the
audited reward bound to 100 Coins and replaces the atomic spin RPC with a
validator that accepts historical rules-v1 retries and enforces the new
rules-v2 payout table. Existing append-only spin and ledger rows are unchanged.

For v0.68.0, apply
`202609220001_harden_discord_profile_sync.sql` after the Slots-rules-v2
migration. It keeps symbol-bearing Discord usernames intact, derives a separate
ASCII-safe Duel display name, prevents stale provider/profile collisions from
aborting OAuth and repairs historical Auth users without a profile row. It does
not copy Discord email data into `public.profiles`.

For v0.69.0, apply `202609300001_add_social_graph.sql` after the profile-sync
migration and before deploying Contract v15. It adds service-role-only Social
preferences, requests, canonical friendships, pins and directional blocks. The
row-locked response RPC makes acceptance/blocking atomic and executable only by
`service_role`; all Social tables have RLS enabled with browser roles revoked.
`/readyz` reports Social persistence unhealthy while the migration is missing.

After applying a migration, run the matching verification script before changing the userscript or starting the Gateway.

The `public.profiles` table deliberately contains no email address, access token, refresh token, rating, match result, or moderation state. Browser clients can read profiles after authentication but cannot write profile identity fields.
