import * as assert from 'node:assert/strict';
import {
  isGatewayServerMessage,
  type GatewayMatchSnapshotMessage,
  type GatewayServerMessage
} from '@skribbl-duels/gateway-contracts';
import { GatewayMatchmaker, type MatchmakingPeer } from '../apps/gateway/src/matchmaking';

const capabilities = [
  'skribbl-telemetry',
  'official-word-list',
  'typo',
  'typo-challenges',
  'typo-drops',
  'typo-image-lab'
] as const;

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 2_000) throw new Error(`Timed out waiting for ${label}.`);
    await new Promise(resolve => setTimeout(resolve, 2));
  }
}

function latest(messages: readonly GatewayServerMessage[]): GatewayMatchSnapshotMessage {
  const snapshot = [...messages].reverse().find(
    (message): message is GatewayMatchSnapshotMessage => message.type === 'MATCH_SNAPSHOT'
  );
  assert.ok(snapshot);
  assert.equal(isGatewayServerMessage(snapshot), true);
  return snapshot;
}

interface RunningFixture {
  matchmaker: GatewayMatchmaker;
  matchId: string;
  alphaMessages: GatewayServerMessage[];
  betaMessages: GatewayServerMessage[];
  peer(accountId: 'alpha' | 'beta', messages: GatewayServerMessage[]): MatchmakingPeer;
}

async function runningFixture(prefix: string, drawProposalTimeoutMs = 50): Promise<RunningFixture> {
  let id = 0;
  const alphaMessages: GatewayServerMessage[] = [];
  const betaMessages: GatewayServerMessage[] = [];
  const peer = (accountId: 'alpha' | 'beta', messages: GatewayServerMessage[]): MatchmakingPeer => ({
    identity: {
      accountId,
      displayName: accountId === 'alpha' ? 'Alpha' : 'Bravo',
      discordUserId: accountId,
      invisibleAvatarEntitled: accountId === 'alpha'
    },
    capabilities,
    send: message => messages.push(structuredClone(message))
  });
  const matchmaker = new GatewayMatchmaker({
    readyTimeoutMs: 1_000,
    simulatedPlayersEnabled: false,
    simulatedMatchDelayMs: 5,
    simulatedReadyDelayMs: 5,
    draftPickTimeoutMs: 1_000,
    simulatedDraftPickDelayMs: 5,
    draftFinalRevealMs: 2,
    matchCountdownMs: 2,
    reconnectGraceMs: 200,
    drawProposalTimeoutMs,
    createId: () => `${prefix}-${++id}`,
    random: () => 0
  });
  matchmaker.join(peer('alpha', alphaMessages), {
    type: 'MATCHMAKING_JOIN', requestId: `${prefix}-alpha`, format: 'casual', page: 'home'
  });
  matchmaker.join(peer('beta', betaMessages), {
    type: 'MATCHMAKING_JOIN', requestId: `${prefix}-beta`, format: 'casual', page: 'home'
  });
  const ready = latest(alphaMessages);
  matchmaker.setReady('alpha', { type: 'READY_SET', matchId: ready.matchId, ready: true });
  matchmaker.setReady('beta', { type: 'READY_SET', matchId: ready.matchId, ready: true });
  while (latest(alphaMessages).state.phase === 'draft') {
    const snapshot = latest(alphaMessages);
    const draft = snapshot.state.draft;
    assert.ok(draft);
    if (draft.status === 'finalizing') {
      await new Promise(resolve => setTimeout(resolve, 2));
      continue;
    }
    assert.equal(draft.status, 'selecting');
    assert.ok(draft.turnAccountId);
    assert.ok(draft.offeredChallengeIds[0]);
    assert.equal(matchmaker.pickDraftChallenge(draft.turnAccountId, {
      type: 'DRAFT_PICK',
      matchId: snapshot.matchId,
      challengeId: draft.offeredChallengeIds[0],
      clientRevision: snapshot.revision
    }).ok, true);
  }
  await waitFor(() => latest(alphaMessages).state.phase === 'running', `${prefix} running state`);
  const running = latest(alphaMessages);
  assert.equal(running.state.participants.find(item => item.accountId === 'alpha')?.invisibleAvatarEntitled, true);
  return { matchmaker, matchId: running.matchId, alphaMessages, betaMessages, peer };
}

