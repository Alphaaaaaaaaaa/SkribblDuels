import * as assert from 'node:assert/strict';
import {
  DUEL_NAME_COLORS,
  duelClaimColorBackground,
  duelClaimUsesDarkText,
  duelNameColorAtlasPosition,
  normalizeDuelNameColorIndex,
  resolveLocalOpponentColorIndex,
  splitNameGraphemes
} from '../apps/telemetry-inspector/src/nameColors';

assert.equal(DUEL_NAME_COLORS.length, 28);
assert.deepEqual(DUEL_NAME_COLORS[15]?.colors, ['#ed2b34', '#aa1f00']);
assert.deepEqual(DUEL_NAME_COLORS[26]?.colors, ['#ffffff']);
assert.deepEqual(DUEL_NAME_COLORS[27]?.colors, ['#ffffff', '#e8e8e8']);
assert.equal(duelNameColorAtlasPosition(26), '-600% -200%');
assert.equal(normalizeDuelNameColorIndex(99), 26);
assert.match(duelClaimColorBackground(15), /repeating-linear-gradient/);
assert.equal(resolveLocalOpponentColorIndex(4, 4), 6);
assert.equal(resolveLocalOpponentColorIndex(26, 26), 0);
assert.equal(resolveLocalOpponentColorIndex(26, 27), 1, 'White variants share one collision class.');
assert.equal(resolveLocalOpponentColorIndex(27, 26), 0, 'The opponent always shifts from its own stored index.');
assert.equal(resolveLocalOpponentColorIndex(4, 5), 5);
assert.equal(duelClaimColorBackground(26), '#ffffff', 'White hover must be able to restore pure white.');
assert.equal(duelClaimUsesDarkText(26), true);
assert.equal(duelClaimUsesDarkText(27), true);
assert.equal(duelClaimUsesDarkText(25), false);
assert.deepEqual(splitNameGraphemes('A😀B'), ['A', '😀', 'B']);

console.log('Duel name-color palette test passed.');
