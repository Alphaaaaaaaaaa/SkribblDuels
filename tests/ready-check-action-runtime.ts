import * as assert from 'node:assert/strict';
import { bindReliableButtonAction } from '../apps/telemetry-inspector/src/reliableButtonAction';

class TestButton extends EventTarget {
  public disabled = false;
  public focusCount = 0;

  public focus(): void {
    this.focusCount += 1;
  }
}

function pointerEvent(type: string, button = 0, isPrimary = true): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    button: { value: button },
    isPrimary: { value: isPrimary }
  });
  return event;
}

function clickEvent(detail: number): Event {
  const event = new Event('click', { cancelable: true });
  Object.defineProperty(event, 'detail', { value: detail });
  return event;
}

const pointerButton = new TestButton();
let pointerActions = 0;
bindReliableButtonAction(pointerButton as unknown as HTMLButtonElement, () => {
  pointerActions += 1;
  pointerButton.disabled = true;
});
pointerButton.dispatchEvent(pointerEvent('pointerdown'));
pointerButton.dispatchEvent(clickEvent(1));
assert.equal(pointerActions, 1, 'A pointer press followed by click must submit exactly once.');
assert.equal(pointerButton.focusCount, 1);

const keyboardButton = new TestButton();
let keyboardActions = 0;
bindReliableButtonAction(keyboardButton as unknown as HTMLButtonElement, () => {
  keyboardActions += 1;
});
keyboardButton.dispatchEvent(clickEvent(0));
assert.equal(keyboardActions, 1, 'A keyboard-generated click must submit the action.');

const ignoredButton = new TestButton();
let ignoredActions = 0;
bindReliableButtonAction(ignoredButton as unknown as HTMLButtonElement, () => {
  ignoredActions += 1;
});
ignoredButton.dispatchEvent(pointerEvent('pointerdown', 1));
ignoredButton.dispatchEvent(pointerEvent('pointerdown', 0, false));
assert.equal(ignoredActions, 0, 'Secondary and non-primary pointer presses must be ignored.');

console.log('Ready-check button pointer and keyboard activation passed.');
