import * as assert from 'node:assert/strict';
import {
  DUEL_NAME_COLORS,
  duelClaimColorBackground,
  duelNameColorAtlasPosition,
  normalizeDuelNameColorIndex,
  splitNameGraphemes
} from '../apps/telemetry-inspector/src/nameColors';

assert.equal(DUEL_NAME_COLORS.length, 28);
assert.deepEqual(DUEL_NAME_COLORS[15]?.colors, ['#ed2b34', '#aa1f00']);
assert.deepEqual(DUEL_NAME_COLORS[26]?.colors, ['#ffffff']);
assert.deepEqual(DUEL_NAME_COLORS[27]?.colors, ['#ffffff', '#e8e8e8']);
assert.equal(duelNameColorAtlasPosition(26), '-600% -200%');
assert.equal(normalizeDuelNameColorIndex(99), 26);
assert.match(duelClaimColorBackground(15), /repeating-linear-gradient/);
assert.deepEqual(splitNameGraphemes('A😀B'), ['A', '😀', 'B']);

console.log('Duel name-color palette test passed.');
