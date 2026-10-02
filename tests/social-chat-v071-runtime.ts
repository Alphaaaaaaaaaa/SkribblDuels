import * as assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { SocketIoGatewayClient, type GatewayConnectionSnapshot } from '@skribbl-duels/gateway-client';
import { isGatewayClientMessage, isGatewayServerMessage, type GatewayFriendChatMessage, type GatewaySocialEventMessage, type GatewaySocialPreferences, type GatewaySocialProfile } from '@skribbl-duels/gateway-contracts';
import { SocialFeatureUi } from '../apps/telemetry-inspector/src/socialUi';

const dom = new JSDOM('<!doctype html><html><head></head><body data-typo_loaded="true"></body></html>', { url: 'https://skribbl.io', pretendToBeVisual: true });
const window = dom.window; const document = window.document;
for (const key of ['window', 'document', 'localStorage', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'CustomEvent', 'KeyboardEvent', 'Event']) Object.defineProperty(globalThis, key, {
  configurable: true, value: key === 'window' ? window : (window as unknown as Record<string, unknown>)[key]
});
let now = 1_800_000_000_000; const realNow = Date.now; Date.now = () => now;
const timers = new Map<number, { callback: () => void; delay: number }>(); let timerId = 0;
window.setTimeout = ((callback: () => void, delay = 0) => { timers.set(++timerId, { callback, delay }); return timerId; }) as typeof window.setTimeout;
window.clearTimeout = id => { if (id !== undefined) timers.delete(id); };
window.setInterval = (() => 1) as typeof window.setInterval; window.clearInterval = () => {};
const friend: GatewaySocialProfile = {
  accountId: 'Friend', displayName: 'Friend', discordUsername: 'friend', avatarSource: 'skribbl', avatarUrl: null,
  skribblAvatar: [0, 1, 2, -1], specialAvatarId: null, invisibleAvatarEntitled: false, nameColorIndex: 26,
  statusChallengeId: null, statusText: 'A profile status', presence: 'online', lastSeenAt: null, activity: 'lobby',
  lobby: { lobbyId: 'private-room', lobbyType: 'private', languageName: 'English', playerCount: 3, maxPlayers: 8 }, canJoinLobby: true, pinned: false
};
const client = new SocketIoGatewayClient({ endpoint: null, clientVersion: 'test', capabilities: ['skribbl-telemetry'] });
let state: GatewayConnectionSnapshot = {
  ...client.getState(), status: 'connected', connectionId: 'test',
  identity: { accountId: 'Self', displayName: 'Self', discordUserId: '1', discordUsername: 'self', avatarSource: 'skribbl', avatarUrl: null,
    skribblAvatar: [0, 1, 2, -1], specialAvatarId: null, invisibleAvatarEntitled: false, preferredLanguage: 'en', nameColorIndex: 26 },
  social: { type: 'SOCIAL_SNAPSHOT', requestId: null, revision: 1, preferences: {
    availability: 'online', profileStatusVisibility: 'everyone', lobbyStatusVisibility: 'friends', lobbyJoinMode: 'public', receiveFriendRequests: true, receiveMatchInvites: true
  }, statusChallengeId: null, statusText: '', friends: [friend], requests: [] }
};
let request = 0; const sends: Array<{ clientMessageId: string; message: string }> = [];
const responses: Array<{ inviteId: string; accept: boolean; requestId: string }> = [];
const preferenceChanges: GatewaySocialPreferences[] = [];
const gateway = {
  setSocialPresence() { return `social-presence-${++request}`; },
  getFriendChatHistory() { return `friend-history-${++request}`; },
  markFriendChatRead() { return `friend-read-${++request}`; },
  sendFriendMessage(_id: string, message: string, clientMessageId: string) { sends.push({ message, clientMessageId }); return clientMessageId; },
  respondToFriendMatchInvite(inviteId: string, accept: boolean) { const requestId = `friend-match-response-${++request}`; responses.push({ inviteId, accept, requestId }); return requestId; },
  setSocialPreferences(preferences: GatewaySocialPreferences) { preferenceChanges.push({ ...preferences }); return `social-preferences-${++request}`; }
} as unknown as SocketIoGatewayClient;
const ui = new SocialFeatureUi({ runtimeId: 'v071', gateway, getGatewayState: () => state,
  getLobbySnapshot: () => ({ hydrated: false, active: false, lobbyId: null, lobbyType: null, languageName: 'English', playerCount: 0, maxPlayers: null }), isHomepageVisible: () => true,
  createAvatar(_profile, className) { const node = document.createElement('span'); node.className = className; return node; },
  createStatusIcon() { return document.createElement('span'); }, registerTooltip(target, title) { target.title = title; }, registerOverflowTooltip() {}, showToast() {}, onModalVisibilityChanged() {}
});
const find = <T extends Element = HTMLElement>(selector: string): T => { const target = document.querySelector<T>(selector); assert.ok(target, selector); return target; };
const update = (patch: Partial<GatewayConnectionSnapshot>) => { const previous = state; state = { ...state, ...patch }; ui.handleGatewayUpdate(previous, state); };
let eventId = 0;
const deliver = (event: GatewaySocialEventMessage) => { assert.equal(isGatewayServerMessage(event), true); update({ socialEvents: [...state.socialEvents, event] }); };
const messageEvent = (incoming: boolean, message: string, clientMessageId: string, occurredAt = now): GatewaySocialEventMessage => {
  const chatMessage: GatewayFriendChatMessage = { messageId: `stored-${clientMessageId}`, clientMessageId, sequence: ++eventId,
    senderId: incoming ? 'Friend' : 'Self', recipientId: incoming ? 'Self' : 'Friend', message, occurredAt, readAt: null };
  return { type: 'SOCIAL_EVENT', eventId: `event-${eventId}`, kind: incoming ? 'friend-message-received' : 'friend-message-sent', profile: friend,
    friendRequestId: null, clientMessageId, message, inviteId: null, inviteToken: null, format: null, occurredAt, chatMessage };
};
const inviteEvent = (kind: GatewaySocialEventMessage['kind'], inviteId: string, expiresAt = now + 5000): GatewaySocialEventMessage => ({
  type: 'SOCIAL_EVENT', eventId: `invite-event-${++eventId}`, kind, profile: friend, friendRequestId: null, clientMessageId: null,
  message: null, inviteId, inviteToken: null, format: 'ranked', occurredAt: now, inviteExpiresAt: expiresAt
});
const openChat = () => find<HTMLButtonElement>('.scd-home-friend [title="Open Quick Messages"]').click();
const input = () => find<HTMLInputElement>('[data-scd-friend-message-input]');
const submit = (value: string) => { input().value = value; input().dispatchEvent(new window.Event('input')); find<HTMLFormElement>('.scd-social-message-form').requestSubmit(); now++; };
const ids = () => [...document.querySelectorAll<HTMLElement>('.scd-social-message')].map(node => node.dataset.messageId);
const groups = () => [...document.querySelectorAll<HTMLElement>('.scd-social-message-group')];
const invitation = (id: string) => find<HTMLElement>(`.scd-social-chat-invite[data-invite-id="${id}"]`);
const action = (id: string, label: string) => [...invitation(id).querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === label)!;
ui.start();
try {
  assert.equal(document.querySelector('.scd-home-friends .scd-social-pin'), null);
  const settings = document.createElement('div'); ui.renderSettings(settings); document.body.appendChild(settings);
  const permission = [...settings.querySelectorAll('select')].find(select => select.parentElement?.textContent?.startsWith('Allow friends to join your lobby'))!;
  assert.deepEqual([...permission.options].map(option => option.text), ['Public', 'Always', 'None']);
  for (const mode of ['private', 'none', 'public']) { permission.value = mode; permission.dispatchEvent(new window.Event('change')); }
  assert.deepEqual(preferenceChanges.map(item => item.lobbyJoinMode), ['private', 'none', 'public']);
  for (const mode of ['public', 'private', 'none']) assert.equal(isGatewayClientMessage({ type: 'SOCIAL_PREFERENCES_SET', requestId: 'social-test', preferences: { ...state.social!.preferences, lobbyJoinMode: mode } }), true);
  for (const invalid of [true, false, 'everyone', null]) assert.equal(isGatewayClientMessage({ type: 'SOCIAL_PREFERENCES_SET', requestId: 'social-test', preferences: { ...state.social!.preferences, lobbyJoinMode: invalid } }), false);
  let joined: unknown; document.addEventListener('joinLobby', event => { joined = (event as CustomEvent).detail; });
  find<HTMLButtonElement>('.scd-home-friend [title="Join private lobby"]').click(); assert.equal(joined, 'private-room');

  openChat(); await Promise.resolve();
  submit('First'); submit('Second'); submit('Third');
  const expected = sends.map(item => item.clientMessageId); assert.deepEqual(ids(), expected); assert.equal(groups().length, 1);
  assert.equal(document.querySelectorAll('.scd-social-message-author').length, 1);
  deliver(messageEvent(false, sends[1]!.message, sends[1]!.clientMessageId, now + 400_000));
  deliver(messageEvent(false, sends[0]!.message, sends[0]!.clientMessageId, now + 500_000));
  assert.deepEqual(ids(), expected, 'Reversed server ACKs keep earlier messages above later pending messages.');
  assert.equal(groups().length, 1, 'Server timestamps do not split or move an optimistic message group.');
  assert.equal(document.querySelectorAll('.scd-social-message.pending').length, 1);
  deliver(messageEvent(true, 'Hello https://example.com!', 'incoming-1'));
  now += 1000; deliver(messageEvent(true, 'Another reply', 'incoming-2')); assert.equal(groups().length, 2);
  assert.equal(document.querySelectorAll('.scd-social-message-author').length, 2);
  now += 120_001; deliver(messageEvent(true, 'After a break', 'incoming-3')); assert.equal(groups().length, 3);
  submit('Reply'); assert.equal(groups().length, 4, 'A different sender breaks the group.');
  assert.equal(find<HTMLAnchorElement>('.scd-social-message-history a').href, 'https://example.com/');

  input().focus(); const toggle = find<HTMLButtonElement>('.scd-social-emoji-toggle');
  const press = (repeat = false) => { const key = new window.KeyboardEvent('keydown', { key: 'e', ctrlKey: true, repeat, bubbles: true, cancelable: true }); input().dispatchEvent(key); assert.equal(key.defaultPrevented, true); };
  press(); assert.equal(find<HTMLElement>('.scd-social-emoji-picker').hidden, false); assert.equal(document.activeElement, input());
  press(true); assert.equal(find<HTMLElement>('.scd-social-emoji-picker').hidden, false);
  press(); assert.equal(find<HTMLElement>('.scd-social-emoji-picker').hidden, true);
  toggle.click();
  const choice = find<HTMLButtonElement>('[data-emoji-token=":heart:"]');
  choice.dispatchEvent(new window.MouseEvent('click', { bubbles: true, shiftKey: true }));
  assert.equal(input().value, ':heart:'); assert.equal(find<HTMLElement>('.scd-social-emoji-picker').hidden, false);
  assert.equal(find('.scd-social-message-count').textContent, '7');
  choice.click(); assert.equal(input().value, ':heart::heart:'); assert.equal(find<HTMLElement>('.scd-social-emoji-picker').hidden, true);
  assert.equal(find('.scd-social-message-count').textContent, '14');
  find<HTMLFormElement>('.scd-social-message-form').requestSubmit();
  assert.equal(document.querySelectorAll('.scd-social-emoji-only .scd-social-emoji').length, 2);
  assert.equal(window.getComputedStyle(find('.scd-social-emoji-only .scd-social-emoji')).width, '52px');
  assert.equal(find('.scd-social-message-count').classList.contains('visible'), false);
  input().value = '😀'.repeat(301); input().dispatchEvent(new window.Event('input'));
  assert.equal(Array.from(input().value).length, 300); assert.equal(find('.scd-social-message-count').textContent, '300');
  ui.closeModals(); openChat(); assert.equal(find('.scd-social-message-count').textContent, '300', 'Draft count survives reopening.');

  deliver(inviteEvent('match-invite-received', 'accept'));
  assert.equal(invitation('accept').dataset.inviteState, 'waiting'); action('accept', 'Accept').click();
  assert.equal(responses.at(-1)?.accept, true); assert.equal(invitation('accept').dataset.inviteState, 'responding');
  assert.ok([...invitation('accept').querySelectorAll('button')].every(button => button.disabled));
  deliver(inviteEvent('match-invite-accepted', 'accept')); assert.equal(invitation('accept').dataset.inviteState, 'accepted'); assert.equal(invitation('accept').querySelector('button'), null);
  deliver(inviteEvent('match-invite-received', 'deny')); action('deny', 'Deny').click(); assert.equal(responses.at(-1)?.accept, false);
  deliver(inviteEvent('match-invite-declined', 'deny')); assert.equal(invitation('deny').textContent, 'Denied');
  deliver(inviteEvent('match-invite-received', 'deny')); assert.equal(invitation('deny').dataset.inviteState, 'declined', 'A replay cannot reopen an answered invitation.');
  deliver(inviteEvent('match-invite-sent', 'sent')); assert.equal(invitation('sent').querySelector('button'), null);
  deliver(inviteEvent('match-invite-cancelled', 'sent')); assert.equal(invitation('sent').dataset.inviteState, 'cancelled');
  deliver(inviteEvent('match-invite-received', 'retry')); action('retry', 'Accept').click();
  update({ socialError: { type: 'ERROR', code: 'INVITE_RECIPIENT_BUSY', message: 'Busy', recoverable: true, requestId: responses.at(-1)!.requestId } });
  assert.equal(invitation('retry').dataset.inviteState, 'waiting'); assert.equal(action('retry', 'Accept').disabled, false);
  action('retry', 'Deny').click();
  update({ socialError: { type: 'ERROR', code: 'FRIEND_MATCH_INVITE_NOT_FOUND', message: 'Gone', recoverable: true, requestId: responses.at(-1)!.requestId } });
  assert.equal(invitation('retry').dataset.inviteState, 'unavailable');
  deliver(inviteEvent('match-invite-received', 'expires')); now += 6000;
  for (const [id, timer] of [...timers]) if (timer.delay > 4000 && timer.delay < 6000) { timers.delete(id); timer.callback(); }
  assert.equal(invitation('expires').dataset.inviteState, 'expired'); assert.equal(invitation('expires').querySelector('button'), null);
  deliver(inviteEvent('match-invite-received', 'reconnect'));
  update({ status: 'connecting' }); assert.equal(invitation('reconnect').dataset.inviteState, 'unavailable');
  update({ status: 'connected' }); assert.equal(invitation('reconnect').querySelector('button'), null);
  deliver(inviteEvent('match-invite-received', 'reconnect')); assert.equal(action('reconnect', 'Accept').disabled, false);
  action('reconnect', 'Accept').click();
  const respondingRequest = responses.at(-1)!.requestId;
  deliver(inviteEvent('match-invite-received', 'reconnect'));
  update({ socialError: { type: 'ERROR', code: 'INVITE_RECIPIENT_BUSY', message: 'Busy', recoverable: true, requestId: respondingRequest } });
  assert.equal(invitation('reconnect').dataset.inviteState, 'waiting', 'An invite replay preserves the in-flight response error correlation.');
  ui.stop(); ui.start(); openChat();
  assert.equal(invitation('reconnect').dataset.inviteState, 'unavailable', 'Cached pending cards need fresh server confirmation after reload.');
  assert.equal(invitation('expires').dataset.inviteState, 'expired', 'Expired cached invitations keep their expired state.');
  deliver(inviteEvent('match-invite-received', 'reconnect')); assert.equal(action('reconnect', 'Deny').disabled, false);
  for (const expiresAt of [-1, NaN, 'tomorrow']) assert.equal(isGatewayServerMessage({ ...inviteEvent('match-invite-received', 'bad'), inviteExpiresAt: expiresAt }), false);

  ui.closeModals(); update({ social: { ...state.social!, friends: [{ ...friend, canJoinLobby: false, lobby: { ...friend.lobby!, lobbyId: null } }] } });
  find<HTMLButtonElement>('.scd-home-friend [title="Lobby joining disabled"]').click();
  const overlay = find('.scd-social-locked-overlay'); const css = window.getComputedStyle(overlay);
  assert.equal(css.position, 'fixed'); assert.equal(css.inset, '0px'); assert.equal(parseFloat(css.width), window.innerWidth); assert.equal(css.height, '100dvh');
  assert.equal(window.getComputedStyle(find('.scd-social-locked-overlay .scd-icon')).filter, 'none');
  const source = find('#skribbl-duels-social-styles').textContent!;
  assert.doesNotMatch(source.match(/@keyframes scd-social-lock-glow\{.*?\}\}/)![0], /transform|scale/);
  assert.ok(source.includes('bottom:calc(100% + 10px)')); assert.ok(source.includes('overflow-x:hidden'));
  console.log('v0.72.0: stable rapid-send ordering, grouping, Ctrl+E/Shift, Unicode counter, live actionable invites, private joining and full-screen lock overlay passed.');
} finally { ui.stop(); Date.now = realNow; dom.window.close(); }
