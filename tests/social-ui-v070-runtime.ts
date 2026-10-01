import * as assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { SocketIoGatewayClient, type GatewayConnectionSnapshot } from '@skribbl-duels/gateway-client';
import type { GatewayFriendChatMessage, GatewaySocialEventMessage, GatewaySocialProfile } from '@skribbl-duels/gateway-contracts';
import { DuelProductFoundation } from '../apps/telemetry-inspector/src/duelProductUi';
import { SocialFeatureUi } from '../apps/telemetry-inspector/src/socialUi';
import { SOCIAL_EMOJIS, appendSocialMessage } from '../apps/telemetry-inspector/src/socialEmojis';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://skribbl.io/', pretendToBeVisual: true });
const window = dom.window;
for (const key of ['window', 'document', 'localStorage', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'CustomEvent', 'KeyboardEvent', 'Event']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : (window as unknown as Record<string, unknown>)[key] });
}
const document = window.document;
const timers = new Map<number, { callback: () => void; delay: number }>();
let nextTimer = 1;
window.setTimeout = ((callback: () => void, delay = 0) => { const id = nextTimer++; timers.set(id, { callback, delay }); return id; }) as typeof window.setTimeout;
window.clearTimeout = id => { if (id !== undefined) timers.delete(id); };
const polls: Array<() => void> = [];
window.setInterval = ((callback: () => void) => { polls.push(callback); return 1; }) as typeof window.setInterval;
window.clearInterval = () => {};
const flush = (delay: number): void => {
  for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.callback(); }
};

