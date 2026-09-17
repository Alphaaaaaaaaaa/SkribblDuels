import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const skribble = await readFile('apps/telemetry-inspector/src/skribbleUi.ts', 'utf8');
const slots = await readFile('apps/telemetry-inspector/src/slotsUi.ts', 'utf8');

assert.match(skribble, /\.scd-progression-load \{ position:fixed;z-index:2147483647;inset:0;/);
for (const source of [skribble, slots]) {
  assert.doesNotMatch(source, /backdrop-filter/);
  assert.match(source, /overlay\.appendChild\(load\)/);
}

assert.match(skribble, /createSkribbleKeyboardRows\(state\.languageId, getOfficialWords\(state\.languageId\)\)/);
assert.match(skribble, /loadOfficialWordList\(language, languageName\)/);
assert.match(skribble, /scd-skribble-keyboard-controls/);
assert.match(skribble, /'backspace', 'empty', state, 'wide', 'Backspace', 'skribbleBackspace'/);
assert.match(skribble, /'enter', 'empty', state, 'wide', 'Enter', 'skribbleEnter'/);
assert.match(skribble, /value === 'space' \? ' ' : value/);
assert.match(skribble, /\.scd-skribble-key:hover:not\(:disabled\) \{ scale:1\.1/);
assert.match(skribble, /\.scd-skribble-title img[^\n]*filter:drop-shadow/);
assert.match(skribble, /\.scd-skribble-actions \.scd-icon[^\n]*filter:drop-shadow/);
assert.match(skribble, /\.scd-coin-pill img[^\n]*filter:drop-shadow/);

assert.match(slots, /\.scd-slots-launcher[^\n]*width:min\(200px,22vw\);min-height:100px/);
assert.match(slots, /\.scd-slots-title \{ position:relative;z-index:6;/);
assert.match(slots, /\.scd-slots-title img[^\n]*transform:scale\(1\.8\);filter:drop-shadow/);
assert.match(slots, /\.scd-slot-payline > \.scd-slot-icon \{ width:100%;height:100%; \}/);
assert.match(slots, /max-width:192px;max-height:192px/);
assert.match(slots, /\.scd-slots-reels[^\n]*padding:30px 6px;overflow:visible/);
assert.match(slots, /\.scd-slots-odds-item \.scd-slot-icon\[data-icon="pen"\] img \{ width:30px;height:30px;aspect-ratio:1\/1;/);
assert.match(slots, /bulb\.dataset\.state !== state \|\| bulb\.src !== source/);
assert.doesNotMatch(slots, /server-authoritative|append-only/);
assert.doesNotMatch(slots, /authoritative spin|authoritative request/i);

console.log('v0.66.1 full-screen loaders, header polish, Slots sizing and keyboard UI contract passed.');
