import * as assert from 'node:assert/strict';
import {
  calculateLocalTypingWpm,
  completeTextInputAttempt,
  countInsertedTypingCharacters,
  countTypingCharacters,
  createTextInputAttempt,
  shouldResetTextInputAttemptBeforeInput,
  updateTextInputAttempt
} from '@skribbl-duels/telemetry-core';

let state = createTextInputAttempt('Ap', 1_000, 100, true);
state = updateTextInputAttempt(state, 'App', 'insertText', true, 1);
state = updateTextInputAttempt(state, 'Ap', 'deleteContentBackward', true);
state = updateTextInputAttempt(state, 'Apple', 'insertFromPaste', true, 3);
state.compositionUsed = true;
const measurement = completeTextInputAttempt(state, 'Apple', 2_200, 1_300, true);

assert.equal(measurement.durationMs, 1_200);
assert.equal(measurement.characterCount, 5);
assert.equal(measurement.typedCharacterCount, 6);
assert.equal(measurement.correctionCount, 1);
assert.equal(measurement.pasteDetected, true);
assert.equal(measurement.compositionUsed, true);
assert.equal(measurement.trustedInput, true);
assert.equal(calculateLocalTypingWpm(5, 1_200), 50);
assert.equal(calculateLocalTypingWpm(0, 1_200), null);
assert.equal(countTypingCharacters('  grüße 👋  '), 7, 'Character counting must use Unicode code points after trimming.');

const replacement = updateTextInputAttempt(
  createTextInputAttempt('', 3_000, 2_000, true),
  'autofilled',
  'insertReplacementText',
  false
);
assert.equal(replacement.autofillDetected, true);
assert.equal(replacement.trustedInput, false);

assert.equal(
  shouldResetTextInputAttemptBeforeInput('already typed', 0, 13, 'deleteContentBackward'),
  true,
  'Ctrl+A followed by Backspace must reset the attempt before the next character arrives.'
);
assert.equal(
  shouldResetTextInputAttemptBeforeInput('already typed', 2, 13, 'deleteContentBackward'),
  false,
  'Partial corrections must remain part of the active attempt.'
);
assert.equal(
  shouldResetTextInputAttemptBeforeInput('already typed', 0, 13, 'insertText'),
  false,
  'Selecting all and replacing text is still one edited attempt unless a deletion actually occurs.'
);

assert.equal(
  countInsertedTypingCharacters('remembered', 'rememberex', 9, 10, 'insertText', 'x'),
  1,
  'A trusted edit to a programmatically restored word must count only the physically inserted character.'
);
const restored = updateTextInputAttempt(
  createTextInputAttempt('remembered', 4_000, 3_000, true, 0),
  'rememberex',
  'insertText',
  true,
  1
);
assert.equal(restored.typedCharacterCount, 1);
assert.ok(
  restored.typedCharacterCount < countTypingCharacters(restored.lastValue),
  'Typo recent-word restoration must not inherit enough trusted input to certify the whole guess.'
);

console.log('Local text-input telemetry helpers test passed.');
