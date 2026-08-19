import * as assert from 'node:assert/strict';
import { bloodlineDefinition } from '@skribbl-duels/challenge-definitions';
import type {
  GatewayClaimCandidateMessage,
  GatewayDraftBoardSnapshot,
  GatewayServerMessage,
  GatewayTelemetryBatchMessage
} from '@skribbl-duels/gateway-contracts';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';
import type {
  GatewayDurableMatchSnapshot,
  GatewayMatchAuthorityPersistence
} from '../apps/gateway/src/matchPersistence';
import { serializeDurableIdempotency } from '../apps/gateway/src/matchPersistence';
import { GatewayMatchmaker, type MatchmakingPeer } from '../apps/gateway/src/matchmaking';
import { GatewayPlayerTelemetryAuthority } from '../apps/gateway/src/telemetryAuthority';

class MemoryAuthorityPersistence implements GatewayMatchAuthorityPersistence {
  public readonly snapshots = new Map<string, GatewayDurableMatchSnapshot>();
  public readonly finalized = new Set<string>();
  public failNextSave = false;

  public async loadActiveMatches(now: number): Promise<GatewayDurableMatchSnapshot[]> {
    return Array.from(this.snapshots.values())
      .filter(snapshot => !this.finalized.has(snapshot.matchId) && snapshot.expiresAt > now)
      .map(snapshot => structuredClone(snapshot));
  }

  public async saveMatch(snapshot: GatewayDurableMatchSnapshot): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error('simulated durable write failure');
    }
    const previous = this.snapshots.get(snapshot.matchId);
    if (!previous || previous.revision <= snapshot.revision) {
      this.snapshots.set(snapshot.matchId, structuredClone(snapshot));
    }
  }

  public async finalizeMatch(matchId: string): Promise<void> {
    this.finalized.add(matchId);
  }
}

const capabilities = ['skribbl-telemetry', 'official-word-list'] as const;
function peer(accountId: string, messages: GatewayServerMessage[]): MatchmakingPeer {
  return {
    identity: {
      accountId,
      displayName: accountId === 'alpha' ? 'Alpha' : 'Bravo',
      discordUserId: accountId
    },
    capabilities,
    send: message => messages.push(structuredClone(message))
  };
}

let now = 1_800_000_000_000;
let id = 0;
const persistence = new MemoryAuthorityPersistence();
const options = {
  readyTimeoutMs: 30_000,
  simulatedPlayersEnabled: false,
  simulatedMatchDelayMs: 10,
  simulatedReadyDelayMs: 10,
  draftPickTimeoutMs: 15_000,
  simulatedDraftPickDelayMs: 10,
  draftFinalRevealMs: 10,
  matchCountdownMs: 10_000,
  reconnectGraceMs: 30_000,
  drawProposalTimeoutMs: 30_000,
  now: () => now,
  createId: () => `durable-${++id}`,
  random: () => 0,
  persistence
};
const alphaMessages: GatewayServerMessage[] = [];
const betaMessages: GatewayServerMessage[] = [];
const first = new GatewayMatchmaker(options);
first.join(peer('alpha', alphaMessages), { type: 'MATCHMAKING_JOIN', requestId: 'join-a', format: 'casual', page: 'home' });
first.join(peer('beta', betaMessages), { type: 'MATCHMAKING_JOIN', requestId: 'join-b', format: 'casual', page: 'home' });
await first.flushPersistence();
const matchSnapshot = alphaMessages.find(message => message.type === 'MATCH_SNAPSHOT');
assert.ok(matchSnapshot && matchSnapshot.type === 'MATCH_SNAPSHOT');
const matchId = matchSnapshot.matchId;

assert.deepEqual(first.sendDuelChat('alpha', {
  type: 'DUEL_CHAT_SEND',
  matchId,
  clientMessageId: 'durable-chat-1',
  message: 'Persist me once'
}), { ok: true });
const rejectedClaim: GatewayClaimCandidateMessage = {
  type: 'CLAIM_CANDIDATE',
  matchId,
  candidateId: 'durable-candidate-1',
  challengeId: 'bloodline',
  definitionVersion: bloodlineDefinition.version,
  evidenceEventIds: ['not-running'],
  occurredAt: now,
  throughSequence: 0
};
assert.deepEqual(first.submitClaimCandidate('alpha', rejectedClaim), { ok: true });
await first.flushPersistence();
assert.ok(persistence.snapshots.get(matchId)?.idempotency.some(row => row.namespace === 'chat'));
assert.ok(persistence.snapshots.get(matchId)?.idempotency.some(row => row.namespace === 'claim'));
const rpcIdempotency = serializeDurableIdempotency(persistence.snapshots.get(matchId)!.idempotency);
assert.ok(rpcIdempotency.every(row => row.account_id.length > 0));
assert.equal(
  rpcIdempotency.some(row => 'accountId' in row),
  false,
  'The Supabase RPC boundary must serialize account_id instead of the internal accountId key.'
);
await first.close();

