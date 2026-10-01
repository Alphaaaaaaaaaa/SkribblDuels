import * as assert from 'node:assert/strict';
import {
  GATEWAY_CONTRACT_VERSION,
  isGatewayClientMessage,
  isGatewayServerMessage,
  type GatewaySocialProfile
} from '@skribbl-duels/gateway-contracts';

assert.equal(GATEWAY_CONTRACT_VERSION, 18);

const preferences = {
  availability: 'online',
  profileStatusVisibility: 'friends',
  lobbyStatusVisibility: 'friends',
  lobbyJoinMode: 'public',
  receiveFriendRequests: true,
  receiveMatchInvites: true
} as const;

const profile: GatewaySocialProfile = {
  accountId: 'account-bravo',
  displayName: 'Bravo',
  discordUsername: 'bravo__user',
  avatarSource: 'discord',
  avatarUrl: null,
  skribblAvatar: null,
  specialAvatarId: null,
  invisibleAvatarEntitled: false,
  nameColorIndex: 26,
  statusChallengeId: 'quickscope',
  statusText: 'Ready to Duel',
  presence: 'online',
  lastSeenAt: null,
  lobby: {
    lobbyId: 'public-room',
    lobbyType: 'public',
    languageName: 'English',
    playerCount: 4,
    maxPlayers: 8
  },
  canJoinLobby: true,
  pinned: true
};

for (const message of [
  { type: 'SOCIAL_SYNC', requestId: 'sync-1' },
  { type: 'SOCIAL_PREFERENCES_SET', requestId: 'preferences-1', preferences },
  { type: 'SOCIAL_PROFILE_STATUS_SET', requestId: 'status-1', challengeId: 'quickscope', text: 'Ready' },
  { type: 'SOCIAL_PRESENCE_SET', requestId: 'presence-1', page: 'lobby', lobby: profile.lobby },
  { type: 'FRIEND_SEARCH', requestId: 'search-1', discordUsername: 'bravo__user#0' },
  { type: 'FRIEND_REQUEST_SEND', requestId: 'request-1', accountId: profile.accountId },
  { type: 'FRIEND_REQUEST_RESPOND', requestId: 'respond-1', friendRequestId: 'friend-request-1', response: 'ignore' },
  { type: 'FRIEND_REQUEST_WITHDRAW', requestId: 'withdraw-1', friendRequestId: 'friend-request-1' },
  { type: 'FRIEND_UNBLOCK', requestId: 'unblock-1', accountId: profile.accountId },
  { type: 'FRIEND_REMOVE', requestId: 'remove-1', accountId: profile.accountId },
  { type: 'FRIEND_PIN_SET', requestId: 'pin-1', accountId: profile.accountId, pinned: true },
  { type: 'FRIEND_MESSAGE_SEND', clientMessageId: 'message-1', accountId: profile.accountId, message: 'Hello!' },
  { type: 'FRIEND_MATCH_INVITE_SEND', requestId: 'match-invite-1', accountId: profile.accountId, format: 'ranked' },
  { type: 'FRIEND_MATCH_INVITE_RESPOND', requestId: 'match-response-1', inviteId: 'invite-1', accept: true }
] as const) {
  assert.equal(isGatewayClientMessage(message), true, `${message.type} should satisfy Contract v18.`);
}

assert.equal(isGatewayClientMessage({
  type: 'SOCIAL_PRESENCE_SET', requestId: 'presence-invalid', page: 'home', lobby: profile.lobby
}), false, 'Homepage presence cannot disclose a lobby.');
assert.equal(isGatewayClientMessage({
  type: 'FRIEND_MESSAGE_SEND', clientMessageId: 'message-too-long', accountId: profile.accountId,
  message: '😀'.repeat(301)
}), false);
assert.equal(isGatewayClientMessage({
  type: 'SOCIAL_PROFILE_STATUS_SET', requestId: 'status-too-long', challengeId: null, text: 'x'.repeat(81)
}), false);

assert.equal(isGatewayServerMessage({
  type: 'SOCIAL_SNAPSHOT',
  requestId: null,
  revision: 3,
  preferences,
  statusChallengeId: null,
  statusText: '',
  friends: [profile],
  requests: [{
    friendRequestId: 'friend-request-1', direction: 'incoming', status: 'ignored', profile,
    createdAt: 1_800_000_000_000
  }]
}), true);
assert.equal(isGatewayServerMessage({
  type: 'FRIEND_SEARCH_RESULT', requestId: 'search-1', profile, relationship: 'friend', canUnblock: false
}), true);
assert.equal(isGatewayServerMessage({
  type: 'SOCIAL_EVENT', eventId: 'social-event-1', kind: 'friend-message-received', profile,
  friendRequestId: null, clientMessageId: 'message-1', message: 'Hello!', inviteId: null,
  inviteToken: null, format: null, occurredAt: 1_800_000_000_001
}), true);

const invalidProfile = { ...profile, lobby: { ...profile.lobby!, playerCount: 9, maxPlayers: 8 } };
assert.equal(isGatewayServerMessage({
  type: 'FRIEND_SEARCH_RESULT', requestId: 'search-invalid', profile: invalidProfile, relationship: 'none', canUnblock: false
}), false);

assert.equal(isGatewayServerMessage({
  type: 'FRIEND_SEARCH_RESULT', requestId: 'search-missing-unblock', profile, relationship: 'blocked'
}), false, 'Contract v18 requires an explicit privacy-safe unblock capability flag.');

console.log('Gateway Contract v18 Social message guards passed.');
