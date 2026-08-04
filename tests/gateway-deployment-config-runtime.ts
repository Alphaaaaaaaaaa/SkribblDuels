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

console.log(JSON.stringify({
  gatewayConfigured: true,
  gatewayUrl: defaultPublicConfig.gatewayUrl,
  transport: 'https',
  simulatedQueueConfiguration: true,
  readyTimeoutSeconds: serverConfig.matchmakingReadyTimeoutMs / 1000
}, null, 2));
