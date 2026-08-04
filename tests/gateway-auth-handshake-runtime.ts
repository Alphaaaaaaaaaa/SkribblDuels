import * as assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import {
  GATEWAY_CONTRACT_VERSION,
  GATEWAY_SOCKET_EVENT,
  isGatewayConnectErrorData,
  isGatewayServerMessage,
  type GatewayServerMessage
} from '@skribbl-duels/gateway-contracts';
import {
  SocketIoGatewayClient,
  type GatewayConnectionSnapshot
} from '@skribbl-duels/gateway-client';
import { createGatewayServer } from '../apps/gateway/src/server';
import type { GatewayServerConfig } from '../apps/gateway/src/config';

const config: GatewayServerConfig = {
  nodeEnv: 'test',
  port: 0,
  clientOrigin: 'https://skribbl.io',
  supabaseUrl: 'https://example.supabase.co',
  supabasePublishableKey: 'sb_publishable_test',
  helloTimeoutMs: 1_000,
  heartbeatIntervalMs: 25_000,
  matchmakingReadyTimeoutMs: 30_000,
  simulatedPlayersEnabled: true,
  simulatedMatchDelayMs: 10,
  simulatedReadyDelayMs: 10,
  draftPickTimeoutMs: 15_000,
  simulatedDraftPickDelayMs: 10,
  draftFinalRevealMs: 8,
  matchCountdownMs: 10_000
};

const gateway = createGatewayServer({
  config,
  async authenticate(accessToken) {
    if (accessToken === 'valid-test-token') {
      return {
        ok: true,
        account: {
          identity: {
            accountId: 'c27ea4b9-984e-4efb-bfba-e9f77b28f1f4',
            displayName: 'analphabetism',
            discordUserId: '459399117307904000'
          },
          accessTokenExpiresAt: Date.now() + 60_000
        }
      };
    }
    return {
      ok: false,
      message: {
        type: 'AUTH_REQUIRED',
        reason: accessToken ? 'invalid-token' : 'missing-token'
      }
    };
  }
});

function waitForSnapshot(
  client: SocketIoGatewayClient,
  predicate: (snapshot: GatewayConnectionSnapshot) => boolean
): Promise<GatewayConnectionSnapshot> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Timed out waiting for Gateway client state.'));
    }, 3_000);
    const unsubscribe = client.subscribe(snapshot => {
      if (!predicate(snapshot)) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(snapshot);
    });
  });
}

function waitForMessage(
  socket: ReturnType<typeof io>,
  predicate: (message: GatewayServerMessage) => boolean
): Promise<GatewayServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(GATEWAY_SOCKET_EVENT, receive);
      reject(new Error('Timed out waiting for Gateway server message.'));
    }, 3_000);
    const receive = (value: unknown): void => {
      if (!isGatewayServerMessage(value) || !predicate(value)) return;
      clearTimeout(timeout);
      socket.off(GATEWAY_SOCKET_EVENT, receive);
      resolve(value);
    };
    socket.on(GATEWAY_SOCKET_EVENT, receive);
  });
}

const port = await gateway.listen(0, '127.0.0.1');
const endpoint = `http://127.0.0.1:${port}`;

const response = await fetch(`${endpoint}/healthz`);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), {
  status: 'ok',
  service: 'skribbl-duels-gateway',
  contractVersion: GATEWAY_CONTRACT_VERSION
});

const client = new SocketIoGatewayClient({
  endpoint,
  clientVersion: '0.41.0-test',
  capabilities: [
    'skribbl-telemetry',
    'official-word-list',
    'typo',
    'typo-challenges',
    'typo-drops',
    'typo-image-lab'
  ]
});
const connectedPromise = waitForSnapshot(client, snapshot => snapshot.status === 'connected');
client.setAccessToken('valid-test-token');
const connected = await connectedPromise;
assert.equal(connected.identity?.accountId, 'c27ea4b9-984e-4efb-bfba-e9f77b28f1f4');
assert.equal(connected.identity?.displayName, 'analphabetism');
assert.equal(connected.identity?.discordUserId, '459399117307904000');
assert.ok(connected.connectionId);

client.joinMatchmaking('ranked');
const readyCheck = await waitForSnapshot(client, snapshot =>
  snapshot.match?.state.phase === 'ready-check'
  && snapshot.match.state.participants.some(participant => participant.simulated && participant.ready)
);
assert.equal(readyCheck.queue, null);
assert.equal(readyCheck.match?.state.participants.length, 2);
client.setReady(readyCheck.match!.matchId, true);
const draftReady = await waitForSnapshot(client, snapshot => snapshot.match?.state.phase === 'draft');
assert.equal(draftReady.match?.state.readyDeadlineAt, null);
assert.equal(draftReady.match?.state.draft?.requiredPickCount, 25);
assert.equal(draftReady.match?.state.draft?.selectionDeadlineAt! - Date.now() > 14_000, true);

const rawSocket = io(endpoint, {
  auth: { accessToken: 'valid-test-token' },
  reconnection: false
});
await new Promise<void>((resolve, reject) => {
  rawSocket.once('connect', resolve);
  rawSocket.once('connect_error', reject);
});
const welcomePromise = waitForMessage(rawSocket, message => message.type === 'WELCOME');
rawSocket.emit(GATEWAY_SOCKET_EVENT, {
  type: 'HELLO',
  contractVersion: GATEWAY_CONTRACT_VERSION,
  clientVersion: '0.41.0-test',
  capabilities: ['skribbl-telemetry']
});
assert.equal((await welcomePromise).type, 'WELCOME');
const pongPromise = waitForMessage(rawSocket, message => message.type === 'PONG');
rawSocket.emit(GATEWAY_SOCKET_EVENT, { type: 'PING', sentAt: 1234 });
const pong = await pongPromise;
assert.equal(pong.type, 'PONG');
if (pong.type === 'PONG') assert.equal(pong.clientSentAt, 1234);

const rejectedSocket = io(endpoint, { auth: {}, reconnection: false });
const connectError = await new Promise<Error & { data?: unknown }>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Missing-token connection was not rejected.')), 3_000);
  rejectedSocket.once('connect_error', error => {
    clearTimeout(timeout);
    resolve(error as Error & { data?: unknown });
  });
});
assert.equal(isGatewayConnectErrorData(connectError.data), true);
if (isGatewayConnectErrorData(connectError.data)) {
  assert.deepEqual(connectError.data, { type: 'AUTH_REQUIRED', reason: 'missing-token' });
}

client.stop();
rawSocket.disconnect();
rejectedSocket.disconnect();
await gateway.close();

console.log(JSON.stringify({
  healthcheck: true,
  handshakeTokenVerified: true,
  authoritativeProfileWelcome: true,
  homepageMatchmaking: true,
  simulatedReadyCheck: true,
  authoritativeDraftStarted: true,
  pingPong: true,
  missingTokenRejected: true
}, null, 2));
