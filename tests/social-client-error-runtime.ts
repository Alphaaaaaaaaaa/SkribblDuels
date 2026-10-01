import * as assert from 'node:assert/strict';
import {
  SocketIoGatewayClient,
  type GatewayConnectionSnapshot
} from '@skribbl-duels/gateway-client';

type ClientInternals = {
  state: GatewayConnectionSnapshot;
  receive(value: unknown): void;
};

const client = new SocketIoGatewayClient({
  endpoint: 'https://gateway.example',
  clientVersion: 'social-error-test',
  capabilities: ['skribbl-telemetry']
});
const internals = client as unknown as ClientInternals;
internals.state = {
  ...client.getState(),
  status: 'connected',
  connectionId: 'connection-1',
  error: null
};

const originalConsoleError = console.error;
const diagnostics: unknown[][] = [];
console.error = (...values: unknown[]) => { diagnostics.push(values); };
try {
  internals.receive({
    type: 'ERROR',
    code: 'SOCIAL_ACTION_FAILED',
    message: 'The social action could not be completed. Diagnostic ID: abc12345.',
    recoverable: true,
    requestId: 'friend-response-1'
  });
} finally {
  console.error = originalConsoleError;
}

let state = client.getState();
assert.equal(state.status, 'connected');
assert.equal(state.error, null, 'A Social failure must not pollute Homepage matchmaking state.');
assert.equal(state.socialError?.requestId, 'friend-response-1');
assert.equal(diagnostics.length, 1, 'Social failures must remain inspectable in the browser console.');

internals.receive({
  type: 'SOCIAL_SNAPSHOT',
  requestId: 'social-sync-1',
  revision: 1,
  preferences: {
    availability: 'online',
    profileStatusVisibility: 'everyone',
    lobbyStatusVisibility: 'friends',
    allowLobbyJoin: true,
    receiveFriendRequests: true,
    receiveMatchInvites: true
  },
  statusChallengeId: null,
  statusText: '',
  friends: [],
  requests: []
});
state = client.getState();
assert.equal(state.socialError, null, 'A confirmed Social snapshot clears the previous action error.');

console.log('v0.69.1 Social errors remain diagnostic without affecting matchmaking state.');
