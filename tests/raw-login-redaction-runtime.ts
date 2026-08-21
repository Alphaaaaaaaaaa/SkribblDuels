import * as assert from 'node:assert/strict';
import {
  filterRawRecords,
  redactSensitivePacketData,
  redactSensitiveRawRecord,
  redactSensitiveRawValue,
  type RawSocketRecord
} from '@skribbl-duels/telemetry-core';

const loginPayload = {
  join: '',
  create: 0,
  name: 'A',
  lang: '22',
  code: 'private-room-code',
  avatar: [11, 36, 15, 17]
};
const record: RawSocketRecord = {
  recordId: 'record-1',
  sessionId: 'session-1',
  sequence: 1,
  direction: 'client-to-server',
  relayName: 'skribblEmitPort',
  portGeneration: 1,
  socketEvent: 'login',
  packetId: null,
  packetData: loginPayload,
  raw: ['login', loginPayload],
  occurredAt: 1,
  monotonicMs: 1,
  page: {
    href: 'https://skribbl.io/',
    pathname: '/',
    search: '',
    visibilityState: 'visible'
  }
};

const safePacket = redactSensitivePacketData('login', loginPayload) as Record<string, unknown>;
assert.equal('code' in safePacket, false);
assert.equal(loginPayload.code, 'private-room-code', 'Redaction must not mutate the relay payload.');
const safeRaw = redactSensitiveRawValue('login', record.raw) as unknown[];
assert.equal('code' in (safeRaw[1] as Record<string, unknown>), false);
const safeRecord = redactSensitiveRawRecord(record);
assert.equal('code' in (safeRecord.packetData as Record<string, unknown>), false);
assert.equal('code' in ((safeRecord.raw as unknown[])[1] as Record<string, unknown>), false);
const exported = filterRawRecords([record], { includeDrawPackets: true }).records[0]!;
assert.equal(JSON.stringify(exported).includes('private-room-code'), false);
assert.equal(redactSensitivePacketData('data', loginPayload), loginPayload);

console.log(JSON.stringify({
  liveLoginCodeRedacted: true,
  rawTupleRedacted: true,
  exportDefenseInDepth: true,
  sourcePayloadUnmodified: true
}, null, 2));
