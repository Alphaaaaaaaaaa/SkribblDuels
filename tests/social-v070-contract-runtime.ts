import * as assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { GATEWAY_CONTRACT_VERSION, isGatewayClientMessage, isGatewayServerMessage, compareSocialFriends,
  type GatewayClientMessage, type GatewayFriendChatMessage, type GatewayServerMessage } from '@skribbl-duels/gateway-contracts';
import { SocketIoGatewayClient, type GatewayConnectionSnapshot } from '@skribbl-duels/gateway-client';
import { socialPresenceReport } from '../apps/telemetry-inspector/src/socialLobbyPresence';
import { SOCIAL_EMOJIS } from '../apps/telemetry-inspector/src/socialEmojis';

assert.equal(GATEWAY_CONTRACT_VERSION, 17);
const stored: GatewayFriendChatMessage = { messageId: 'message-1', clientMessageId: 'friend-message-1', sequence: 1, senderId: 'self', recipientId: 'friend', message: 'Hello :slot/heart:', occurredAt: Date.now(), readAt: null };
const newCommands: GatewayClientMessage[] = [
  { type: 'SOCIAL_PROFILE_STATS_SET', requestId: 'social-profile-stats-1', stats: [{ id: 'duel-wins', value: '3' }, { id: 'best-public-score', value: '3,400' }] },
  { type: 'FRIEND_PROFILE_GET', requestId: 'friend-profile-1', accountId: 'friend' },
  { type: 'FRIEND_CHAT_HISTORY_GET', requestId: 'friend-history-1', accountId: 'friend', beforeSequence: null },
  { type: 'FRIEND_CHAT_READ', requestId: 'friend-read-1', accountId: 'friend', throughSequence: 200 }
];
for (const command of newCommands) assert.equal(isGatewayClientMessage(command), true);
for (const command of [
  { ...newCommands[0], stats: [{ id: 'not-a-stat', value: '1' }] },
  { ...newCommands[0], stats: [{ id: 'duel-wins', value: '1' }, { id: 'duel-wins', value: '2' }] },
  { ...newCommands[0], stats: [{ id: 'duel-wins', value: 'x'.repeat(65) }] },
  { ...newCommands[2], beforeSequence: -1 },
  { ...newCommands[3], throughSequence: 1.5 },
  { ...newCommands[3], throughSequence: Number.MAX_SAFE_INTEGER + 1 }
]) assert.equal(isGatewayClientMessage(command), false, 'Malformed Social commands must be rejected.');
const frames: GatewayServerMessage[] = [
  { type: 'FRIEND_CHAT_HISTORY', requestId: 'friend-history-1', accountId: 'friend', messages: [stored], nextBeforeSequence: null },
  { type: 'FRIEND_CHAT_INBOX', requestId: null, unread: [{ accountId: 'friend', count: 3 }] },
  { type: 'FRIEND_PROFILE', requestId: 'friend-profile-1', profile: null, relationship: 'none', canUnblock: false, pinnedStats: [] }
];
for (const frame of frames) assert.equal(isGatewayServerMessage(frame), true);
for (const frame of [
  { ...frames[0], messages: [{ ...stored, sequence: 0 }] },
  { ...frames[0], messages: [{ ...stored, senderId: stored.recipientId }] },
  { ...frames[0], messages: [{ ...stored, message: '😀'.repeat(301) }] },
  { ...frames[0], messages: Array.from({ length: 201 }, () => stored) },
  { ...frames[0], nextBeforeSequence: 0 },
  { ...frames[1], unread: [{ accountId: 'friend', count: -1 }] },
  { ...frames[2], pinnedStats: [{ id: 'unknown', value: '1' }] }
]) assert.equal(isGatewayServerMessage(frame), false);

const partial = { hydrated: true, active: true, lobbyId: 'public-room', lobbyType: 0, languageName: 'English', playerCount: 7, maxPlayers: 0 };
const presence = socialPresenceReport(partial);
assert.equal(presence.page, 'lobby'); assert.equal(presence.lobby?.maxPlayers, 8);
assert.equal(isGatewayClientMessage({ type: 'SOCIAL_PRESENCE_SET', requestId: 'social-presence-1', ...presence }), true, 'Unset public-lobby capacity must not reject a real multi-player presence report.');
const attachedLate = socialPresenceReport({ ...partial, hydrated: false, active: true, lobbyId: null, maxPlayers: null });
assert.equal(attachedLate.page, 'lobby'); assert.equal(attachedLate.lobby?.lobbyId, null);
assert.equal(isGatewayClientMessage({ type: 'SOCIAL_PRESENCE_SET', requestId: 'social-presence-2', ...attachedLate }), true, 'A visible game may show playing before initial metadata is recovered.');
assert.deepEqual(socialPresenceReport({ ...partial, active: false }), { page: 'home', lobby: null }, 'Leaving the game clears playing even with stale hydrated metadata.');
const oversized = socialPresenceReport({ ...partial, playerCount: 30, maxPlayers: 4 });
assert.equal(oversized.lobby?.maxPlayers, 30);

