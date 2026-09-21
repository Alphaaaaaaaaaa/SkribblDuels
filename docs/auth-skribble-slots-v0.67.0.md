# Auth, Skribble and Slots rules v2 — v0.67.0

v0.67.0 upgrades the browser/Gateway boundary to Contract v14 and Slots rules
version 2. It also changes browser authentication initialization, so the
Gateway and userscript must be deployed together.

## Firefox Discord OAuth

The userscript creates and starts the shared Supabase Auth client before any
IndexedDB, local-stat or Challenge restoration. OAuth now uses PKCE, allowing
Supabase Auth to exchange the returned authorization code and restore the
persisted session before the Product UI subscribes. The UI receives the same
client instance and therefore cannot briefly replace the callback session with
a second initialization.

The explicit `identify` option was redundant and has been removed. Supabase's
hosted Discord provider owns its default Discord consent scopes and currently
requests the email scope in addition to identity. Removing that provider scope
would require a separately maintained Discord OAuth callback/token-exchange
service and a new trusted identity/session contract; it cannot be safely
changed from an unauthenticated userscript parameter.

## Skribble terminal presentation

- A loss shuffles all attempted character tiles with Fisher–Yates and drops two
  characters per 100 ms tick.
- After the final fall and “You lost!” entrance, attempted rows are removed and
  the modal's terminal content is allowed to contract.
- Terminal rounds render no keyboard. Starting Daily or Practice creates a new
  playing session and restores it.
- Native input replacement immediately remeasures the current widest row.
  Together with the content-box width and a ten-pixel safety margin, all 32
  Unicode code points remain on one line.

## Slots rules v2

The Gateway remains the only outcome generator. Dice and cascading effects may
select Book, Slimy, Heart or a Coin-paying icon. Fill and Wizard exclude Heart
and select only Book, Slimy or a Coin-paying icon. Wizard compares the two
other reels and transforms the lower reward; equal values are selected with
the Gateway RNG. Skull, Poop and unresolved effect icons are excluded from all
effect replacement pools.

| Match | Coin reward |
|---|---:|
| Skribbl Coin | 100 |
| Seven | 77 |
| Trophy / Crown | 50 |
| Pen / Skribbl Duels | 40 |
| Potion / Drop | 30 |
| Pizza / Pumpkin / Eggplant | 20 |
| Pineapple / Peach / Ribbon | 10 |

Book and Slimy retain five and ten Free Spins. Three accumulated Hearts retain
one Free Spin. The deterministic 120,000-spin test values each Coin and Free
Spin equally and measures about 0.527 returned units per base spin, below the
one-Coin entry cost.

## Persistence and rollout

Migration `202609210001_upgrade_skribbl_slots_rules_v2.sql` expands the audited
spin reward constraint to 100 and makes the service-role-only atomic commit RPC
validate both historical rules v1 retries and new rules v2 payouts. Existing
append-only rows are not changed.

Deployment order:

1. Apply the v0.67.0 Supabase migration.
2. Deploy the Contract v14 Gateway.
3. Install/distribute the v0.67.0 userscript.

Rollback must keep the v0.67 migration in place. It is backward-compatible
with recorded v1 payouts, so the database does not need a destructive rollback.
No new Railway environment variable is required.
