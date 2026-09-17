# Final UI polish — v0.66.3

v0.66.3 is a client-only presentation patch on top of Gateway Contract v13.

## Changes

- Embedded `.scd-icon-image` artwork now receives the standard Skribbl
  `3px 3px` drop shadow. This covers Profile artwork and the Hub Settings and
  About/Help controls without changing their hover behavior.
- Return to Daily keeps its existing action and tooltip, but its normal and
  hover backgrounds are transparent and the supplied icon receives the same
  drop shadow.
- The shared collection particle used by Daily Skribble and Skribbl Slots is
  24×24 px. Spawn coordinates use the same size constant, so particles remain
  centered over the reward source before travelling to the Coin display.
- Skribble derives tile size from the board's real `clientWidth` after the
  modal has entered the document. A ten-pixel safety margin plus explicit
  flex/grid shrinking keeps all 32 tiles, their gaps and shadows within the
  modal across themes, scrollbars and viewport sizes.

## Deployment

No database migration, secret or Railway variable changes. The Gateway remains
contract-compatible, so deploy the rebuilt userscript; redeploying the Gateway
is optional when keeping the release artifacts together.

## Verification

The v0.66.3 regression checks exercise the 32-character width calculation and
lock the icon shadow, transparent Return control and shared particle sizing.
The normal release gate remains `npm ci`, typecheck, the full test suite, both
builds, ZIP integrity and release round-trip verification.