const sorted = [
  { accountId: 'off', displayName: 'A', pinned: false, presence: 'offline' },
  { accountId: 'idle', displayName: 'A', pinned: false, presence: 'idle' },
  { accountId: 'online', displayName: 'A', pinned: false, presence: 'online' },
  { accountId: 'duel', displayName: 'A', pinned: false, presence: 'duel' },
  { accountId: 'pin', displayName: 'A', pinned: true, presence: 'offline' }
].sort(compareSocialFriends);
assert.deepEqual(sorted.map(friend => friend.accountId), ['pin', 'duel', 'online', 'idle', 'off']);

// Check the actual file selection independently of generated arrays and asset count.
const excluded = ['best-guess-time.gif', 'challenges-completed.gif', 'drawing-effectiveness.gif', 'drawing-reactions.png', 'drawing-rounds.gif', 'drawing-round-score.gif', 'first-guesser-rate.gif', 'guess-accuracy.gif', 'guess-attempts.gif', 'longest-session.gif', 'observed-play-time.gif', 'p90-guess-time.gif', 'play-days.gif', 'play-day-streak.gif', 'skribbl-win-rate.gif', 'skribbl-wins.gif', 'skribbl-win-streak.gif', 'submitted-messages.gif'];
const expected = [
  ...(await readdir('res/challenge-icons')).filter(file => /\.(gif|png)$/.test(file) && file !== 'one-line.gif').map(file => `res/challenge-icons/${file}`),
  ...['block.gif', 'friends-list.gif', 'ping.gif'].map(file => `res/friend-system/${file}`),
  ...['correct.gif', 'incorrect.gif', 'semicorrect.gif', 'skribbl-coin.gif'].map(file => `res/skribble-icons/${file}`),
  ...['7.gif', 'eraser.gif', 'heart.gif'].map(file => `res/skribbl-slots/slot-icons/${file}`),
  ...(await readdir('res/stat-icons')).filter(file => /\.(gif|png)$/.test(file) && !excluded.includes(file)).map(file => `res/stat-icons/${file}`)
];
assert.deepEqual(SOCIAL_EMOJIS.map(emoji => emoji.path).sort(), expected.sort());
assert.equal(new Set(SOCIAL_EMOJIS.map(emoji => emoji.token)).size, SOCIAL_EMOJIS.length);
assert.ok(SOCIAL_EMOJIS.every(emoji => emoji.source.startsWith('data:image/')), 'Every selected emoji is embedded and available offline.');
assert.ok((await readFile('res/friend-system/friend-add.gif')).subarray(0, 3).equals(Buffer.from('GIF')));
const product = await readFile('apps/telemetry-inspector/src/duelProductUi.ts', 'utf8');
assert.match(product, /\.scd-settings-tabs \.scd-tab\.active \{ background:#53e237; \}/);
assert.match(product, /\.scd-settings-tabs \.scd-tab\.active:hover:not\(:disabled\) \{ background:#38c41c; \}/);
assert.match(product, /this\.socialUi\.openProfile\(accountId\)/, 'Other Duel participant avatars open a profile.');

const client = new SocketIoGatewayClient({ endpoint: null, clientVersion: 'test', capabilities: ['skribbl-telemetry'] });
type Internals = { state: GatewayConnectionSnapshot; receive(frame: unknown): void; socket: { connected: boolean; emit(event: string, frame: GatewayClientMessage): void } };
const internals = client as unknown as Internals;
internals.state = { ...client.getState(), status: 'connected', connectionId: 'connection-1', socialError: { type: 'ERROR', code: 'SOCIAL_ACTION_FAILED', message: 'Previous retry failed', requestId: stored.clientMessageId, recoverable: true } };
const emitted: GatewayClientMessage[] = [];
internals.socket = { connected: true, emit(_event, frame) { emitted.push(frame); } };
client.sendFriendMessage('friend', stored.message, stored.clientMessageId);
assert.equal(client.getState().socialError, null, 'Retry clears the previous same-ID error so a new rejection can be shown.');
assert.deepEqual(emitted[0], { type: 'FRIEND_MESSAGE_SEND', clientMessageId: stored.clientMessageId, accountId: 'friend', message: stored.message });
for (const frame of frames) internals.receive(frame);
assert.deepEqual(client.getState().friendChatHistory, frames[0]);
assert.deepEqual(client.getState().friendInbox, frames[1]);
assert.deepEqual(client.getState().friendProfile, frames[2]);
assert.equal(client.getState().error, null);
console.log(`Contract v17, partial-lobby presence, sorting, ${SOCIAL_EMOJIS.length} exact emojis, participant profiles and client frame routing passed.`);
