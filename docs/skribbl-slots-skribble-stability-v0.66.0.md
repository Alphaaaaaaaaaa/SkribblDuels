# Skribbl Slots and Skribble stability — v0.66.0

v0.66.0 extends the authoritative progression pilot without allowing the
browser to choose an outcome or mutate currency.

## Authority and idempotency

- Each spin has a client request ID and server spin ID. The unique
  `(account_id, request_id)` constraint returns the original result on retry.
- The service-role-only `apply_skribbl_slot_spin` RPC row-locks both the Coin
  and Slots accounts. Coin cost/reward, Free Spins, Heart progress and the
  append-only spin audit commit in one database transaction.
- A Free Spin is consumed before a Coin. Otherwise a spin costs exactly one
  Coin. Insufficient balance fails before any state mutation.
- The Gateway samples three independent base reels, applies Fill, Wizard,
  Eraser, Trash and Dice in that order and evaluates only the final single
  payline. The client receives replayable effect steps solely for presentation.

## Current economy

Three Books award five Free Spins; three Slimys award ten. Three matching
reward icons pay the amounts defined in Gateway Contract v13. Hearts persist
across spins and each set of three awards one Free Spin. Skull and Poop pay
nothing. Coins cannot be purchased, have no cash value and never affect Duel
competition.

The disclosed integer base weights total 126 per reel. A deterministic
120,000-spin regression values one Coin and one Free Spin equally and measures
about 9.1% combined return. This intentionally makes the first Arcade machine
a bounded sink. Change weights or payouts only with a rules-version bump and a
new simulation report.

## Skribble changes

- Playing state never contains the answer; solved/lost state contains it for
  the final-word message.
- Valid guesses are matched case-insensitively and returned using exact official
  word-list casing.
- Daily rewards are `26 - attempts`, bounded to 16–25 Coins for attempts
  10–1. Only the first account Daily solve per UTC date can create a ledger
  reward; Practice remains unrewarded.
- UI state is retained across transient disconnected snapshots. Gateway-backed
  actions show the Skribbl loading surface and fail visibly after five seconds
  without replacing the board.

## Supabase hardening

Migration `202609170001_add_skribbl_slots_and_harden_functions.sql` also:

- pins the Coin append-only trigger helper to an empty `search_path`;
- changes `update_skribbl_duels_profile` to `SECURITY INVOKER`;
- grants only own-row, named-column profile updates through RLS; and
- enforces validation and avatar entitlements in a `BEFORE UPDATE` trigger.

## Deployment order

1. Keep the v0.65 Coin/Daily migration and `SKRIBBLE_DAILY_SECRET` in place.
2. Apply `202609170001_add_skribbl_slots_and_harden_functions.sql`.
3. Confirm Supabase's two reported lints no longer appear.
4. Deploy the v0.66 Gateway and confirm `/readyz`.
5. Verify one paid spin, one duplicate request replay and one insufficient-Coin
   rejection in staging.
6. Distribute the v0.66 userscript only after Contract v13 is live.

No new Railway variable is required.
