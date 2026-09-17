# Skribble keyboard and Slots visual polish — v0.66.1

v0.66.1 is a UI and test-account patch on top of Gateway Contract v13. Daily
answers, guess acceptance, Slots outcomes and every Coin mutation remain owned
by the Gateway and database ledger.

## Skribble keyboard

- English, German, Czech, Finnish, French, Hungarian, Italian, Portuguese,
  Polish, Serbian and Spanish start with their familiar regional keyboard
  order. Korean uses an on-screen 2-Beolsik-style Jamo layout with client-side
  Hangul syllable composition.
- The client loads the same public official word list already used for word
  coverage and adds every missing character to supplementary rows. Whitespace
  is represented by the dedicated Space control; punctuation such as dots,
  apostrophes and hyphens remains directly typeable.
- Key feedback is derived only from accepted attempts. Correct outranks
  semicorrect, which outranks incorrect, so later rerenders cannot weaken a
  known key state. Physical typing and the hidden native input remain available.
- Loading a list changes only the keyboard. It does not receive the Daily
  answer and it cannot accept a guess; those decisions remain Gateway calls.

## Mini-game presentation

- Pending Skribble and Slots calls now place the loading surface at fixed
  viewport scope with the highest product z-index. The active board or machine
  remains untouched and the existing five-second failure path still restores
  interaction with a visible error.
- Backdrop blur is removed. Mini-game title art, Help art and the shared Coin
  icon receive the standard Skribbl drop shadow.
- The Slots launcher uses its supplied 200×100 GIF size. The modal title is
  visually doubled without increasing header height and sits above the bulbs.
- Reel icons fill the doubled payline box; extra reel/content padding keeps the
  one-second 1.2× effect emphasis visible. Pen is normalized to a square cell in
  the transparent weight table.
- Bulb images are no longer assigned their current `src` on every chase tick.
  Off bulbs can therefore run both frames of their GIF while the short on-state
  continues to follow the existing back-and-forth chase.

## Owner test grant

Migration `202609170002_grant_analphabetism_slot_test_coins.sql` calls the
existing `apply_skribbl_coin_transaction` RPC with a fixed account and
idempotency key. It appends +99,999 Coins to the requested test account. A
second application returns the original transaction and does not credit again.
No direct balance update or general owner permission is introduced.

## Deployment order

1. Keep both v0.65.0 and v0.66.0 migrations applied and Contract v13 healthy.
2. Apply `202609170002_grant_analphabetism_slot_test_coins.sql` once.
3. Confirm the account balance/revision advances by one ledger transaction.
4. Distribute the v0.66.1 userscript. A Gateway redeploy is not required for
   this patch; if the complete release bundle is redeployed, keep the normal
   migration → Gateway → userscript order.

No new Railway variable is required.
