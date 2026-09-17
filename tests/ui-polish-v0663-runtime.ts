import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateSkribbleTileSize } from '../apps/telemetry-inspector/src/skribbleUi';

const [skribble, product] = await Promise.all([
  readFile('apps/telemetry-inspector/src/skribbleUi.ts', 'utf8'),
  readFile('apps/telemetry-inspector/src/duelProductUi.ts', 'utf8')
]);

const wideTileSize = calculateSkribbleTileSize(930, 32);
assert.ok(wideTileSize < 32, 'A 32-character row must shrink below the native tile size.');
assert.ok(
  wideTileSize * 32 + 31 * 2 <= 920,
  'A 32-character row must retain the ten-pixel inline safety margin.'
);
assert.equal(calculateSkribbleTileSize(2_000, 32), 32);

assert.match(skribble, /const measuredWidth = boardToFit\.element\.clientWidth;/);
assert.ok(
  skribble.indexOf('overlay.appendChild(shell);') < skribble.indexOf('const measuredWidth = boardToFit.element.clientWidth;'),
  'Board width must be measured only after the modal enters the document.'
);
assert.match(skribble, /\.scd-skribble-board \{ width:100%;min-width:0;max-width:100%;/);
assert.match(skribble, /\.scd-skribble-row \{[^\n]*min-width:0;max-width:100%;/);

assert.match(product, /\.scd-icon-image \{[^\n]*filter:drop-shadow\(3px 3px 0 rgba\(0,0,0,\.25\)\);/);
assert.match(skribble, /\.scd-skribble-secondary\.scd-skribble-return,[^\n]*\{ background:transparent; \}/);
assert.match(skribble, /\.scd-skribble-return \{[^\n]*filter:drop-shadow\(3px 3px 0 rgba\(0,0,0,\.25\)\);/);
assert.match(skribble, /const SKRIBBLE_COIN_PARTICLE_SIZE = 24;/);
assert.match(skribble, /\.scd-skribble-coin-particle \{[^\n]*width:24px;height:24px;/);
assert.match(skribble, /SKRIBBLE_COIN_PARTICLE_SIZE \/ 2/);

console.log('v0.66.3 icon shadows, transparent Daily return, Coin sizing and 32-character board fit passed.');
