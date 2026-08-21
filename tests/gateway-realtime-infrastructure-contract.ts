import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const realtime = readFileSync('apps/gateway/src/realtimeInfrastructure.ts', 'utf8');
const server = readFileSync('apps/gateway/src/server.ts', 'utf8');
const client = readFileSync('packages/gateway-client/src/socketIoGatewayClient.ts', 'utf8');
const gatewayPackage = JSON.parse(readFileSync('apps/gateway/package.json', 'utf8')) as {
  dependencies: Record<string, string>;
};

assert.ok(gatewayPackage.dependencies['@socket.io/redis-streams-adapter']);
assert.ok(gatewayPackage.dependencies.redis);
assert.ok(realtime.includes('createAdapter(this.adapterClient'));
assert.ok(realtime.includes("streamName: 'skd:v1:socket.io'"));
assert.ok(realtime.includes("private readonly leaseKey = 'skd:v1:authority:lease'"));
assert.ok(realtime.includes("redis.call('GET', KEYS[1]) == ARGV[1]"));
assert.ok(realtime.includes("redis.call('PEXPIRE', KEYS[1], ARGV[2])"));
assert.ok(realtime.includes("acknowledgementKey(command.commandId)"));
assert.ok(realtime.includes("=== 'accepted'"));
assert.ok(realtime.includes('CLAIM_CONNECTION_SCRIPT'));
assert.ok(realtime.includes('RELEASE_CONNECTION_SCRIPT'));
assert.ok(realtime.includes("connection-owner-sequence"));
assert.ok(realtime.includes('await this.setLeader(false)'));
assert.ok(server.includes('GatewayAuthorityController'));
assert.ok(server.includes('io.to(accountRoom(accountId)).emit'));
assert.ok(server.includes("kind: 'connect'"));
assert.ok(server.includes("kind: 'disconnect'"));
assert.ok(server.includes('io.disconnectSockets(true)'));
assert.ok(server.includes('claim.previousConnectionId'));
assert.ok(server.includes('connectionRoom(claim.previousConnectionId)'));
assert.ok(!server.includes('io.in(accountRoom(accountId)).disconnectSockets(true)'));
assert.ok(client.includes("transports: ['websocket']"));
assert.ok(!client.includes("transports: ['websocket', 'polling']"));
assert.ok(client.includes("value.code === 'REALTIME_AUTHORITY_UNAVAILABLE'"));
assert.ok(client.includes('this.requeueTelemetryInFlight();'));
assert.ok(client.includes('this.scheduleTransportRetry();'));

console.log('Multi-instance realtime infrastructure contract passed.');
