import * as assert from 'node:assert/strict';
import type { GatewayServerMessage } from '@skribbl-duels/gateway-contracts';
import { GatewayAuthorityController, type GatewayAuthorityPayload } from '../apps/gateway/src/authorityController';
import type { GatewayServerConfig } from '../apps/gateway/src/config';
import { GatewayMetrics } from '../apps/gateway/src/metrics';

const config: GatewayServerConfig = {
  nodeEnv: 'test',
  port: 0,
  clientOrigin: 'https://skribbl.io',
  supabaseUrl: 'https://example.supabase.co',
  supabasePublishableKey: 'sb_publishable_test',
  supabaseServiceRoleKey: null,
  helloTimeoutMs: 1_000,
  heartbeatIntervalMs: 25_000,
  matchmakingReadyTimeoutMs: 30_000,
  simulatedPlayersEnabled: false,
  simulatedMatchDelayMs: 10,
  simulatedReadyDelayMs: 10,
  draftPickTimeoutMs: 15_000,
  simulatedDraftPickDelayMs: 10,
  draftFinalRevealMs: 8,
  matchCountdownMs: 10_000,
  reconnectGraceMs: 30_000,
  drawProposalTimeoutMs: 30_000,
  inviteTimeoutMs: 15 * 60_000,
  redisUrl: null,
  instanceId: 'connection-takeover-test',
  observabilityToken: null,
  authorityLeaseMs: 30_000
};

const directMessages = new Map<string, GatewayServerMessage[]>();
const controller = new GatewayAuthorityController({
  config,
  metrics: new GatewayMetrics(),
  sendToAccount() {},
  sendToConnection(connectionId, message) {
    const messages = directMessages.get(connectionId) ?? [];
    messages.push(message);
    directMessages.set(connectionId, messages);
  },
  log() {}
});

const identity = {
  accountId: 'c27ea4b9-984e-4efb-bfba-e9f77b28f1f4',
  displayName: 'analphabetism',
  discordUserId: '459399117307904000'
};

let sequence = 0;
async function command(payload: GatewayAuthorityPayload): Promise<void> {
  sequence += 1;
  await controller.handle({ commandId: `command-${sequence}`, sentAt: Date.now(), payload });
}

await controller.setActive(true);

await command({
  kind: 'connect',
  identity,
  capabilities: ['skribbl-telemetry'],
  connectionId: 'new-connection',
  connectionEpoch: 20,
  clientVersion: '0.54.1-test'
});
assert.equal(directMessages.get('new-connection')?.at(-1)?.type, 'WELCOME');

// Redis pub/sub delivery can arrive out of order across a takeover. An older
// HELLO must never replace the connection with the greater fencing epoch.
await command({
  kind: 'connect',
  identity,
  capabilities: ['skribbl-telemetry'],
  connectionId: 'old-connection',
  connectionEpoch: 19,
  clientVersion: '0.54.1-test'
});
assert.deepEqual(directMessages.get('old-connection')?.at(-1), {
  type: 'ERROR',
  code: 'STALE_CONNECTION',
  message: 'This Gateway connection has been superseded. Reconnect and try again.',
  recoverable: true
});

// A late disconnect/message from the superseded socket must not affect the
// current connection or its Match Authority session.
await command({
  kind: 'disconnect',
  accountId: identity.accountId,
  connectionId: 'old-connection',
  connectionEpoch: 19
});
await command({
  kind: 'message',
  accountId: identity.accountId,
  connectionId: 'old-connection',
  connectionEpoch: 19,
  message: { type: 'MATCHMAKING_LEAVE', requestId: 'stale-leave' }
});
assert.equal(directMessages.get('old-connection')?.at(-1)?.type, 'ERROR');

await command({
  kind: 'message',
  accountId: identity.accountId,
  connectionId: 'new-connection',
  connectionEpoch: 20,
  message: { type: 'MATCHMAKING_LEAVE', requestId: 'current-leave' }
});
assert.notEqual(directMessages.get('new-connection')?.at(-1)?.type, 'ERROR');

await controller.close();
console.log('Gateway fenced connection takeover runtime test passed.');
