import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  SUPABASE_SERVICE_ROLE_KEY: 'sb_service_role_test',
  REDIS_URL: 'redis://default:password@redis.railway.internal:6379',
  OBSERVABILITY_TOKEN: 'operations-test-token-32-characters',
  RAILWAY_REPLICA_ID: 'replica-test-1',
  MATCHMAKING_SIMULATED_PLAYERS: 'true'
});
assert.equal(serverConfig.matchmakingReadyTimeoutMs, 30_000);
assert.equal(serverConfig.simulatedPlayersEnabled, true);
assert.equal(serverConfig.draftPickTimeoutMs, 15_000);
assert.equal(serverConfig.draftFinalRevealMs, 3_200);
assert.equal(serverConfig.matchCountdownMs, 10_000);
assert.equal(serverConfig.reconnectGraceMs, 30_000);
assert.equal(serverConfig.supabaseServiceRoleKey, 'sb_service_role_test');
assert.equal(serverConfig.redisUrl, 'redis://default:password@redis.railway.internal:6379');
assert.equal(serverConfig.observabilityToken, 'operations-test-token-32-characters');
assert.equal(serverConfig.instanceId, 'replica-test-1');
assert.throws(() => readGatewayServerConfig({
  NODE_ENV: 'production',
  PORT: '3000',
  CLIENT_ORIGIN: 'https://skribbl.io',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test'
}), /SUPABASE_SERVICE_ROLE_KEY/);
assert.throws(() => readGatewayServerConfig({
  NODE_ENV: 'production',
  PORT: '3000',
  CLIENT_ORIGIN: 'https://skribbl.io',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_service_role_test'
}), /REDIS_URL/);
assert.throws(() => readGatewayServerConfig({
  NODE_ENV: 'production',
  PORT: '3000',
  CLIENT_ORIGIN: 'https://skribbl.io',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_service_role_test',
  REDIS_URL: 'redis://localhost:6379'
}), /OBSERVABILITY_TOKEN/);
assert.throws(() => readGatewayServerConfig({
  NODE_ENV: 'production',
  PORT: '3000',
  CLIENT_ORIGIN: 'https://skribbl.io',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_service_role_test',
  REDIS_URL: 'redis://localhost:6379',
  OBSERVABILITY_TOKEN: 'too-short'
}), /at least 32 characters/);

const serverSource = readFileSync('apps/gateway/src/server.ts', 'utf8');
assert.ok(serverSource.includes("request.url === '/healthz'"));
assert.ok(serverSource.includes("request.url === '/readyz'"));
assert.ok(serverSource.includes("request.url === '/metrics'"));
assert.ok(serverSource.includes("request.url === '/diagnostics'"));
assert.ok(serverSource.includes('RedisGatewayRateLimiter'));
const realtimeSource = readFileSync('apps/gateway/src/realtimeInfrastructure.ts', 'utf8');
assert.ok(realtimeSource.includes("createAdapter(this.adapterClient"));
assert.ok(realtimeSource.includes("streamName: 'skd:v1:socket.io'"));
assert.ok(realtimeSource.includes("redis.call('PEXPIRE'"));

console.log(JSON.stringify({
  gatewayConfigured: true,
  gatewayUrl: defaultPublicConfig.gatewayUrl,
  transport: 'https',
  realtimeTransport: 'redis-streams',
  authorityLease: true,
  operationsEndpoints: true,
  simulatedQueueConfiguration: true,
  readyTimeoutSeconds: serverConfig.matchmakingReadyTimeoutMs / 1000,
  draftPickTimeoutSeconds: serverConfig.draftPickTimeoutMs / 1000,
  draftFinalRevealSeconds: serverConfig.draftFinalRevealMs / 1000,
  matchCountdownSeconds: serverConfig.matchCountdownMs / 1000,
  reconnectGraceSeconds: serverConfig.reconnectGraceMs / 1000
}, null, 2));
