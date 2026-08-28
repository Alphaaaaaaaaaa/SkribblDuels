import * as assert from 'node:assert/strict';
import {
  TYPO_LOBBY_LEFT_DOM_EVENT_NAME,
  TypoLobbyLeftTelemetryAdapter
} from '@skribbl-duels/telemetry-core';

const originalDocument = globalThis.document;
const target = new EventTarget();
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: target
});

const emitted: Array<{ type: string; payload: unknown }> = [];
const adapter = new TypoLobbyLeftTelemetryAdapter({
  emitDomEvent(type: string, payload: unknown) {
    emitted.push({ type, payload });
  }
} as never);

adapter.start();
target.dispatchEvent(new Event(TYPO_LOBBY_LEFT_DOM_EVENT_NAME));
adapter.stop();
target.dispatchEvent(new Event(TYPO_LOBBY_LEFT_DOM_EVENT_NAME));

assert.deepEqual(emitted, [{
  type: 'TYPO_LOBBY_LEFT',
  payload: { method: 'typo-dom-event' }
}]);

Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: originalDocument
});

console.log('Typo lobby-left Telemetry adapter test passed.');