const forfeit = await runningFixture('forfeit');
assert.equal(forfeit.matchmaker.forfeitMatch('outsider', {
  type: 'MATCH_FORFEIT', matchId: forfeit.matchId, actionId: 'outside'
}).ok, false);
assert.equal(forfeit.matchmaker.forfeitMatch('beta', {
  type: 'MATCH_FORFEIT', matchId: forfeit.matchId, actionId: 'forfeit-1'
}).ok, true);
const forfeited = latest(forfeit.alphaMessages);
assert.equal(forfeited.state.phase, 'finished');
assert.deepEqual(forfeited.state.conclusion, {
  outcome: 'win',
  reason: 'player-forfeit',
  winnerAccountId: 'alpha',
  loserAccountId: 'beta',
  initiatedByAccountId: 'beta',
  occurredAt: forfeited.state.conclusion?.occurredAt
});
assert.equal(forfeit.matchmaker.forfeitMatch('beta', {
  type: 'MATCH_FORFEIT', matchId: forfeit.matchId, actionId: 'forfeit-1'
}).ok, true, 'Identical action replay must be idempotent.');
const reused = forfeit.matchmaker.proposeDraw('beta', {
  type: 'DRAW_PROPOSE', matchId: forfeit.matchId, actionId: 'forfeit-1'
});
assert.equal(reused.ok, false);
if (!reused.ok) assert.equal(reused.code, 'ACTION_ID_REUSED');
assert.ok(forfeit.alphaMessages.some(message =>
  message.type === 'MATCH_EVENT' && message.event.type === 'MATCH_FORFEITED'
));
assert.equal(forfeit.matchmaker.requestRematch('alpha', {
  type: 'MATCH_REMATCH', matchId: forfeit.matchId, actionId: 'rematch-alpha'
}).ok, true);
assert.deepEqual(latest(forfeit.alphaMessages).state.rematchReadyAccountIds, ['alpha']);
assert.equal(forfeit.matchmaker.requestRematch('alpha', {
  type: 'MATCH_REMATCH', matchId: forfeit.matchId, actionId: 'rematch-alpha'
}).ok, true, 'Identical Rematch request replay must be idempotent.');
assert.equal(forfeit.matchmaker.requestRematch('beta', {
  type: 'MATCH_REMATCH', matchId: forfeit.matchId, actionId: 'rematch-beta'
}).ok, true);
const rematch = latest(forfeit.alphaMessages);
assert.notEqual(rematch.matchId, forfeit.matchId);
assert.equal(rematch.state.phase, 'ready-check');
assert.deepEqual(rematch.state.rematchReadyAccountIds, []);
assert.ok(forfeit.alphaMessages.some(message =>
  message.type === 'MATCH_EVENT' && message.event.type === 'REMATCH_STARTED'
));
forfeit.matchmaker.close();

const draw = await runningFixture('draw');
assert.equal(draw.matchmaker.proposeDraw('alpha', {
  type: 'DRAW_PROPOSE', matchId: draw.matchId, actionId: 'proposal-1'
}).ok, true);
const firstProposal = latest(draw.alphaMessages).state.drawProposal;
assert.ok(firstProposal);
const reconnectedBeta: GatewayServerMessage[] = [];
draw.matchmaker.disconnect('beta');
assert.equal(draw.matchmaker.resume(draw.peer('beta', reconnectedBeta), draw.matchId).status, 'resumed');
draw.matchmaker.publishResumeSnapshot('beta');
assert.equal(latest(reconnectedBeta).state.drawProposal?.proposalId, firstProposal.proposalId);
const selfResponse = draw.matchmaker.respondToDraw('alpha', {
  type: 'DRAW_RESPOND',
  matchId: draw.matchId,
  proposalId: firstProposal.proposalId,
  actionId: 'self-response',
  accept: true
});
assert.equal(selfResponse.ok, false);
if (!selfResponse.ok) assert.equal(selfResponse.code, 'DRAW_SELF_RESPONSE');
assert.equal(draw.matchmaker.respondToDraw('beta', {
  type: 'DRAW_RESPOND',
  matchId: draw.matchId,
  proposalId: firstProposal.proposalId,
  actionId: 'reject-1',
  accept: false
}).ok, true);
assert.equal(latest(draw.alphaMessages).state.drawProposal, null);