const restoredAlphaMessages: GatewayServerMessage[] = [];
const restoredBetaMessages: GatewayServerMessage[] = [];
const restored = new GatewayMatchmaker(options);
assert.equal(await restored.restoreFromPersistence(), 1);
assert.deepEqual(restored.resume(peer('alpha', restoredAlphaMessages), matchId), { status: 'resumed', matchId });
assert.deepEqual(restored.resume(peer('beta', restoredBetaMessages), matchId), { status: 'resumed', matchId });
restored.publishResumeSnapshot('alpha');
const restoredChat = restoredAlphaMessages.filter(message => message.type === 'DUEL_CHAT_MESSAGE');
assert.equal(restoredChat.length, 1);
assert.equal(restoredChat[0]?.message, 'Persist me once');

assert.deepEqual(restored.sendDuelChat('alpha', {
  type: 'DUEL_CHAT_SEND',
  matchId,
  clientMessageId: 'durable-chat-1',
  message: 'Persist me once'
}), { ok: true });
const duplicateChat = restoredAlphaMessages.filter(message => message.type === 'DUEL_CHAT_MESSAGE').at(-1);
assert.equal(duplicateChat?.messageId, restoredChat[0]?.messageId, 'A restored chat idempotency key must replay the original message ID.');

const beforeDuplicateClaim = restoredAlphaMessages.filter(message => message.type === 'CLAIM_RESOLUTION').length;
assert.deepEqual(restored.submitClaimCandidate('alpha', rejectedClaim), { ok: true });
const resolutions = restoredAlphaMessages.filter(message => message.type === 'CLAIM_RESOLUTION');
assert.equal(resolutions.length, beforeDuplicateClaim + 1);
assert.equal(resolutions.at(-1)?.reason, 'claim-match-not-running');
await restored.close();

const simulatedPersistence = new MemoryAuthorityPersistence();
const simulatedMessages: GatewayServerMessage[] = [];
const simulatedReady = new GatewayMatchmaker({
  ...options,
  persistence: simulatedPersistence,
  simulatedPlayersEnabled: true,
  simulatedMatchDelayMs: 5,
  simulatedReadyDelayMs: 5
});
simulatedReady.join(peer('alpha', simulatedMessages), {
  type: 'MATCHMAKING_JOIN', requestId: 'durable-simulated-ready', format: 'casual', page: 'home'
});
await new Promise(resolve => setTimeout(resolve, 25));
await simulatedReady.flushPersistence();
const simulatedReadySnapshot = simulatedMessages.filter(message =>
  message.type === 'MATCH_SNAPSHOT' && message.state.phase === 'ready-check'
).at(-1);
assert.ok(simulatedReadySnapshot && simulatedReadySnapshot.type === 'MATCH_SNAPSHOT');
assert.equal(simulatedReadySnapshot.state.participants.some(participant => participant.simulated && participant.ready), true);
assert.deepEqual(simulatedReady.setReady('alpha', {
  type: 'READY_SET', matchId: simulatedReadySnapshot.matchId, ready: true
}), { ok: true });
await simulatedReady.flushPersistence();
assert.equal(
  simulatedMessages.filter(message => message.type === 'MATCH_SNAPSHOT').at(-1)?.state.phase,
  'draft',
  'A persisted QueueBot ready-check must accept the real participant and enter Draft.'
);
await simulatedReady.close();

const cancellationPersistence = new MemoryAuthorityPersistence();
const cancellationMessages: GatewayServerMessage[] = [];
const durableCancellation = new GatewayMatchmaker({
  ...options,
  persistence: cancellationPersistence,
  simulatedPlayersEnabled: true,
  simulatedMatchDelayMs: 5,
  simulatedReadyDelayMs: 5
});
durableCancellation.join(peer('alpha', cancellationMessages), {
  type: 'MATCHMAKING_JOIN', requestId: 'durable-simulated-cancel', format: 'casual', page: 'home'
});
await new Promise(resolve => setTimeout(resolve, 25));
await durableCancellation.flushPersistence();
const cancellationSnapshot = cancellationMessages.filter(message =>
  message.type === 'MATCH_SNAPSHOT' && message.state.phase === 'ready-check'
).at(-1);
assert.ok(cancellationSnapshot && cancellationSnapshot.type === 'MATCH_SNAPSHOT');
durableCancellation.leave('alpha', 'durable-ready-check-leave');
await durableCancellation.flushPersistence();
assert.equal(
  cancellationMessages.filter(message => message.type === 'MATCH_SNAPSHOT').at(-1)?.state.phase,
  'cancelled',
  'A persisted QueueBot ready-check must publish its cancellation before finalization.'
);
assert.equal(cancellationPersistence.finalized.has(cancellationSnapshot.matchId), true);
await durableCancellation.close();

