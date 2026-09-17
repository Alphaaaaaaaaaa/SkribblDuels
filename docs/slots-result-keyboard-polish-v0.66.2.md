# Slots result and Skribble keyboard polish — v0.66.2

v0.66.2 is a client-only presentation patch on top of Gateway Contract v13.
The Gateway still commits every spin, Heart, Free Spin and Coin mutation before
the client receives an outcome; this release changes only when confirmed values
become visible and how their animation is presented.

## Slots result presentation

- The UI stores the newest authoritative machine state separately from the
  state currently presented in the modal. The previous Heart and Free-Spin
  display remains visible throughout reel and ordered effect animation.
- Once the final effect resolves, the UI atomically presents the confirmed
  state, final icons and result copy. The win color is guarded by the same
  animation boundary, so “Spinning…” always stays neutral.
- A winning bulb sequence now alternates for eighteen 85 ms steps. The normal
  back-and-forth chase resumes afterward without repeatedly resetting each
  bulb GIF's own frames.

## Shared Coin collection

Slots reserves the post-cost/pre-reward balance before Skribble's shared Coin
display consumes the same Gateway snapshot. After the final reel state is
visible, the existing loot-and-collect particle animation starts at the reel
bank and increments the display once per awarded Coin. The animation owner and
final balance make rerenders, duplicate snapshots and modal closure idempotent
at presentation level; the database ledger remains the source of truth.

## Keyboard and language selection

- `backspace.gif`, `spacebar.gif` and `enter.gif` are embedded from
  `res/skribble-icons/` and retain their native 3:2, 5:1 and 3:2 proportions.
  Space selects the supplied empty, incorrect, semicorrect or correct artwork
  from its strongest accepted-attempt feedback.
- If any official word contains an ASCII digit, the keyboard prepends a full
  1–9 row. Zero is appended when the list actually uses it. Digits are excluded
  from dynamically ranked punctuation rows.
- The client polls the same `localStorage.lang` value used by Skribbl. A changed
  language opens the corresponding Daily through the Gateway; an active
  Practice round is deliberately not replaced.

## Deployment

No database migration, secret or Railway variable is added. Build and
distribute the v0.66.2 userscript. A Gateway redeploy is optional because the
wire contract and persistence rules remain v13-compatible.
