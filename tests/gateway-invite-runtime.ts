import * as assert from 'node:assert/strict';
import type {
  GatewayInviteStatusMessage,
  GatewayMatchSnapshotMessage,
  GatewayServerMessage
} from '@skribbl-duels/gateway-contracts';
import { GatewayMatchmaker, type MatchmakingPeer } from '../apps/gateway/src/matchmaking';
import type {
  GatewayDurableInviteSnapshot,
  GatewayDurableMatchSnapshot,
  GatewayMatchAuthorityPersistence
} from '../apps/gateway/src/matchPersistence';

class MemoryInvitePersistence implements GatewayMatchAuthorityPersistence {
  public readonly invites = new Map<string, GatewayDurableInviteSnapshot>();

  public async loadActiveMatches(): Promise<GatewayDurableMatchSnapshot[]> { return []; }
  public async saveMatch(): Promise<void> {}
  public async finalizeMatch(): Promise<void> {}
  public async loadActiveInvites(at: number): Promise<GatewayDurableInviteSnapshot[]> {
    return [...this.invites.values()].filter(invite => invite.state === 'waiting' && invite.expiresAt > at)
      .map(invite => structuredClone(invite));
  }
  public async createInvite(invite: GatewayDurableInviteSnapshot): Promise<GatewayDurableInviteSnapshot> {
    this.invites.set(invite.inviteId, structuredClone(invite));
    return structuredClone(invite);
  }
  public async acceptInvite(
    tokenHash: string,
    accountId: string,
    requestId: string,
    matchId: string
  ): Promise<GatewayDurableInviteSnapshot | null> {
    const invite = [...this.invites.values()].find(item => item.tokenHash === tokenHash);
    if (!invite || invite.state !== 'waiting' || invite.creatorAccountId === accountId) return null;
    Object.assign(invite, {
      state: 'accepted', acceptedByAccountId: accountId, acceptRequestId: requestId, matchId
    });
    return structuredClone(invite);
  }
  public async cancelInvite(
    inviteId: string,
    creatorAccountId: string
  ): Promise<GatewayDurableInviteSnapshot | null> {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.creatorAccountId !== creatorAccountId || invite.state !== 'waiting') return null;
    invite.state = 'cancelled';
    return structuredClone(invite);
  }
}

let now = 1_800_000_000_000;
let id = 0;
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
  inviteTimeoutMs: 15 * 60_000,
  now: () => now,
  createId: () => `invite-test-${++id}`,
  random: () => 0
};

function peer(accountId: string, messages: GatewayServerMessage[]): MatchmakingPeer {
  return {
    identity: {
      accountId,
      displayName: accountId === 'alpha' ? 'Alpha' : 'Bravo',
      discordUserId: accountId
    },
    capabilities: ['skribbl-telemetry', 'official-word-list'],
    send: message => messages.push(structuredClone(message))
  };
}

const alphaMessages: GatewayServerMessage[] = [];
const betaMessages: GatewayServerMessage[] = [];
const matchmaker = new GatewayMatchmaker(options);
const alpha = peer('alpha', alphaMessages);
const beta = peer('beta', betaMessages);

assert.deepEqual(await matchmaker.createInvite(alpha, {
  type: 'INVITE_CREATE', requestId: 'create-1', format: 'ranked', page: 'home'
}), { ok: true });
const created = alphaMessages.find((message): message is GatewayInviteStatusMessage =>
  message.type === 'INVITE_STATUS' && message.status === 'waiting'
);
assert.ok(created?.token, 'The creator must receive a copyable opaque token.');
assert.equal(created.format, 'ranked');

const selfAccept = await matchmaker.acceptInvite(alpha, {
  type: 'INVITE_ACCEPT', requestId: 'accept-self', token: created.token, page: 'home'
});
assert.equal(selfAccept.ok, false, 'Invite creators may not consume their own link.');

