import * as assert from 'node:assert/strict';
import type {
  GatewayClientIdentity,
  GatewayServerMessage,
  GatewaySocialPreferences
} from '@skribbl-duels/gateway-contracts';
import { GatewaySocialService } from '../apps/gateway/src/socialService';
import {
  SocialPersistenceError,
  type GatewaySocialGraph,
  type GatewaySocialPersistence,
  type GatewaySocialStoredPreferences,
  type GatewaySocialStoredProfile,
  type GatewaySocialStoredRequest
} from '../apps/gateway/src/socialPersistence';

const defaultPreferences = (): GatewaySocialStoredPreferences => ({
  availability: 'online',
  profileStatusVisibility: 'everyone',
  lobbyStatusVisibility: 'friends',
  allowLobbyJoin: true,
  receiveFriendRequests: true,
  receiveMatchInvites: true,
  statusChallengeId: null,
  statusText: '',
  revision: 0
});

const pairKey = (left: string, right: string): string => [left, right].sort().join(':');

class FakeSocialPersistence implements GatewaySocialPersistence {
  public readonly profiles = new Map<string, GatewaySocialStoredProfile>();
  public readonly preferences = new Map<string, GatewaySocialStoredPreferences>();
  public readonly friendships = new Set<string>();
  public readonly pins = new Set<string>();
  public readonly requests = new Map<string, GatewaySocialStoredRequest>();
  public readonly blocks = new Set<string>();
  private nextRequest = 1;

  public async getProfiles(accountIds: readonly string[]): Promise<Map<string, GatewaySocialStoredProfile>> {
    return new Map(accountIds.flatMap(id => {
      const profile = this.profiles.get(id);
      return profile ? [[id, structuredClone(profile)] as const] : [];
    }));
  }

  public async getPreferencesForAccounts(accountIds: readonly string[]): Promise<Map<string, GatewaySocialStoredPreferences>> {
    return new Map(await Promise.all([...new Set(accountIds)].map(async accountId => [
      accountId,
      await this.getPreferences(accountId)
    ] as const)));
  }

