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

After applying a migration, run the matching verification script before changing the userscript or starting the Gateway.

The `public.profiles` table deliberately contains no email address, access token, refresh token, rating, match result, or moderation state. Browser clients can read profiles after authentication but cannot write profile identity fields.