assert.deepEqual(await matchmaker.acceptInvite(beta, {
  type: 'INVITE_ACCEPT', requestId: 'accept-1', token: created.token, page: 'home'
}), { ok: true });
const match = betaMessages.find((message): message is GatewayMatchSnapshotMessage =>
  message.type === 'MATCH_SNAPSHOT'
);
assert.ok(match, 'Accepting an invite must create the normal authoritative match snapshot.');
assert.equal(match.state.phase, 'ready-check');
assert.equal(match.state.format, 'ranked');
assert.equal(match.state.readyDeadlineAt, now + 30_000);
assert.deepEqual(match.state.participants.map(participant => participant.accountId), ['alpha', 'beta']);
assert.ok(match.state.participants.every(participant => !participant.simulated));

assert.deepEqual(await matchmaker.acceptInvite(beta, {
  type: 'INVITE_ACCEPT', requestId: 'accept-1', token: created.token, page: 'home'
}), { ok: true }, 'An identical accept retry must be idempotent.');
const reuse = await matchmaker.acceptInvite(peer('gamma', []), {
  type: 'INVITE_ACCEPT', requestId: 'accept-2', token: created.token, page: 'home'
});
assert.equal(reuse.ok, false, 'A consumed invite must reject a different account.');

const cancellationMessages: GatewayServerMessage[] = [];
const cancellationMaker = new GatewayMatchmaker({ ...options, createId: () => `cancel-${++id}` });
const cancellationPeer = peer('cancel-owner', cancellationMessages);
await cancellationMaker.createInvite(cancellationPeer, {
  type: 'INVITE_CREATE', requestId: 'create-cancel', format: 'casual', page: 'home'
});
const cancellable = cancellationMessages.find((message): message is GatewayInviteStatusMessage =>
  message.type === 'INVITE_STATUS' && message.status === 'waiting'
);
assert.ok(cancellable);
assert.deepEqual(await cancellationMaker.cancelInvite('cancel-owner', {
  type: 'INVITE_CANCEL', requestId: 'cancel-1', inviteId: cancellable.inviteId
}), { ok: true });
const cancelledUse = await cancellationMaker.acceptInvite(peer('late-user', []), {
  type: 'INVITE_ACCEPT', requestId: 'late-accept', token: cancellable.token!, page: 'home'
});
assert.equal(cancelledUse.ok, false);

const durablePersistence = new MemoryInvitePersistence();
const durableCreatorMessages: GatewayServerMessage[] = [];
const beforeRestart = new GatewayMatchmaker({ ...options, persistence: durablePersistence });
await beforeRestart.createInvite(peer('durable-owner', durableCreatorMessages), {
  type: 'INVITE_CREATE', requestId: 'durable-create', format: 'casual', page: 'home'
});
const durableCreated = durableCreatorMessages.find((message): message is GatewayInviteStatusMessage =>
  message.type === 'INVITE_STATUS' && message.status === 'waiting'
);
assert.ok(durableCreated?.token);
await beforeRestart.close();

const afterRestart = new GatewayMatchmaker({ ...options, persistence: durablePersistence });
assert.equal(await afterRestart.restoreFromPersistence(), 0);
const restoredCreatorMessages: GatewayServerMessage[] = [];
afterRestart.attachPeer(peer('durable-owner', restoredCreatorMessages));
assert.ok(restoredCreatorMessages.some(message =>
  message.type === 'INVITE_STATUS' && message.status === 'waiting' && message.token === null
), 'A waiting invite must restore and reattach its creator without persisting the plaintext token.');
const restoredAcceptorMessages: GatewayServerMessage[] = [];
assert.deepEqual(await afterRestart.acceptInvite(peer('durable-acceptor', restoredAcceptorMessages), {
  type: 'INVITE_ACCEPT', requestId: 'durable-accept', token: durableCreated.token, page: 'home'
}), { ok: true });
await afterRestart.flushPersistence();
assert.ok(restoredAcceptorMessages.some(message => message.type === 'MATCH_SNAPSHOT'));

now += 16 * 60_000;
await matchmaker.close();
await cancellationMaker.close();
await afterRestart.close();
console.log('Gateway durable invite lifecycle passed.');
