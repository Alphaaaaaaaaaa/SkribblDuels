import * as assert from 'node:assert/strict';
import {
  GATEWAY_CONTRACT_VERSION,
  isGatewayClientMessage,
  isGatewayServerMessage
} from '@skribbl-duels/gateway-contracts';

const hello = {
  type: 'HELLO',
  contractVersion: GATEWAY_CONTRACT_VERSION,
  clientVersion: '0.37.0',
  capabilities: ['skribbl-telemetry']
} as const;

assert.equal(GATEWAY_CONTRACT_VERSION, 1);
assert.equal(isGatewayClientMessage(hello), true);
assert.equal('accessToken' in hello, false);
assert.equal(isGatewayClientMessage({ ...hello, clientVersion: '' }), false);
assert.equal(isGatewayClientMessage({ ...hello, capabilities: ['unknown'] }), false);
assert.equal(isGatewayClientMessage({ type: 'WELCOME' }), false);
assert.equal(isGatewayServerMessage({
  type: 'CLAIM_RESOLUTION',
  matchId: 'match-1',
  candidateId: 'candidate-1',
  challengeId: 'challenge-1',
  accepted: true,
  claimId: 'claim-1',
  reason: null,
  revision: 1
}), true);
assert.equal(isGatewayServerMessage({ type: 'TELEMETRY_BATCH' }), false);

console.log(JSON.stringify({
  contractVersion: GATEWAY_CONTRACT_VERSION,
  strictClientAndServerGuards: true,
  tokenFreeHello: true
}, null, 2));
