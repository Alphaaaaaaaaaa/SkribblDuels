import { AvatarTelemetryAdapter, parseStoredAvatar } from '@skribbl-duels/telemetry-core';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(parseStoredAvatar('[0,38,41,-1]')?.[0] === 0, 'JSON avatar should parse.');
assert(parseStoredAvatar('0,38,41,-1')?.[0] === 0, 'Comma-separated avatar should parse.');

let stored = '[14,50,49,4]';
const emitted: Array<{ type: string; payload: unknown }> = [];
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (key: string) => key === 'ava' ? stored : null }
});
const adapter = new AvatarTelemetryAdapter({
  emitDomEvent(type: string, payload: unknown) { emitted.push({ type, payload }); }
} as never, { pollIntervalMs: 10, clickCorrelationWindowMs: 500 });
adapter.start();

adapter.notifyRandomizeClick();
stored = '[0,38,41,-1]';
await new Promise(resolve => setTimeout(resolve, 25));
assert(emitted.length === 1, `Expected one click-correlated avatar event, got ${emitted.length}.`);
assert(emitted[0]?.type === 'AVATAR_RANDOMIZED', 'Expected AVATAR_RANDOMIZED.');
const clickPayload = emitted[0]?.payload as {
  redSkin?: boolean;
  method?: string;
  validRandomization?: boolean;
  randomizeClickObserved?: boolean;
};
assert(clickPayload.redSkin === true, 'Expected redSkin true.');
assert(clickPayload.method === 'randomize-button', 'Expected randomize-button method.');
assert(clickPayload.validRandomization === true, 'Expected verified randomization.');
assert(clickPayload.randomizeClickObserved === true, 'Expected a correlated randomize click.');

stored = '[0,39,41,-1]';
await new Promise(resolve => setTimeout(resolve, 25));
assert(emitted.length === 1, 'A single manual +1 avatar change must not emit AVATAR_RANDOMIZED.');

stored = '[7,12,28,6]';
await new Promise(resolve => setTimeout(resolve, 25));
adapter.stop();
assert(emitted.length > 1, 'A strict multi-component fallback change should emit one heuristic randomization.');
const heuristicPayload = emitted[1]?.payload as { method?: string; randomizeClickObserved?: boolean };
assert(heuristicPayload.method === 'heuristic', 'Expected heuristic method for a large multi-component change.');
assert(heuristicPayload.randomizeClickObserved === false, 'Heuristic randomization must not claim a click was seen.');
console.log('Avatar telemetry adapter smoke test passed.');
