import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../apps/telemetry-inspector/src/userscript.ts', import.meta.url),
  'utf8'
);

const bootstrapStart = source.indexOf('async function bootstrap(');
const bridgeStart = source.indexOf('bridge.start();', bootstrapStart);
const recorderStart = source.indexOf('const recorder = new RawPacketRecorder(', bootstrapStart);
const redactionStart = source.indexOf('void store.redactSensitiveRecords()', bootstrapStart);

assert.ok(bootstrapStart >= 0, 'userscript bootstrap must exist');
assert.ok(bridgeStart > bootstrapStart, 'Typo relay bridge must be started during bootstrap');
assert.ok(recorderStart > bridgeStart, 'relay bridge must start before the telemetry recorder');
assert.ok(redactionStart > recorderStart, 'IndexedDB redaction must not delay relay or recorder startup');
assert.equal(
  source.indexOf('await store.redactSensitiveRecords()', bootstrapStart),
  -1,
  'stored-record redaction must never block the one-shot Typo MessagePort handshake'
);

console.log(JSON.stringify({
  typoRelayStartsSynchronously: true,
  indexedDbRedactionRunsInBackground: true
}, null, 2));
