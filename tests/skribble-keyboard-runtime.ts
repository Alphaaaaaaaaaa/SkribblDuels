import * as assert from 'node:assert/strict';
import type { GatewaySkribbleAttempt } from '@skribbl-duels/gateway-contracts';
import {
  appendSkribbleKeyboardValue,
  createSkribbleKeyboardRows,
  getSkribbleKeyboardMark,
  removeLastSkribbleCharacter
} from '../apps/telemetry-inspector/src/skribbleKeyboard';

const german = createSkribbleKeyboardRows(1, [
  'Shaun das Schaf',
  'E-Mail',
  'Dr. Dolittle',
  'größer'
]);
const germanKeys = german.flat();
assert.deepEqual(german[0]!.slice(0, 7), ['q', 'w', 'e', 'r', 't', 'z', 'u'], 'German must use a QWERTZ base layout.');
for (const character of ['ä', 'ö', 'ü', 'ß', '-', '.']) {
  assert.ok(germanKeys.includes(character), `German keyboard must expose ${character}.`);
}
assert.ok(!germanKeys.includes(' '), 'Space belongs to the dedicated wide control.');

const numeric = createSkribbleKeyboardRows(0, ['route 2.3/1']);
assert.deepEqual(
  numeric[0],
  ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
  'Any numeric word-list entry must add a dedicated 1–9 top row.'
);
assert.ok(numeric.slice(1).flat().includes('.'));
assert.ok(numeric.slice(1).flat().includes('/'));
assert.ok(!numeric.slice(1).flat().some(character => /^[0-9]$/u.test(character)), 'Digits must not leak into punctuation rows.');
const numericWithZero = createSkribbleKeyboardRows(0, ['formula 10']);
assert.deepEqual(numericWithZero[0], ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
assert.notDeepEqual(createSkribbleKeyboardRows(0, ['plain words'])[0], numeric[0]);

const french = createSkribbleKeyboardRows(7, ['arc-en-ciel', "l'été"]);
assert.deepEqual(french[0]!.slice(0, 6), ['a', 'z', 'e', 'r', 't', 'y']);
assert.ok(french.flat().includes("'"));

const serbian = createSkribbleKeyboardRows(22, ['čaša', 'đak', 'žirafa']);
for (const character of ['č', 'ć', 'đ', 'š', 'ž']) assert.ok(serbian.flat().includes(character));

const korean = createSkribbleKeyboardRows(14, ['강아지', '빨간색']);
for (const jamo of ['ㄱ', 'ㅏ', 'ㅇ', 'ㅃ']) assert.ok(korean.flat().includes(jamo));

const attempts: GatewaySkribbleAttempt[] = [
  { guess: 'abend', marks: ['incorrect', 'semicorrect', 'incorrect', 'incorrect', 'incorrect'], submittedAt: 1 },
  { guess: 'apfel', marks: ['correct', 'incorrect', 'incorrect', 'incorrect', 'incorrect'], submittedAt: 2 }
];
assert.equal(getSkribbleKeyboardMark(attempts, 'a', 1), 'correct', 'Correct must outrank an older weaker mark.');
assert.equal(getSkribbleKeyboardMark(attempts, 'b', 1), 'semicorrect');
assert.equal(getSkribbleKeyboardMark(attempts, 'p', 1), 'incorrect');
assert.equal(getSkribbleKeyboardMark(attempts, 'z', 1), 'empty');

let hangul = '';
hangul = appendSkribbleKeyboardValue(hangul, 'ㄱ', 14, 32);
hangul = appendSkribbleKeyboardValue(hangul, 'ㅏ', 14, 32);
assert.equal(hangul, '가');
hangul = appendSkribbleKeyboardValue(hangul, 'ㄴ', 14, 32);
assert.equal(hangul, '간');
hangul = appendSkribbleKeyboardValue(hangul, 'ㅏ', 14, 32);
assert.equal(hangul, '가나', 'A vowel must move a final consonant to the next Hangul syllable.');

let compound = '';
for (const jamo of ['ㄱ', 'ㅗ', 'ㅏ']) compound = appendSkribbleKeyboardValue(compound, jamo, 14, 32);
assert.equal(compound, '과', 'Common compound Korean vowels must compose in-place.');
const koreanAttempt: GatewaySkribbleAttempt[] = [
  { guess: '과', marks: ['correct'], submittedAt: 3 }
];
for (const jamo of ['ㄱ', 'ㅘ', 'ㅗ', 'ㅏ']) {
  assert.equal(getSkribbleKeyboardMark(koreanAttempt, jamo, 14), 'correct');
}

assert.equal(appendSkribbleKeyboardValue('ab', 'c', 0, 2), 'ab', 'The visible keyboard must respect maxLength.');
assert.equal(removeLastSkribbleCharacter('A😀'), 'A', 'Backspace must remove one Unicode code point.');

console.log('Language-aware Skribble keyboard layouts, feedback and Hangul composition passed.');
