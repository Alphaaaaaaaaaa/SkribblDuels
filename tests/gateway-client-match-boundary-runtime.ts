import * as assert from 'node:assert/strict';
import {
  SocketIoGatewayClient,
  type GatewayConnectionSnapshot
} from '@skribbl-duels/gateway-client';
import type {
  GatewayClaimCandidateMessage,
  GatewayMatchSnapshotMessage,
  GatewayTelemetryEnvelope
} from '@skribbl-duels/gateway-contracts';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  }
});

function snapshot(matchId: string, revision: number): GatewayMatchSnapshotMessage {
  return {
    type: 'MATCH_SNAPSHOT',
    matchId,
    revision,
    state: {
      format: 'casual',
      phase: 'ready-check',
      participants: [
        {
          accountId: 'alpha', displayName: 'Alpha', ready: false, simulated: false,
          avatarSource: 'skribbl', avatarUrl: null, skribblAvatar: [1, 2, 3, -1],
          specialAvatarId: null, invisibleAvatarEntitled: false
        },
        {
          accountId: 'beta', displayName: 'Beta', ready: false, simulated: true,
          avatarSource: 'skribbl', avatarUrl: null, skribblAvatar: [2, 3, 4, -1],
          specialAvatarId: null, invisibleAvatarEntitled: false
        }
      ],
      readyDeadlineAt: 2_000,
      countdownEndsAt: null,
      startedAt: null,
      startingAccountId: 'alpha',
      createdAt: 1_000,
      draft: null,
      claims: [],
      drawProposal: null,
      conclusion: null,
      rematchReadyAccountIds: []
    }
  };
}

type ClientInternals = {
  state: GatewayConnectionSnapshot;
  telemetryQueue: GatewayTelemetryEnvelope[];
  telemetryInFlight: GatewayTelemetryEnvelope[];
  pendingClaims: Array<Omit<GatewayClaimCandidateMessage, 'type'>>;
  receive(value: unknown): void;
};

const client = new SocketIoGatewayClient({
  endpoint: 'https://gateway.example',
  clientVersion: 'boundary-test',
  capabilities: ['skribbl-telemetry']
});
const internals = client as unknown as ClientInternals;
internals.state = {
  ...client.getState(),
  status: 'connected',
  match: snapshot('old-match', 9)
};
internals.telemetryQueue = [{ matchId: 'old-match', sequence: 7 } as GatewayTelemetryEnvelope];
internals.telemetryInFlight = [{ matchId: 'old-match', sequence: 6 } as GatewayTelemetryEnvelope];
internals.pendingClaims = [{ matchId: 'old-match', candidateId: 'old-candidate' } as Omit<GatewayClaimCandidateMessage, 'type'>];

internals.receive(snapshot('rematch', 1));
assert.equal(internals.telemetryQueue.length, 0, 'A rematch snapshot must discard the previous match telemetry queue.');
assert.equal(internals.telemetryInFlight.length, 0, 'A rematch snapshot must discard the previous match in-flight batch.');
assert.equal(internals.pendingClaims.length, 0, 'A rematch snapshot must discard previous match claim candidates.');

internals.telemetryQueue = [{ matchId: 'rematch', sequence: 1 } as GatewayTelemetryEnvelope];
internals.receive(snapshot('rematch', 2));
assert.equal(internals.telemetryQueue.length, 1, 'A newer snapshot for the same match must preserve queued telemetry.');

client.stop();
console.log('Gateway client match-boundary telemetry reset passed.');
