import * as assert from 'node:assert/strict';
import type {
  GatewayClientIdentity,
  GatewayFriendChatMessage,
  GatewaySocialPinnedStat,
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
  lobbyJoinMode: 'public',
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
  private messages: GatewayFriendChatMessage[] = [];
  private nextSequence = 1;
  private pinnedStats = new Map<string, GatewaySocialPinnedStat[]>();

  public async purgeMessages(): Promise<void> {
    this.messages = this.messages.filter(message => message.occurredAt >= Date.now() - 86_400_000);
  }

  public async storeMessage(senderId: string, recipientId: string, clientMessageId: string, message: string): Promise<GatewayFriendChatMessage> {
    if (await this.relationship(senderId, recipientId) !== 'friend') throw new SocialPersistenceError('FRIEND_NOT_FOUND', 'Friend not found.');
    const existing = this.messages.find(row => row.senderId === senderId && row.clientMessageId === clientMessageId);
    if (existing) {
      if (existing.recipientId !== recipientId || existing.message !== message) throw new SocialPersistenceError('FRIEND_MESSAGE_ID_CONFLICT', 'Identifier already used.');
      return structuredClone(existing);
    }
    const row: GatewayFriendChatMessage = { messageId: `stored-${this.nextSequence}`, sequence: this.nextSequence++, clientMessageId,
      senderId, recipientId, message, occurredAt: Date.now(), readAt: null };
    this.messages.push(row); return structuredClone(row);
  }

  public async getMessageHistory(accountId: string, friendId: string, beforeSequence: number | null): Promise<{ messages: GatewayFriendChatMessage[]; nextBeforeSequence: number | null }> {
    await this.purgeMessages();
    const rows = this.messages.filter(row => pairKey(row.senderId, row.recipientId) === pairKey(accountId, friendId)
      && (beforeSequence === null || row.sequence < beforeSequence)).sort((a, b) => b.sequence - a.sequence);
    const page = rows.slice(0, 200);
    return { messages: structuredClone(page.reverse()), nextBeforeSequence: rows.length > 200 ? Math.min(...page.map(row => row.sequence)) : null };
  }

  public async getUnreadMessages(accountId: string): Promise<{ accountId: string; count: number }[]> {
    await this.purgeMessages();
    const counts = new Map<string, number>();
    for (const row of this.messages) if (row.recipientId === accountId && row.readAt === null
      && await this.relationship(accountId, row.senderId) === 'friend') counts.set(row.senderId, (counts.get(row.senderId) ?? 0) + 1);
    return [...counts].map(([accountId, count]) => ({ accountId, count }));
  }

  public async markMessagesRead(accountId: string, friendId: string, throughSequence: number): Promise<void> {
    for (const row of this.messages) if (row.recipientId === accountId && row.senderId === friendId && row.sequence <= throughSequence) row.readAt = Date.now();
  }

  public async getPinnedStats(accountId: string): Promise<GatewaySocialPinnedStat[]> { return structuredClone(this.pinnedStats.get(accountId) ?? []); }
  public async setPinnedStats(accountId: string, stats: readonly GatewaySocialPinnedStat[]): Promise<void> { this.pinnedStats.set(accountId, structuredClone([...stats])); }


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

  public async canUnblock(accountId: string, blockedId: string): Promise<boolean> {
    return this.blocks.has(`${accountId}:${blockedId}`);
  }

  public async unblockAccount(accountId: string, blockedId: string): Promise<void> {
    const key = `${accountId}:${blockedId}`;
    if (!this.blocks.delete(key)) throw new SocialPersistenceError('SOCIAL_BLOCK_NOT_FOUND', 'Block not found.');
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
assert.equal(latest('alpha', 'FRIEND_SEARCH_RESULT').canUnblock, false);

persistence.blocks.add('alpha:bravo');
await service.handle('alpha', { type: 'FRIEND_SEARCH', requestId: 'search-blocked', discordUsername: 'bravo_tester' });
assert.equal(latest('alpha', 'FRIEND_SEARCH_RESULT').relationship, 'blocked');
assert.equal(latest('alpha', 'FRIEND_SEARCH_RESULT').canUnblock, true);
await service.handle('alpha', { type: 'FRIEND_UNBLOCK', requestId: 'unblock-1', accountId: 'bravo' });
assert.equal(await persistence.relationship('alpha', 'bravo'), 'none');
assert.equal(latest('alpha', 'FRIEND_SEARCH_RESULT').requestId, 'unblock-1');
assert.equal(latest('alpha', 'FRIEND_SEARCH_RESULT').canUnblock, false);

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

// Lobby details remain visible while join IDs are disclosed only with permission.
for (const lobbyType of ['public', 'private'] as const) {
  await service.handle('alpha', { type: 'SOCIAL_PRESENCE_SET', requestId: 'presence-permission', page: 'lobby',
    lobby: { lobbyId: 'permission-room', lobbyType, languageName: 'English', playerCount: 4, maxPlayers: 8 } });
  for (const mode of ['public', 'private', 'none'] as const) {
    await service.handle('alpha', { type: 'SOCIAL_PREFERENCES_SET', requestId: 'preferences-permission',
      preferences: { ...(await persistence.getPreferences('alpha')), lobbyJoinMode: mode } });
    const visible = latest('bravo', 'SOCIAL_SNAPSHOT').friends[0]!;
    const allowed = mode === 'private' || mode === 'public' && lobbyType === 'public';
    assert.equal(visible.canJoinLobby, allowed, `${mode}/${lobbyType}`);
    assert.equal(visible.lobby?.lobbyId, allowed ? 'permission-room' : null);
    assert.equal(visible.lobby?.lobbyType, lobbyType);
  }
}
await service.handle('alpha', { type: 'SOCIAL_PREFERENCES_SET', requestId: 'preferences-hide-lobby',
  preferences: { ...(await persistence.getPreferences('alpha')), lobbyJoinMode: 'private', lobbyStatusVisibility: 'nobody' } });
assert.equal(latest('bravo', 'SOCIAL_SNAPSHOT').friends[0]!.lobby, null);
await service.handle('alpha', { type: 'SOCIAL_PREFERENCES_SET', requestId: 'preferences-restore-lobby',
  preferences: { ...(await persistence.getPreferences('alpha')), lobbyJoinMode: 'public', lobbyStatusVisibility: 'friends' } });

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
assert.equal(latest('bravo', 'SOCIAL_EVENT').kind, 'match-invite-received');
assert.equal(latest('alpha', 'SOCIAL_EVENT').kind, 'match-invite-sent');
assert.ok(latest('bravo', 'SOCIAL_EVENT').inviteExpiresAt! > Date.now());
assert.equal(latest('bravo', 'SOCIAL_EVENT').inviteToken, null, 'The opaque token stays inside Match Authority.');
await service.matchInviteResponded('invite-1', false);
assert.equal(latest('alpha', 'SOCIAL_EVENT').kind, 'match-invite-declined');
assert.equal(latest('bravo', 'SOCIAL_EVENT').kind, 'match-invite-declined');
assert.equal(service.matchInvite('invite-1', 'bravo'), null);
await service.deliverMatchInvite({ inviteId: 'accepted', inviteToken: 'accept-token', senderAccountId: 'alpha', recipientAccountId: 'bravo', format: 'ranked', expiresAt: Date.now() + 60_000 });
await service.disconnected('bravo'); await service.connected(identity('bravo'));
assert.equal(latest('bravo', 'SOCIAL_EVENT').inviteId, 'accepted', 'Reconnecting recovers pending invitations.');
await service.matchInviteResponded('accepted', true);
assert.equal(latest('bravo', 'SOCIAL_EVENT').kind, 'match-invite-accepted');
assert.equal(latest('alpha', 'SOCIAL_EVENT').kind, 'match-invite-accepted');
await service.deliverMatchInvite({ inviteId: 'previous', inviteToken: 'old-token', senderAccountId: 'alpha', recipientAccountId: 'bravo', format: 'casual', expiresAt: Date.now() + 60_000 });
await service.deliverMatchInvite({ inviteId: 'replacement', inviteToken: 'new-token', senderAccountId: 'alpha', recipientAccountId: 'bravo', format: 'casual', expiresAt: Date.now() + 60_000 });
assert.equal(service.matchInvite('previous', 'bravo'), null);
assert.ok(sent.get('bravo')!.some(message => message.type === 'SOCIAL_EVENT' && message.kind === 'match-invite-cancelled' && message.inviteId === 'previous'));
await service.updateMatchInviteStatus('replacement', 'expired');
assert.equal(latest('bravo', 'SOCIAL_EVENT').kind, 'match-invite-expired');
assert.equal(service.matchInvite('replacement', 'bravo'), null);


await service.disconnected('bravo');
await service.handle('alpha', {
  type: 'FRIEND_MESSAGE_SEND', clientMessageId: 'quick-message-offline', accountId: 'bravo', message: 'Still there?'
});
const offlineMessage = latest('alpha', 'SOCIAL_EVENT');
assert.equal(offlineMessage.kind, 'friend-message-sent');
assert.equal(offlineMessage.chatMessage?.message, 'Still there?');
await service.connected(identity('bravo'));
assert.deepEqual(latest('bravo', 'FRIEND_CHAT_INBOX').unread, [{ accountId: 'alpha', count: 2 }]);
await service.handle('bravo', { type: 'FRIEND_CHAT_HISTORY_GET', requestId: 'history-1', accountId: 'alpha', beforeSequence: null });
const history = latest('bravo', 'FRIEND_CHAT_HISTORY');
assert.deepEqual(history.messages.map(row => row.message), ['Want to Duel?', 'Still there?']);
await service.handle('alpha', { type: 'FRIEND_MESSAGE_SEND', clientMessageId: 'quick-message-offline', accountId: 'bravo', message: 'Still there?' });
assert.equal(latest('alpha', 'SOCIAL_EVENT').chatMessage?.messageId, offlineMessage.chatMessage?.messageId, 'A retry must acknowledge the same stored message.');
await service.handle('bravo', { type: 'FRIEND_CHAT_READ', requestId: 'read-1', accountId: 'alpha', throughSequence: history.messages.at(-1)!.sequence });
assert.deepEqual(latest('bravo', 'FRIEND_CHAT_INBOX').unread, []);
await service.handle('alpha', { type: 'SOCIAL_PROFILE_STATS_SET', requestId: 'stats-1', stats: [{ id: 'duel-wins', value: '5' }, { id: 'best-public-score', value: '3,100' }] });
await service.handle('bravo', { type: 'FRIEND_PROFILE_GET', requestId: 'profile-1', accountId: 'alpha' });
assert.deepEqual(latest('bravo', 'FRIEND_PROFILE').pinnedStats, [{ id: 'duel-wins', value: '5' }, { id: 'best-public-score', value: '3,100' }]);
assert.equal(latest('bravo', 'FRIEND_PROFILE').relationship, 'friend');
activeMatches.delete('alpha');
await service.handle('alpha', { type: 'SOCIAL_PRESENCE_SET', requestId: 'presence-unknown-id', page: 'lobby',
  lobby: { lobbyId: null, lobbyType: 'public', languageName: 'English', playerCount: 7, maxPlayers: 8 } });
const unknownLobby = latest('bravo', 'SOCIAL_SNAPSHOT').friends[0]!;
assert.equal(unknownLobby.activity, 'lobby');
assert.equal(unknownLobby.canJoinLobby, false, 'Unknown lobby IDs show playing without exposing a broken join link.');
await service.handle('alpha', { type: 'FRIEND_REMOVE', requestId: 'remove-1', accountId: 'bravo' });
await service.handle('bravo', { type: 'FRIEND_CHAT_HISTORY_GET', requestId: 'history-removed', accountId: 'alpha', beforeSequence: null });
assert.equal(latest('bravo', 'ERROR').code, 'FRIEND_NOT_FOUND');
await service.handle('alpha', { type: 'FRIEND_MESSAGE_SEND', clientMessageId: 'after-removal', accountId: 'bravo', message: 'Not allowed' });
assert.equal(latest('alpha', 'ERROR').code, 'FRIEND_NOT_FOUND');
service.clear();

console.log('Social friendship, privacy, presence, profile cards, offline messaging, reads and invite flow passed.');
