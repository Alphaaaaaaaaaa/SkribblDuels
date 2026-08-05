import * as assert from 'node:assert/strict';
import { defaultPublicConfig } from '../apps/telemetry-inspector/vite.config';
import { readGatewayServerConfig } from '../apps/gateway/src/config';

const expectedGatewayUrl = 'https://skribblduels-production.up.railway.app';
const configuredGatewayUrl = new URL(defaultPublicConfig.gatewayUrl);

assert.equal(defaultPublicConfig.gatewayUrl, expectedGatewayUrl);
assert.equal(configuredGatewayUrl.protocol, 'https:');
assert.equal(configuredGatewayUrl.origin, expectedGatewayUrl);
assert.equal(configuredGatewayUrl.pathname, '/');

const serverConfig = readGatewayServerConfig({
  NODE_ENV: 'production',
  PORT: '3000',
  CLIENT_ORIGIN: 'https://skribbl.io',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  MATCHMAKING_SIMULATED_PLAYERS: 'true'
});
assert.equal(serverConfig.matchmakingReadyTimeoutMs, 30_000);
assert.equal(serverConfig.simulatedPlayersEnabled, true);
assert.equal(serverConfig.draftPickTimeoutMs, 15_000);
assert.equal(serverConfig.draftFinalRevealMs, 3_200);
assert.equal(serverConfig.matchCountdownMs, 10_000);
assert.equal(serverConfig.reconnectGraceMs, 30_000);

console.log(JSON.stringify({
  gatewayConfigured: true,
  gatewayUrl: defaultPublicConfig.gatewayUrl,
  transport: 'https',
  simulatedQueueConfiguration: true,
  readyTimeoutSeconds: serverConfig.matchmakingReadyTimeoutMs / 1000,
  draftPickTimeoutSeconds: serverConfig.draftPickTimeoutMs / 1000,
  draftFinalRevealSeconds: serverConfig.draftFinalRevealMs / 1000,
  matchCountdownSeconds: serverConfig.matchCountdownMs / 1000,
  reconnectGraceSeconds: serverConfig.reconnectGraceMs / 1000
}, null, 2));
