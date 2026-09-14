import * as assert from 'node:assert/strict';
import {
  calculateLocalTypingWpm,
  completeTextInputAttempt,
  countTypingCharacters,
  createTextInputAttempt,
  shouldResetTextInputAttemptBeforeInput,
  updateTextInputAttempt
} from '@skribbl-duels/telemetry-core';

let state = createTextInputAttempt('Ap', 1_000, 100, true);
state = updateTextInputAttempt(state, 'App', 'insertText', true);
state = updateTextInputAttempt(state, 'Ap', 'deleteContentBackward', true);
state = updateTextInputAttempt(state, 'Apple', 'insertFromPaste', true);
state.compositionUsed = true;
const measurement = completeTextInputAttempt(state, 'Apple', 2_200, 1_300, true);

assert.equal(measurement.durationMs, 1_200);
assert.equal(measurement.characterCount, 5);
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

console.log('Local text-input telemetry helpers test passed.');