const profile = (accountId: string, presence: GatewaySocialProfile['presence'], pinned = false): GatewaySocialProfile => ({
  accountId, displayName: accountId, discordUsername: accountId.toLowerCase(), avatarSource: 'skribbl', avatarUrl: null,
  skribblAvatar: [0, 1, 2, -1], specialAvatarId: null, invisibleAvatarEntitled: false, nameColorIndex: 26,
  statusChallengeId: 'quickscope', statusText: `${accountId}'s chosen status`, presence,
  lastSeenAt: null, activity: presence === 'offline' ? null : 'lobby', lobby: null, canJoinLobby: false, pinned
});
const friends = [profile('Offline', 'offline'), profile('Idle', 'idle'), profile('Bravo', 'online'), profile('Duel', 'duel'), profile('Pinned', 'offline', true)];
const preferences = { availability: 'online', profileStatusVisibility: 'everyone', lobbyStatusVisibility: 'friends', lobbyJoinMode: 'public', receiveFriendRequests: true, receiveMatchInvites: true } as const;
const realClient = new SocketIoGatewayClient({ endpoint: null, clientVersion: 'test', capabilities: ['skribbl-telemetry'] });
let state: GatewayConnectionSnapshot = {
  ...realClient.getState(), status: 'connected', connectionId: 'connection-1',
  identity: { accountId: 'Self', displayName: 'Self', discordUserId: '1', discordUsername: 'self', avatarSource: 'skribbl', avatarUrl: null,
    skribblAvatar: [0, 1, 2, -1], specialAvatarId: null, invisibleAvatarEntitled: false, preferredLanguage: 'en', nameColorIndex: 26 },
  social: { type: 'SOCIAL_SNAPSHOT', requestId: null, revision: 1, preferences, statusChallengeId: null, statusText: '', friends, requests: [] }
};
let homepage = true;
let request = 1;
let failSend = false;
const historyRequests: Array<{ requestId: string; accountId: string; before: number | null }> = [];
const profileRequests: Array<{ requestId: string; accountId: string }> = [];
const presenceRequests: Array<{ requestId: string; page: string; lobby: unknown }> = [];
const pins: Array<{ requestId: string; accountId: string; pinned: boolean }> = [];
const sends: Array<{ accountId: string; message: string; clientMessageId: string }> = [];
const reads: Array<{ accountId: string; through: number }> = [];
const adds: string[] = [];
const toasts: string[] = [];
const fakeGateway = {
  setSocialPresence(page: string, lobby: unknown) { const requestId = `social-presence-${request++}`; presenceRequests.push({ requestId, page, lobby }); return requestId; },
  setSocialPinnedStats() { return `social-profile-stats-${request++}`; },
  getFriendChatHistory(accountId: string, before: number | null) { const requestId = `friend-history-${request++}`; historyRequests.push({ requestId, accountId, before }); return requestId; },
  getFriendProfile(accountId: string) { const requestId = `friend-profile-${request++}`; profileRequests.push({ requestId, accountId }); return requestId; },
  sendFriendMessage(accountId: string, message: string, clientMessageId: string) { if (failSend) throw new Error('Disconnected'); sends.push({ accountId, message, clientMessageId }); return clientMessageId; },
  markFriendChatRead(accountId: string, through: number) { reads.push({ accountId, through }); return `friend-read-${request++}`; },
  setFriendPinned(accountId: string, pinned: boolean) { const requestId = `friend-pin-${request++}`; pins.push({ requestId, accountId, pinned }); return requestId; },
  sendFriendRequest(accountId: string) { adds.push(accountId); return `friend-request-${request++}`; },
  setSocialPreferences() { return `social-preferences-${request++}`; }
} as unknown as SocketIoGatewayClient;
localStorage.setItem('skribblDuelsSocialUiV1', JSON.stringify({ version: 1, showHomepageList: false, homepageAnchor: 'top-left' }));
const ui = new SocialFeatureUi({
  runtimeId: 'ui-test', gateway: fakeGateway, getGatewayState: () => state,
  getLobbySnapshot: () => ({ hydrated: true, active: !homepage, lobbyId: 'room-1', lobbyType: 0, languageName: 'English', playerCount: 7, maxPlayers: 0 }),
  getPinnedStats: () => [{ id: 'duel-wins', value: '5' }, { id: 'best-public-score', value: '3,100' }],
  isHomepageVisible: () => homepage,
  createAvatar(person, className) { const avatar = document.createElement('div'); avatar.className = className; avatar.textContent = 'Avatar'; avatar.dataset.accountId = person.accountId; return avatar; },
  createStatusIcon(id) { const icon = document.createElement('span'); icon.className = 'scd-icon'; icon.dataset.challengeId = id; return icon; },
  registerTooltip(target, title) { target.title = title; }, registerOverflowTooltip(target, title) { target.title = title; },
  showToast(title, message) { toasts.push(`${title}: ${message}`); }, onModalVisibilityChanged() {}
});
const update = (patch: Partial<GatewayConnectionSnapshot>): void => { const previous = state; state = structuredClone({ ...state, ...patch }); ui.handleGatewayUpdate(previous, state); };
const find = <T extends Element = HTMLElement>(selector: string): T => { const result = document.querySelector<T>(selector); assert.ok(result, `Missing ${selector}`); return result; };
const listNames = () => [...document.querySelectorAll('.scd-home-friend .scd-social-name')].map(node => node.textContent);
const row = (accountId: string) => [...document.querySelectorAll<HTMLElement>('.scd-home-friend')].find(node => node.querySelector('.scd-social-name')?.textContent === accountId)!;
const openChat = (accountId: string) => { const button = row(accountId).querySelector<HTMLButtonElement>('[title="Open Quick Messages"]'); assert.ok(button); button.click(); };
const message = (id: string, sequence: number, incoming: boolean, text: string, accountId = 'Bravo'): GatewayFriendChatMessage => ({
  messageId: `stored-${id}`, clientMessageId: id, sequence, senderId: incoming ? accountId : 'Self', recipientId: incoming ? 'Self' : accountId,
  message: text, occurredAt: Date.now() + sequence, readAt: null
});
const event = (entry: GatewayFriendChatMessage, person = friends.find(friend => friend.accountId === 'Bravo')!): GatewaySocialEventMessage => ({
  type: 'SOCIAL_EVENT', eventId: `event-${entry.messageId}`, kind: entry.senderId === 'Self' ? 'friend-message-sent' : 'friend-message-received',
  profile: person, friendRequestId: null, clientMessageId: entry.clientMessageId, message: entry.message, chatMessage: entry,
  inviteId: null, inviteToken: null, format: null, occurredAt: entry.occurredAt
});
const deliver = (entry: GatewayFriendChatMessage, person?: GatewaySocialProfile) => update({ socialEvents: [...state.socialEvents, event(entry, person)] });