  public async findProfileByDiscordUsername(username: string): Promise<GatewaySocialStoredProfile | null> {
    const normalized = username.trim().replace(/#0$/i, '').toLowerCase();
    return [...this.profiles.values()].find(profile =>
      profile.discordUsername.replace(/#0$/i, '').toLowerCase() === normalized
    ) ?? null;
  }

  public async getPreferences(accountId: string): Promise<GatewaySocialStoredPreferences> {
    const preferences = this.preferences.get(accountId) ?? defaultPreferences();
    this.preferences.set(accountId, preferences);
    return structuredClone(preferences);
  }

  public async setPreferences(accountId: string, preferences: GatewaySocialPreferences): Promise<GatewaySocialStoredPreferences> {
    const current = await this.getPreferences(accountId);
    const next = { ...current, ...preferences, revision: current.revision + 1 };
    this.preferences.set(accountId, next);
    return structuredClone(next);
  }

  public async setProfileStatus(accountId: string, challengeId: string | null, text: string): Promise<GatewaySocialStoredPreferences> {
    const current = await this.getPreferences(accountId);
    const next = { ...current, statusChallengeId: challengeId, statusText: text, revision: current.revision + 1 };
    this.preferences.set(accountId, next);
    return structuredClone(next);
  }

  public async getGraph(accountId: string): Promise<GatewaySocialGraph> {
    const friendIds = [...this.friendships].flatMap(key => {
      const [left, right] = key.split(':') as [string, string];
      return left === accountId ? [right] : right === accountId ? [left] : [];
    });
    return {
      preferences: await this.getPreferences(accountId),
      friendIds,
      pinnedFriendIds: friendIds.filter(friendId => this.pins.has(`${accountId}:${friendId}`)),
      requests: [...this.requests.values()].filter(request =>
        (request.senderId === accountId || request.recipientId === accountId)
        && (request.status === 'pending' || request.status === 'ignored')
      ).map(request => structuredClone(request))
    };
  }

  public async relationship(accountId: string, otherAccountId: string): Promise<'friend' | 'incoming-request' | 'outgoing-request' | 'blocked' | 'none'> {
    if (this.blocks.has(`${accountId}:${otherAccountId}`) || this.blocks.has(`${otherAccountId}:${accountId}`)) return 'blocked';
    if (this.friendships.has(pairKey(accountId, otherAccountId))) return 'friend';
    const request = [...this.requests.values()].find(item =>
      (item.status === 'pending' || item.status === 'ignored')
      && ((item.senderId === accountId && item.recipientId === otherAccountId)
        || (item.senderId === otherAccountId && item.recipientId === accountId))
    );
    if (!request) return 'none';
    return request.senderId === accountId ? 'outgoing-request' : 'incoming-request';
  }

  public async sendFriendRequest(senderId: string, recipientId: string): Promise<GatewaySocialStoredRequest> {
    if (await this.relationship(senderId, recipientId) !== 'none') {
      throw new SocialPersistenceError('FRIEND_REQUEST_EXISTS', 'A relationship already exists.');
    }
    const request: GatewaySocialStoredRequest = {
      friendRequestId: `request-${this.nextRequest++}`,
      senderId,
      recipientId,
      status: 'pending',
      createdAt: Date.now()
    };
    this.requests.set(request.friendRequestId, request);
    return structuredClone(request);
  }

  public async respondToFriendRequest(
    accountId: string,
    friendRequestId: string,
    response: 'accept' | 'decline' | 'ignore' | 'block'
  ): Promise<{ request: GatewaySocialStoredRequest; otherAccountId: string }> {
    const request = this.requests.get(friendRequestId);
    if (!request || request.recipientId !== accountId) {
      throw new SocialPersistenceError('FRIEND_REQUEST_NOT_FOUND', 'Request not found.');
    }
    if (response === 'accept') {
      this.friendships.add(pairKey(request.senderId, request.recipientId));
      this.requests.delete(friendRequestId);
    } else if (response === 'ignore') {
      request.status = 'ignored';
    } else {
      this.requests.delete(friendRequestId);
      if (response === 'block') this.blocks.add(`${accountId}:${request.senderId}`);
    }
    return { request: structuredClone(request), otherAccountId: request.senderId };
  }

  public async withdrawFriendRequest(accountId: string, friendRequestId: string): Promise<string> {
    const request = this.requests.get(friendRequestId);
    if (!request || request.senderId !== accountId) throw new SocialPersistenceError('FRIEND_REQUEST_NOT_FOUND', 'Request not found.');
    this.requests.delete(friendRequestId);
    return request.recipientId;
  }

  public async removeFriend(accountId: string, friendId: string): Promise<void> {
    this.friendships.delete(pairKey(accountId, friendId));
    this.pins.delete(`${accountId}:${friendId}`);
    this.pins.delete(`${friendId}:${accountId}`);
  }

  public async setFriendPin(accountId: string, friendId: string, pinned: boolean): Promise<void> {
    if (await this.relationship(accountId, friendId) !== 'friend') throw new SocialPersistenceError('FRIEND_NOT_FOUND', 'Friend not found.');
    const key = `${accountId}:${friendId}`;
    if (pinned) this.pins.add(key); else this.pins.delete(key);
  }
}

const persistence = new FakeSocialPersistence();
for (const [accountId, displayName, discordUsername] of [
  ['alpha', 'Alpha', 'alpha__tester'],
  ['bravo', 'Bravo', 'bravo_tester']
] as const) {
  persistence.profiles.set(accountId, {
    accountId,
    displayName,
    discordUsername,
    avatarSource: 'discord',
    avatarUrl: null,
    skribblAvatar: null,
    specialAvatarId: null,
    invisibleAvatarEntitled: false,
    nameColorIndex: 26
  });
  persistence.preferences.set(accountId, defaultPreferences());
}

const sent = new Map<string, GatewayServerMessage[]>();
const activeMatches = new Set<string>();
const service = new GatewaySocialService({
  persistence,
  send(accountId, message) {
    const messages = sent.get(accountId) ?? [];
    messages.push(structuredClone(message));
    sent.set(accountId, messages);
  },
  isAccountInActiveMatch: accountId => activeMatches.has(accountId),
  log() {}
});

const identity = (accountId: 'alpha' | 'bravo'): GatewayClientIdentity => ({
  accountId,
  displayName: accountId === 'alpha' ? 'Alpha' : 'Bravo',
  discordUserId: accountId === 'alpha' ? '1' : '2',
  discordUsername: persistence.profiles.get(accountId)!.discordUsername,
  avatarSource: 'discord',
  avatarUrl: null,
  skribblAvatar: null,
  specialAvatarId: null,
  invisibleAvatarEntitled: false,
  preferredLanguage: 'en',
  nameColorIndex: 26
});

const latest = <T extends GatewayServerMessage['type']>(accountId: string, type: T) => {
  const message = [...(sent.get(accountId) ?? [])].reverse().find(item => item.type === type);
  assert.ok(message, `${accountId} should receive ${type}.`);
  return message as Extract<GatewayServerMessage, { type: T }>;
};

await service.connected(identity('alpha'));
await service.connected(identity('bravo'));
assert.equal(latest('alpha', 'SOCIAL_SNAPSHOT').friends.length, 0);
await service.handle('alpha', {
  type: 'SOCIAL_PROFILE_STATUS_SET', requestId: 'invalid-status', challengeId: 'not-a-challenge', text: ''
});
assert.equal(latest('alpha', 'ERROR').code, 'INVALID_STATUS_ICON');

await service.handle('alpha', { type: 'FRIEND_SEARCH', requestId: 'search-1', discordUsername: 'bravo_tester#0' });
assert.equal(latest('alpha', 'FRIEND_SEARCH_RESULT').profile?.accountId, 'bravo');
assert.equal(latest('alpha', 'FRIEND_SEARCH_RESULT').relationship, 'none');

await service.handle('alpha', { type: 'FRIEND_REQUEST_SEND', requestId: 'send-1', accountId: 'bravo' });
const requestEvent = latest('bravo', 'SOCIAL_EVENT');
assert.equal(requestEvent.kind, 'friend-request-received');
assert.ok(requestEvent.friendRequestId);
await service.handle('bravo', {
  type: 'FRIEND_REQUEST_RESPOND', requestId: 'accept-1',
  friendRequestId: requestEvent.friendRequestId!, response: 'accept'
});
assert.equal(await persistence.relationship('alpha', 'bravo'), 'friend');
assert.equal(latest('alpha', 'SOCIAL_EVENT').kind, 'friend-request-accepted');

await service.handle('alpha', {
  type: 'SOCIAL_PROFILE_STATUS_SET', requestId: 'status-1', challengeId: 'quickscope', text: 'Ready now'
});
await service.handle('alpha', {
  type: 'SOCIAL_PRESENCE_SET', requestId: 'presence-1', page: 'lobby',
  lobby: { lobbyId: 'room-1', lobbyType: 'public', languageName: 'English', playerCount: 4, maxPlayers: 8 }
});
let alphaForBravo = latest('bravo', 'SOCIAL_SNAPSHOT').friends.find(friend => friend.accountId === 'alpha');
assert.equal(alphaForBravo?.statusText, 'Ready now');
assert.equal(alphaForBravo?.lobby?.lobbyId, 'room-1');
assert.equal(alphaForBravo?.canJoinLobby, true);

activeMatches.add('alpha');
await service.refreshAll();
alphaForBravo = latest('bravo', 'SOCIAL_SNAPSHOT').friends.find(friend => friend.accountId === 'alpha');
assert.equal(alphaForBravo?.presence, 'duel');

const alphaPreferences = await persistence.getPreferences('alpha');
await service.handle('alpha', {
  type: 'SOCIAL_PREFERENCES_SET', requestId: 'offline-1',
  preferences: { ...alphaPreferences, availability: 'offline' }
});
alphaForBravo = latest('bravo', 'SOCIAL_SNAPSHOT').friends.find(friend => friend.accountId === 'alpha');
assert.equal(alphaForBravo?.presence, 'offline', 'Manual offline must hide active-Duel presence.');
assert.equal(alphaForBravo?.lobby, null, 'Manual offline must hide lobby presence.');

await service.handle('alpha', {
  type: 'SOCIAL_PREFERENCES_SET', requestId: 'online-1',
  preferences: { ...(await persistence.getPreferences('alpha')), availability: 'online' }
});
await service.handle('alpha', {
  type: 'FRIEND_MESSAGE_SEND', clientMessageId: 'quick-message-1', accountId: 'bravo', message: 'Want to Duel?'
});
assert.equal(latest('bravo', 'SOCIAL_EVENT').kind, 'friend-message-received');
assert.equal(latest('alpha', 'SOCIAL_EVENT').kind, 'friend-message-sent');

await service.deliverMatchInvite({
  inviteId: 'invite-1', inviteToken: 'opaque-token', senderAccountId: 'alpha', recipientAccountId: 'bravo',
  format: 'casual', expiresAt: Date.now() + 60_000
});
assert.equal(service.matchInvite('invite-1', 'bravo')?.inviteToken, 'opaque-token');
await service.matchInviteResponded('invite-1', false);
assert.equal(latest('alpha', 'SOCIAL_EVENT').kind, 'match-invite-declined');

await service.disconnected('bravo');
await service.handle('alpha', {
  type: 'FRIEND_MESSAGE_SEND', clientMessageId: 'quick-message-offline', accountId: 'bravo', message: 'Still there?'
});
const offlineError = latest('alpha', 'ERROR');
assert.equal(offlineError.code, 'FRIEND_OFFLINE');

console.log('v0.69.0 Social service friendship, privacy, presence, Quick Message and invite flow passed.');