const failingPersistence = new MemoryAuthorityPersistence();
failingPersistence.failNextSave = true;
const failedAlphaMessages: GatewayServerMessage[] = [];
const failedBetaMessages: GatewayServerMessage[] = [];
const failClosed = new GatewayMatchmaker({ ...options, persistence: failingPersistence });
failClosed.join(peer('alpha-fail', failedAlphaMessages), {
  type: 'MATCHMAKING_JOIN', requestId: 'join-fail-a', format: 'casual', page: 'home'
});
failClosed.join(peer('beta-fail', failedBetaMessages), {
  type: 'MATCHMAKING_JOIN', requestId: 'join-fail-b', format: 'casual', page: 'home'
});
await failClosed.flushPersistence();
assert.equal(
  failedAlphaMessages.some(message => message.type === 'MATCH_SNAPSHOT'),
  false,
  'An uncommitted authoritative snapshot must not be published.'
);
assert.ok(failedAlphaMessages.some(message =>
  message.type === 'ERROR' && message.code === 'MATCH_AUTHORITY_PERSISTENCE_UNAVAILABLE'
));
assert.equal(failClosed.persistenceStatus().healthy, false);
await failClosed.close();

const board: GatewayDraftBoardSnapshot = {
  boardId: 'durable-bloodline-board',
  format: 'casual',
  size: 9,
  winTarget: 5,
  seed: 1,
  createdAt: now,
  manifestVersion: 1,
  fields: [{ fieldIndex: 0, challengeId: 'bloodline', definitionVersion: bloodlineDefinition.version }]
};
const bloodlineEvent: TelemetryEvent = {
  schemaVersion: 1,
  eventId: 'durable-credits-opened',
  telemetrySequence: 1,
  type: 'CREDITS_OPENED',
  category: 'home',
  occurredAt: now + 1_000,
  monotonicMs: 1_000,
  actor: { playerId: null, name: null, isSelf: true },
  context: {
    lobbySessionId: 'durable-lobby-session', lobbyGeneration: 1, lobbyId: 'DURABLE', lobbyType: 0,
    languageId: 1, languageName: 'German', gameSessionId: 'durable-game', roundSessionId: 'durable-round',
    roundIndex: 0, roundNumber: 1, maxRounds: 3, gameStateId: 4, gameStateName: 'DRAWING', meId: 21, drawerId: 62
  },
  source: {
    origin: 'dom-adapter', rawRecordId: null, changeId: null, direction: null, socketEvent: null, packetId: null
  },
  payload: {
    pathname: '/credits', readyState: 'complete', linkClickObserved: true,
    navigationId: 'durable-navigation', linkClickedAt: now + 500, loadElapsedMs: 500
  },
  confidence: 'confirmed',
  highVolume: false
};
const batch: GatewayTelemetryBatchMessage = {
  type: 'TELEMETRY_BATCH',
  matchId: 'durable-bloodline-match',
  firstSequence: 1,
  lastSequence: 1,
  envelopes: [{
    contractVersion: 1,
    matchId: 'durable-bloodline-match',
    sequence: 1,
    sentAt: bloodlineEvent.occurredAt,
    event: bloodlineEvent
  }]
};
const authority = new GatewayPlayerTelemetryAuthority('alpha', board, now);
assert.equal(authority.processBatch(batch, now + 2_000).ok, true);
const authoritySnapshot = authority.exportSnapshot();
authority.destroy();
const restoredAuthority = new GatewayPlayerTelemetryAuthority('alpha', board, now, authoritySnapshot);
const validation = restoredAuthority.validateClaim({
  type: 'CLAIM_CANDIDATE',
  matchId: batch.matchId,
  candidateId: 'durable-bloodline-candidate',
  challengeId: 'bloodline',
  definitionVersion: bloodlineDefinition.version,
  evidenceEventIds: [bloodlineEvent.eventId],
  occurredAt: bloodlineEvent.occurredAt,
  throughSequence: 1
});
assert.equal(validation.ok, true, 'Bloodline completion evidence must survive a Gateway authority restart.');
restoredAuthority.destroy();

console.log('Durable Gateway match authority and idempotency runtime tests passed.');