ui.start();
try {
  assert.equal(document.querySelector('.scd-home-friends'), null, 'Legacy disabled homepage list migrates to Never.');
  const settings = document.createElement('div'); ui.renderSettings(settings); document.body.append(settings);
  const mode = [...settings.querySelectorAll('select')].find(select => select.parentElement?.textContent?.startsWith('Show friends list'))!;
  assert.deepEqual([...mode.options].map(option => option.text), ['Always', 'Homepage', 'Never']);
  const choose = (value: string) => { mode.value = value; mode.dispatchEvent(new window.Event('change')); };
  choose('always');
  assert.deepEqual(listNames(), ['Pinned', 'Duel', 'Bravo', 'Idle', 'Offline']);
  homepage = false; polls[0]!(); assert.ok(document.querySelector('.scd-home-friends'), 'Always also shows while playing.');
  choose('homepage'); assert.equal(document.querySelector('.scd-home-friends'), null);
  homepage = true; polls[0]!(); assert.ok(document.querySelector('.scd-home-friends'));
  choose('never'); assert.equal(document.querySelector('.scd-home-friends'), null); choose('always');
  assert.equal(JSON.parse(localStorage.getItem('skribblDuelsSocialUiV1')!).showFriendsList, 'always');

  assert.equal(document.querySelector('.scd-home-friends .scd-social-pin'), null, 'Homepage pin controls are absent.');
  ui.openFriends();
  const friendModalRow = (id: string) => [...document.querySelectorAll<HTMLElement>('.scd-social-row')].find(node => node.querySelector('.scd-social-name')?.textContent === id)!;
  const idlePin = friendModalRow('Idle').querySelector<HTMLButtonElement>('.scd-social-pin')!;
  assert.equal(window.getComputedStyle(idlePin).opacity, '0.6');
  assert.equal(window.getComputedStyle(idlePin).top, '-7px');
  assert.equal(window.getComputedStyle(idlePin).right, '-5px');
  idlePin.click(); assert.equal(listNames()[0], 'Idle', 'Pinning sorts immediately before the server ACK.');
  assert.equal(window.getComputedStyle(friendModalRow('Idle').querySelector('.scd-social-pin')!).opacity, '1');
  update({ socialError: { type: 'ERROR', requestId: pins.at(-1)!.requestId, code: 'SOCIAL_ACTION_FAILED', message: 'Try again', recoverable: true } });
  assert.deepEqual(listNames(), ['Pinned', 'Duel', 'Bravo', 'Idle', 'Offline'], 'A rejected pin restores authoritative ordering.');
  update({ socialError: null }); ui.closeModals();

  update({ friendInbox: { type: 'FRIEND_CHAT_INBOX', requestId: null, unread: [{ accountId: 'Offline', count: 2 }] } });
  assert.ok(row('Offline').querySelector('.scd-social-icon-button.unread'), 'Offline messages restore the ping indicator on reconnect.');
  openChat('Offline'); assert.equal(find<HTMLInputElement>('[data-scd-friend-message-input]').disabled, false, 'Offline friends can receive messages.');
  assert.equal(row('Offline').querySelector('.unread'), null);
  openChat('Bravo'); await Promise.resolve();
  const input = find<HTMLInputElement>('[data-scd-friend-message-input]');
  const form = find<HTMLFormElement>('.scd-social-message-form');
  const header = find('.scd-social-detail-header');
  assert.ok(header.textContent?.includes("Bravo's chosen status"));
  assert.equal(header.querySelector('.scd-social-lobby'), null, 'The Quick Messages header shows profile status below the name.');
  assert.equal(header.textContent?.includes('Quick Messages ·'), false);
  input.value = 'Hello immediately'; input.dispatchEvent(new window.Event('input')); form.requestSubmit();
  assert.equal(find('.scd-social-message.outgoing.pending .scd-social-message-text').textContent, 'Hello immediately');
  assert.equal(input.value, '');
  const outgoing = sends.at(-1)!;
  deliver(message(outgoing.clientMessageId, 1, false, outgoing.message));
  assert.equal(document.querySelectorAll('.scd-social-message.outgoing').length, 1, 'The ACK replaces the optimistic row.');
  assert.equal(document.querySelector('.scd-social-message.pending'), null);
  input.value = 'Preserve my draft'; input.dispatchEvent(new window.Event('input')); input.focus(); input.setSelectionRange(7, 7);
  deliver(message('incoming-1', 2, true, 'A live reply'));
  assert.ok(find('.scd-social-message-history').textContent?.includes('A live reply'));
  assert.equal(find<HTMLInputElement>('[data-scd-friend-message-input]'), input, 'Incoming messages preserve the form DOM.');
  assert.equal(document.activeElement, input); assert.equal(input.value, 'Preserve my draft'); assert.equal(input.selectionStart, 7);
  flush(250); assert.deepEqual(reads.at(-1), { accountId: 'Bravo', through: 2 });

  const historyRequest = historyRequests.at(-1)!;
  update({ friendChatHistory: { type: 'FRIEND_CHAT_HISTORY', requestId: historyRequest.requestId, accountId: 'Bravo', messages: [message(outgoing.clientMessageId, 1, false, outgoing.message), message('incoming-1', 2, true, 'A live reply')], nextBeforeSequence: 1 } });
  assert.equal(document.querySelectorAll('.scd-social-message').length, 2, 'History does not duplicate live or optimistic messages.');
  find<HTMLButtonElement>('.scd-social-load-history').click(); assert.equal(historyRequests.at(-1)?.before, 1);
  const older = historyRequests.at(-1)!;
  update({ friendChatHistory: { type: 'FRIEND_CHAT_HISTORY', requestId: older.requestId, accountId: 'Bravo', messages: [message('older', 0, true, 'Earlier message')], nextBeforeSequence: null } });
  assert.ok(find('.scd-social-message-history').textContent?.includes('Earlier message'));
  assert.equal(find<HTMLButtonElement>('.scd-social-load-history').hidden, true);

  const toggle = find<HTMLButtonElement>('.scd-social-emoji-toggle');
  assert.equal(toggle.nextElementSibling?.textContent, 'Send', 'Slimy sits immediately to the left of Send.');
  toggle.click(); assert.equal(find<HTMLElement>('.scd-social-emoji-picker').hidden, false);
  assert.equal(document.querySelectorAll('.scd-social-emoji-choice').length, 132);
  input.value = 'Before after'; input.setSelectionRange(7, 7); find<HTMLButtonElement>('.scd-social-emoji-choice').click();
  assert.ok(input.value.includes(SOCIAL_EMOJIS[0]!.token)); assert.ok(input.value.endsWith('after'));
  form.requestSubmit(); assert.ok(document.querySelector('.scd-social-message.outgoing img.scd-social-emoji'));

  failSend = true; input.value = 'Retryable message'; form.requestSubmit();
  assert.ok(document.querySelector('.scd-social-message.failed'));
  const failedId = find<HTMLElement>('.scd-social-message.failed').dataset.messageId;
  failSend = false; find<HTMLButtonElement>('.scd-social-message-retry').click();
  assert.equal(sends.at(-1)?.clientMessageId, failedId, 'Retry uses the same idempotency identifier.');
  deliver(message(failedId!, 3, false, 'Retryable message'));
  assert.equal(document.querySelectorAll('.scd-social-message.failed').length, 0);

  let skribblKeys = 0; const pageKey = () => { skribblKeys++; }; document.addEventListener('keydown', pageKey);
  input.value = 'Sent by Enter'; input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(sends.at(-1)?.message, 'Sent by Enter'); assert.equal(skribblKeys, 0, 'Quick Messages keys must not reach the Skribbl game.');
  document.removeEventListener('keydown', pageKey);
  ui.closeModals(); openChat('Bravo');
  const reopened = find<HTMLInputElement>('[data-scd-friend-message-input]'); reopened.value = 'Draft to preserve'; reopened.dispatchEvent(new window.Event('input'));
  ui.closeModals(); openChat('Bravo'); assert.equal(find<HTMLInputElement>('[data-scd-friend-message-input]').value, 'Draft to preserve');

  const malicious = document.createElement('span'); appendSocialMessage(malicious, '<img src=x onerror=alert(1)> :slot/heart: :unknown/anything:');
  assert.equal(malicious.querySelectorAll('img').length, 1); assert.ok(malicious.textContent?.includes('<img src=x onerror=alert(1)>'));

  // Existing Versus and result avatars use the same live profile-card path.
  const product = Object.create(DuelProductFoundation.prototype) as {
    gatewayState: GatewayConnectionSnapshot; socialUi: SocialFeatureUi; tooltips: { register(target: HTMLElement, title: string): void };
    createParticipantAvatar(name: string, person: { accountId: string; avatarSource: 'discord'; avatarUrl: null; skribblAvatar: null }): HTMLDivElement;
  };
  product.gatewayState = state; product.socialUi = ui; product.tooltips = { register(target, title) { target.title = title; } };
  const versusAvatar = product.createParticipantAvatar('Bravo', { accountId: 'Bravo', avatarSource: 'discord', avatarUrl: null, skribblAvatar: null });
  document.body.appendChild(versusAvatar); versusAvatar.click(); assert.equal(profileRequests.at(-1)?.accountId, 'Bravo');
  versusAvatar.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(profileRequests.at(-1)?.accountId, 'Bravo');

  ui.closeModals(); row('Bravo').querySelector<HTMLButtonElement>('.scd-social-avatar-wrap')!.click();
  assert.equal(profileRequests.at(-1)?.accountId, 'Bravo');
  const response = { type: 'FRIEND_PROFILE' as const, requestId: profileRequests.at(-1)!.requestId, profile: friends.find(friend => friend.accountId === 'Bravo')!, relationship: 'friend' as const,
    canUnblock: false, pinnedStats: [{ id: 'duel-wins', value: '5' }, { id: 'best-public-score', value: '3,100' }] };
  update({ friendProfile: response });
  assert.equal(document.querySelectorAll('.scd-social-public-stat').length, 2);
  assert.equal(window.getComputedStyle(find('.scd-social-stat-icon')).gridRow, '1/3', 'Pinned stat icons span both the label and value rows.');
  assert.ok(find('.scd-social-profile-card').textContent?.includes("Bravo's chosen status"));
  assert.ok(find('.scd-social-profile-card').querySelector('[aria-label="Online"]'));
  assert.ok(find('.scd-social-profile-friend-action').querySelector('[aria-label="Already friends"]'));
  ui.openProfile('NewPlayer', profile('NewPlayer', 'idle'));
  update({ friendProfile: { ...response, requestId: profileRequests.at(-1)!.requestId, profile: profile('NewPlayer', 'idle'), relationship: 'none' } });
  assert.ok(find('.scd-social-profile-friend-action').querySelector('[aria-label="Send friend request"]'));
  find<HTMLButtonElement>('.scd-social-profile-friend-action').click(); assert.equal(adds.at(-1), 'NewPlayer');

  ui.closeModals(); deliver(message('toast', 4, true, 'Reply later'));
  const toast = find('.scd-social-toast'); assert.equal(toast.classList.contains('closing'), false);
  flush(3500); assert.ok(toast.classList.contains('closing')); flush(150); assert.equal(toast.isConnected, false, 'Action toasts expire automatically.');
  const presence = presenceRequests[0]!;
  update({ social: { ...state.social!, requestId: presence.requestId } }); homepage = false; polls[0]!();
  const lastPresence = presenceRequests.at(-1)!;
  update({ socialError: { type: 'ERROR', code: 'SOCIAL_ACTION_FAILED', requestId: lastPresence.requestId, message: 'Rejected report', recoverable: true } });
  const beforeRetry = presenceRequests.length; polls[0]!(); assert.equal(presenceRequests.length, beforeRetry + 1, 'Rejected presence must retry rather than cache a false Homepage report.');

  ui.closeModals(); openChat('Bravo');
  const pendingInput = find<HTMLInputElement>('[data-scd-friend-message-input]'); pendingInput.value = 'Waiting for ACK';
  find<HTMLFormElement>('.scd-social-message-form').requestSubmit();
  update({ status: 'connecting' });
  assert.equal(pendingInput.disabled, true); assert.ok(document.querySelector('.scd-social-message.failed'));
  update({ status: 'connected', socialError: null }); assert.equal(pendingInput.disabled, false);

  // Switching accounts must clear drafts, history requests and old unread state.
  update({ identity: { ...state.identity!, accountId: 'OtherSelf' }, social: { ...state.social!, requestId: null } });
  openChat('Bravo'); assert.equal(find<HTMLInputElement>('[data-scd-friend-message-input]').value, '');
  console.log('Social DOM: live optimistic chat, drafts, emoji safety, offline pings, profiles, ordering, pin rollback, timers and presence retry passed.');
} finally {
  ui.stop(); dom.window.close();
}