assert.equal(draw.matchmaker.proposeDraw('beta', {
  type: 'DRAW_PROPOSE', matchId: draw.matchId, actionId: 'proposal-2'
}).ok, true);
const secondProposal = latest(draw.alphaMessages).state.drawProposal;
assert.ok(secondProposal);
const forbiddenWithdraw = draw.matchmaker.withdrawDraw('alpha', {
  type: 'DRAW_WITHDRAW',
  matchId: draw.matchId,
  proposalId: secondProposal.proposalId,
  actionId: 'withdraw-other'
});
assert.equal(forbiddenWithdraw.ok, false);
if (!forbiddenWithdraw.ok) assert.equal(forbiddenWithdraw.code, 'DRAW_WITHDRAW_FORBIDDEN');
assert.equal(draw.matchmaker.withdrawDraw('beta', {
  type: 'DRAW_WITHDRAW',
  matchId: draw.matchId,
  proposalId: secondProposal.proposalId,
  actionId: 'withdraw-own'
}).ok, true);

assert.equal(draw.matchmaker.proposeDraw('alpha', {
  type: 'DRAW_PROPOSE', matchId: draw.matchId, actionId: 'proposal-3'
}).ok, true);
const acceptedProposal = latest(draw.alphaMessages).state.drawProposal;
assert.ok(acceptedProposal);
assert.equal(draw.matchmaker.respondToDraw('beta', {
  type: 'DRAW_RESPOND',
  matchId: draw.matchId,
  proposalId: acceptedProposal.proposalId,
  actionId: 'accept-1',
  accept: true
}).ok, true);
const drawn = latest(draw.alphaMessages);
assert.equal(drawn.state.phase, 'finished');
assert.equal(drawn.state.drawProposal, null);
assert.deepEqual(drawn.state.conclusion, {
  outcome: 'draw',
  reason: 'mutual-draw',
  winnerAccountId: null,
  loserAccountId: null,
  initiatedByAccountId: 'alpha',
  occurredAt: drawn.state.conclusion?.occurredAt
});
const afterDrawForfeit = draw.matchmaker.forfeitMatch('alpha', {
  type: 'MATCH_FORFEIT', matchId: draw.matchId, actionId: 'late-forfeit'
});
assert.equal(afterDrawForfeit.ok, false, 'The first terminal action must make the result immutable.');
if (!afterDrawForfeit.ok) assert.equal(afterDrawForfeit.code, 'MATCH_ALREADY_FINISHED');
draw.matchmaker.close();

const disconnected = await runningFixture('disconnect');
disconnected.matchmaker.disconnect('beta');
await waitFor(
  () => latest(disconnected.alphaMessages).state.phase === 'finished',
  'disconnect result'
);
const disconnectResult = latest(disconnected.alphaMessages);
assert.deepEqual(disconnectResult.state.conclusion, {
  outcome: 'win',
  reason: 'player-disconnect',
  winnerAccountId: 'alpha',
  loserAccountId: 'beta',
  initiatedByAccountId: null,
  occurredAt: disconnectResult.state.conclusion?.occurredAt
});
assert.ok(disconnected.alphaMessages.some(message =>
  message.type === 'MATCH_EVENT'
  && message.event.type === 'MATCH_FINISHED'
  && message.event.reason === 'player-disconnect'
));
disconnected.matchmaker.leave('alpha', 'winner-returned');
const lateDisconnectMessages: GatewayServerMessage[] = [];
assert.deepEqual(
  disconnected.matchmaker.resume(disconnected.peer('beta', lateDisconnectMessages), disconnected.matchId),
  { status: 'resumed', matchId: disconnected.matchId },
  'The disconnected player must still be able to restore the result after the winner returns.'
);
disconnected.matchmaker.publishResumeSnapshot('beta');
assert.equal(latest(lateDisconnectMessages).state.conclusion?.reason, 'player-disconnect');
disconnected.matchmaker.close();

const timeout = await runningFixture('timeout', 12);
assert.equal(timeout.matchmaker.proposeDraw('alpha', {
  type: 'DRAW_PROPOSE', matchId: timeout.matchId, actionId: 'timeout-proposal'
}).ok, true);
await waitFor(() => latest(timeout.alphaMessages).state.drawProposal === null, 'Draw proposal timeout');
assert.equal(latest(timeout.alphaMessages).state.phase, 'running');
assert.ok(timeout.alphaMessages.some(message =>
  message.type === 'MATCH_EVENT' && message.event.type === 'DRAW_EXPIRED'
));
timeout.matchmaker.close();

console.log(JSON.stringify({
  immediateForfeit: true,
  mutualDrawAcceptance: true,
  drawRejection: true,
  drawWithdrawal: true,
  drawTimeout: true,
  reconnectProposalRestore: true,
  idempotentActions: true,
  immutableFirstConclusion: true,
  authoritativeRematchReadyCheck: true,
  disconnectAwardsConnectedOpponent: true,
  lateDisconnectResultRestore: true
}, null, 2));
