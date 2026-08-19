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

const firstPageClient = new SocketIoGatewayClient({
  endpoint: 'https://gateway.example',
  clientVersion: 'reload-persistence-test',
  capabilities: ['skribbl-telemetry']
});
const firstPageInternals = firstPageClient as unknown as ClientInternals;
firstPageInternals.state = {
  ...firstPageClient.getState(),
  status: 'connected',
  match: snapshot('reload-match', 4)
};
firstPageClient.queueTelemetryEnvelope({
  contractVersion: 1,
  matchId: 'reload-match',
  sequence: 12,
  sentAt: 1_500,
  event: { eventId: 'reload-event' }
} as GatewayTelemetryEnvelope);
firstPageClient.submitClaimCandidate({
  matchId: 'reload-match',
  candidateId: 'reload-candidate',
  challengeId: 'bloodline',
  definitionVersion: 1,
  evidenceEventIds: ['reload-event'],
  occurredAt: 1_500,
  throughSequence: 12
});

const reloadedClient = new SocketIoGatewayClient({
  endpoint: 'https://gateway.example',
  clientVersion: 'reload-persistence-test',
  capabilities: ['skribbl-telemetry']
});
const reloadedInternals = reloadedClient as unknown as ClientInternals;
assert.deepEqual(
  reloadedInternals.telemetryQueue.map(envelope => envelope.sequence),
  [12],
  'A page reload must restore telemetry which has not yet been acknowledged.'
);
assert.deepEqual(
  reloadedInternals.pendingClaims.map(candidate => candidate.candidateId),
  ['reload-candidate'],
  'A page reload must restore claim candidates which still depend on pending telemetry.'
);
reloadedInternals.receive(snapshot('reload-match', 5));
assert.equal(
  reloadedInternals.telemetryQueue.length,
  1,
  'The resumed snapshot for the persisted match must preserve its transport queue.'
);
firstPageClient.stop();
reloadedClient.stop();

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
