import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [skribble, slots, product, assets, pen, spaceCorrect, spaceIncorrect, spaceSemicorrect] = await Promise.all([
  readFile('apps/telemetry-inspector/src/skribbleUi.ts', 'utf8'),
  readFile('apps/telemetry-inspector/src/slotsUi.ts', 'utf8'),
  readFile('apps/telemetry-inspector/src/duelProductUi.ts', 'utf8'),
  readFile('res/progression-assets.template.json', 'utf8'),
  readFile('res/skribbl-slots/slot-icons/pen.gif'),
  readFile('res/skribble-icons/spacebar_correct.gif'),
  readFile('res/skribble-icons/spacebar_incorrect.gif'),
  readFile('res/skribble-icons/spacebar_semicorrect.gif')
]);

for (const [id, path] of [
  ['skribbleBackspace', 'res/skribble-icons/backspace.gif'],
  ['skribbleEnter', 'res/skribble-icons/enter.gif'],
  ['skribbleSpacebar', 'res/skribble-icons/spacebar.gif'],
  ['skribbleSpacebarCorrect', 'res/skribble-icons/spacebar_correct.gif'],
  ['skribbleSpacebarIncorrect', 'res/skribble-icons/spacebar_incorrect.gif'],
  ['skribbleSpacebarSemicorrect', 'res/skribble-icons/spacebar_semicorrect.gif']
] as const) {
  assert.match(assets, new RegExp(`"${id}": "${path.replaceAll('/', '\\/')}"`));
  assert.match(skribble, new RegExp(`'${id}'`));
}
assert.match(skribble, /const spaceMark = getSkribbleKeyboardMark\(state\.attempts, ' ', state\.languageId\)/);
assert.match(skribble, /spacebarAsset\[spaceMark\]/);
assert.match(skribble, /grid-template-columns:3fr 10fr 3fr/);
assert.match(skribble, /\.scd-skribble-key\.wide \{ aspect-ratio:3\/2; \}/);
assert.match(skribble, /\.scd-skribble-key\.extra-wide \{ aspect-ratio:5\/1; \}/);
assert.match(skribble, /private reconcileLanguageSelection\(\): void/);
assert.match(skribble, /this\.visibleState\?\.mode !== 'daily'/);
assert.match(skribble, /this\.requestRound\('daily'\)/);

assert.match(slots, /private presentedState: GatewaySlotsState \| null/);
assert.match(slots, /!this\.animating && this\.latestOutcome && isWin/);
assert.match(slots, /for \(let index = 0; index < 18; index \+= 1\)/);
assert.match(slots, /this\.presentedState = this\.visibleState \? structuredClone\(this\.visibleState\) : null;/);
assert.match(slots, /playCoinRewardAnimation\(rewardOwner, outcome\.coinReward, source\)/);
assert.match(slots, /\.scd-slots-title img[^\n]*transform:scale\(1\.8\)/);
assert.match(slots, /\.scd-slot-payline \{ width:59%;height:59%/);
assert.match(slots, /max-width:192px;max-height:192px;object-fit:contain/);
assert.doesNotMatch(slots, /object-fit:fill/);

assert.ok(
  product.indexOf('this.slotsUi.update(state);') < product.indexOf('this.skribbleUi.update(state);'),
  'Slots must reserve a pending reward before the shared Coin balance consumes the snapshot.'
);
assert.match(product, /reserveCoinRewardAnimation: \(owner, balanceBefore, balanceAfter\)/);

assert.equal(pen.subarray(0, 6).toString('ascii'), 'GIF89a');
assert.equal(pen.readUInt16LE(6), 42, 'The pen sprite must use a square logical canvas without stretching its pixels.');
assert.equal(pen.readUInt16LE(8), 42, 'The pen sprite must use a square logical canvas without stretching its pixels.');
for (const spacebar of [spaceCorrect, spaceIncorrect, spaceSemicorrect]) {
  assert.equal(spacebar.readUInt16LE(6), 160);
  assert.equal(spacebar.readUInt16LE(8), 32);
}

console.log('v0.66.2 Slots presentation timing, shared Coin rewards, keyboard assets and language polling passed.');
