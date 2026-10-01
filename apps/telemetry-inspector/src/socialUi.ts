import type {
  GatewayFriendRequestSummary,
  GatewayFriendChatMessage,
  GatewayFriendProfileMessage,
  GatewaySocialPinnedStat,
  GatewaySocialEventMessage,
  GatewaySocialAvailability,
  GatewaySocialLobbyPresence,
  GatewaySocialPreferences,
  GatewaySocialProfile
} from '@skribbl-duels/gateway-contracts';
import { type SocketIoGatewayClient, type GatewayConnectionSnapshot } from '@skribbl-duels/gateway-client';
import { EMBEDDED_PROGRESSION_ASSETS, type ProgressionAssetId } from './generatedProgressionAssets';
import { appendColoredDuelName } from './nameColors';
import { compareSocialFriends } from '@skribbl-duels/gateway-contracts';
import { socialPresenceReport, type SocialLobbySnapshot } from './socialLobbyPresence';
import { SOCIAL_EMOJIS, appendSocialMessage } from './socialEmojis';
import { PROFILE_STAT_DEFINITION_BY_ID, DEFAULT_PINNED_PROFILE_STAT_IDS, isProfileStatId } from './profileStats';
import { EMBEDDED_STAT_ICON_ASSETS, STAT_ICON_ASSET_PATHS } from './generatedStatIconAssets';


interface SocialUiOptions {
  runtimeId: string;
  gateway: SocketIoGatewayClient;
  getGatewayState(): GatewayConnectionSnapshot;
  getLobbySnapshot(): SocialLobbySnapshot;
  getPinnedStats?(): readonly GatewaySocialPinnedStat[];
  isHomepageVisible(): boolean;
  createAvatar(profile: GatewaySocialProfile, className: string): HTMLElement;
  createStatusIcon(challengeId: string): HTMLElement;
  registerTooltip(target: HTMLElement, title: string, lock?: 'X' | 'Y'): void;
  registerOverflowTooltip(target: HTMLElement, title: string, lock?: 'X' | 'Y'): void;
  showToast(title: string, message: string, timeout?: number): void;
  onModalVisibilityChanged(): void;
}

interface LocalFriendMessage {
  id: string;
  accountId: string;
  direction: 'incoming' | 'outgoing';
  message: string;
  occurredAt: number;
  clientMessageId?: string;
  sequence?: number;
  status?: 'pending' | 'sent' | 'failed';
}

interface LocalSocialUiPreferences {
  version: 2;
  showFriendsList: 'always' | 'homepage' | 'never';
  homepageAnchor: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
}

const MESSAGE_STORAGE_PREFIX = 'skribblDuelsFriendMessagesV1:';
const UI_STORAGE_KEY = 'skribblDuelsSocialUiV1';
const EVENT_LIMIT = 100;
const BUTTON_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'] as const;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea') {
    (node as HTMLElement).style.pointerEvents = 'auto';
    for (const eventName of BUTTON_EVENTS) node.addEventListener(eventName, event => event.stopPropagation());
  }
  return node;
}

function assetUrl(id: ProgressionAssetId): string | null {
  return EMBEDDED_PROGRESSION_ASSETS[id] ?? null;
}

function icon(id: ProgressionAssetId, label: string, className = 'scd-icon'): HTMLElement {
  const source = assetUrl(id);
  const wrapper = element('span', className);
  wrapper.setAttribute('role', 'img');
  wrapper.setAttribute('aria-label', label);
  if (!source) {
    wrapper.classList.add('scd-icon-fallback');
    wrapper.textContent = label.slice(0, 1);
    return wrapper;
  }
  const image = element('img', 'scd-icon-image') as HTMLImageElement;
  image.src = source;
  image.alt = '';
  wrapper.appendChild(image);
  return wrapper;
}

function loadUiPreferences(): LocalSocialUiPreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? 'null') as (Partial<LocalSocialUiPreferences> & { showHomepageList?: boolean }) | null;
    const anchors = new Set(['bottom-left', 'bottom-right', 'top-left', 'top-right']);
    return {
      version: 2,
      showFriendsList: ['always', 'homepage', 'never'].includes(String(parsed?.showFriendsList))
        ? parsed!.showFriendsList! : parsed?.showHomepageList === false ? 'never' : 'homepage',
      homepageAnchor: anchors.has(String(parsed?.homepageAnchor))
        ? parsed!.homepageAnchor as LocalSocialUiPreferences['homepageAnchor'] : 'bottom-left'
    };
  } catch {
    return { version: 2, showFriendsList: 'homepage', homepageAnchor: 'bottom-left' };
  }
}

function presenceLabel(profile: Pick<GatewaySocialProfile, 'presence'>): string {
  return profile.presence === 'duel' ? 'Active Duel'
    : profile.presence.slice(0, 1).toUpperCase() + profile.presence.slice(1);
}

function presenceAsset(profile: Pick<GatewaySocialProfile, 'presence'>): ProgressionAssetId {
  if (profile.presence === 'duel') return 'friendDuelsLogo';
  if (profile.presence === 'online') return 'friendOnline';
  if (profile.presence === 'idle') return 'friendIdle';
  return 'friendOffline';
}

function socialPreferencesEqual(left: GatewaySocialPreferences, right: GatewaySocialPreferences): boolean {
  return left.availability === right.availability
    && left.profileStatusVisibility === right.profileStatusVisibility
    && left.lobbyStatusVisibility === right.lobbyStatusVisibility
    && left.allowLobbyJoin === right.allowLobbyJoin
    && left.receiveFriendRequests === right.receiveFriendRequests
    && left.receiveMatchInvites === right.receiveMatchInvites;
}

export class SocialFeatureUi {
  private modal: HTMLElement | null = null;
  private detailModal: HTMLElement | null = null;
  private homepageList: HTMLElement | null = null;
  private presencePoll: number | null = null;
  private lastPresenceFingerprint = '';
  private lastHomepageVisible: boolean | null = null;
  private handledEvents = new Set<string>();
  private unread = new Set<string>();
  private messages: LocalFriendMessage[] = [];
  private uiPreferences = loadUiPreferences();
  private activeView: 'friends' | 'requests' = 'friends';
  private searchRequestId: string | null = null;
  private searchQuery = '';
  private matchInviteAcceptancePending = false;
  private optimisticAvailability: GatewaySocialAvailability | null = null;
  private activeConversationId: string | null = null;
  private conversationProfile: GatewaySocialProfile | null = null;
  private activeProfileId: string | null = null;
  private profileRequestId: string | null = null;
  private profileCard: GatewayFriendProfileMessage | null = null;
  private historyRequests = new Map<string, string>();
  private historyPrependRequests = new Set<string>();
  private nextHistorySequence: number | null = null;
  private historyLoading = false;
  private activeHistoryRequestId: string | null = null;
  private conversationDrafts = new Map<string, string>();
  private readTimer: number | null = null;
  private presenceRequestId: string | null = null;
  private pendingPresenceFingerprint = '';
  private presenceSentAt = 0;
  private lastStatsFingerprint = '';
  private statsSentAt = 0;
  private optimisticPins = new Map<string, { pinned: boolean; requestId: string | null }>();
  private toastTimers = new Map<HTMLElement, number>();

  public constructor(private readonly options: SocialUiOptions) {}

  public start(): void {
    this.ensureStyles();
    window.addEventListener('keydown', this.messageKeydown, true);
    this.loadMessages();
    this.syncPresence();
    this.presencePoll = window.setInterval(() => this.syncPresence(), 2_000);
    this.renderHomepageList();
  }

  public stop(): void {
    window.removeEventListener('keydown', this.messageKeydown, true);
    for (const [toast, timer] of this.toastTimers) { window.clearTimeout(timer); toast.remove(); }
    this.toastTimers.clear();
    if (this.readTimer !== null) window.clearTimeout(this.readTimer);
    this.readTimer = null;
    if (this.presencePoll !== null) window.clearInterval(this.presencePoll);
    this.presencePoll = null;
    this.closeAll();
    this.homepageList?.remove();
    this.homepageList = null;
    this.matchInviteAcceptancePending = false;
    document.getElementById('skribbl-duels-social-styles')?.remove();
  }

  public isModalOpen(): boolean {
    return Boolean(this.modal?.isConnected || this.detailModal?.isConnected);
  }

  public isMatchInviteAcceptancePending(): boolean {
    return this.matchInviteAcceptancePending;
  }

  public closeModals(): void { this.closeAll(); }

  public handleGatewayUpdate(previous: GatewayConnectionSnapshot, next: GatewayConnectionSnapshot): void {
    if (previous.identity?.accountId !== next.identity?.accountId) {
      this.optimisticAvailability = null;
      this.optimisticPins.clear(); this.unread.clear(); this.handledEvents.clear(); this.historyRequests.clear();
      this.lastStatsFingerprint = ''; this.presenceRequestId = null;
      this.lastPresenceFingerprint = ''; this.conversationDrafts.clear(); this.historyPrependRequests.clear();
      this.closeDetail(); this.loadMessages();
    }
    if (next.social?.requestId === this.presenceRequestId && this.presenceRequestId !== null) {
      this.lastPresenceFingerprint = this.pendingPresenceFingerprint; this.presenceRequestId = null;
    }
    if (next.friendInbox !== previous.friendInbox && next.friendInbox) {
      this.unread = new Set(next.friendInbox.unread.filter(row => row.count > 0 && row.accountId !== this.activeConversationId).map(row => row.accountId));
      this.renderHomepageList(); if (this.modal?.isConnected) this.renderModal();
    }
    if (next.friendChatHistory !== previous.friendChatHistory && next.friendChatHistory) {
      const result = next.friendChatHistory;
      if (this.historyRequests.get(result.requestId) === result.accountId) {
        this.historyRequests.delete(result.requestId);
        const prepended = this.historyPrependRequests.delete(result.requestId);
        for (const message of result.messages) this.recordChatMessage(message);
        if (this.activeConversationId === result.accountId && result.requestId === this.activeHistoryRequestId) {
          this.nextHistorySequence = result.nextBeforeSequence; this.historyLoading = false;
          this.refreshConversationHistory(false, prepended); this.scheduleConversationRead();
        }
      }
    }
    if (next.friendProfile !== previous.friendProfile && next.friendProfile?.requestId === this.profileRequestId) {
      this.profileCard = next.friendProfile; this.refreshProfileCard();
    }
    for (const event of next.socialEvents) {
      if (this.handledEvents.has(event.eventId)) continue;
      this.handledEvents.add(event.eventId);
      this.handleSocialEvent(event);
    }
    if (next.socialError && next.socialError.requestId !== previous.socialError?.requestId) {
      this.optimisticAvailability = null;
      if (next.socialError.requestId === this.presenceRequestId) {
        this.presenceRequestId = null; this.lastPresenceFingerprint = '';
      }
      if (next.socialError.requestId?.startsWith('social-profile-stats')) this.lastStatsFingerprint = '';
      for (const [accountId, pin] of this.optimisticPins) if (pin.requestId === next.socialError.requestId) this.optimisticPins.delete(accountId);
      const failed = this.messages.find(item => item.direction === 'outgoing'
        && (item.clientMessageId ?? item.id) === next.socialError!.requestId && item.status === 'pending');
      if (failed) { failed.status = 'failed'; this.saveMessages(); this.refreshConversationHistory(); }
      if (next.socialError.requestId && this.historyRequests.has(next.socialError.requestId)) {
        this.historyRequests.delete(next.socialError.requestId); this.historyPrependRequests.delete(next.socialError.requestId); this.historyLoading = false; this.refreshConversationHistory();
      }
      if (next.socialError.requestId === this.searchRequestId) this.searchRequestId = null;
      this.refreshProfileControls();
      this.options.showToast('Social action unavailable', next.socialError.message, 7_000);
      this.renderHomepageList();
      if (this.modal?.isConnected) this.renderModal();
    }
    if ((next.socialError && next.socialError.requestId !== previous.socialError?.requestId)
        || previous.match?.matchId !== next.match?.matchId) {
      this.matchInviteAcceptancePending = false;
    }
    while (this.handledEvents.size > EVENT_LIMIT * 2) {
      const oldest = this.handledEvents.values().next().value as string | undefined;
      if (!oldest) break;
      this.handledEvents.delete(oldest);
    }
    const socialChanged = JSON.stringify(previous.social) !== JSON.stringify(next.social)
      || previous.match?.matchId !== next.match?.matchId
      || previous.match?.state.phase !== next.match?.state.phase;
    const friendSearchChanged = JSON.stringify(previous.friendSearch) !== JSON.stringify(next.friendSearch);
    if (this.optimisticAvailability !== null
        && next.social?.preferences.availability === this.optimisticAvailability) {
      this.optimisticAvailability = null;
    }
    if (socialChanged) {
      for (const friend of next.social?.friends ?? []) {
        if (this.optimisticPins.get(friend.accountId)?.pinned === friend.pinned) this.optimisticPins.delete(friend.accountId);
      }
      this.refreshConversationHeader(); this.refreshProfileCard();
      this.renderHomepageList();
      if (this.modal?.isConnected) this.renderModal();
      this.refreshProfileControls();
    }
    if (friendSearchChanged && this.modal?.isConnected) this.renderModal();
    if (previous.status !== next.status) {
      this.refreshConversationHeader();
      if (next.status !== 'connected') {
        for (const entry of this.messages) if (entry.direction === 'outgoing' && entry.status === 'pending') entry.status = 'failed';
        this.saveMessages(); this.refreshConversationHistory();
      }
    }
    if (next.status === 'connected' && previous.status !== 'connected') {
      this.lastPresenceFingerprint = ''; this.presenceRequestId = null; this.lastStatsFingerprint = '';
      this.syncPresence();
      if (this.activeConversationId) this.requestConversationHistory();
    }
  }

  public decorateProfileAvatar(avatar: HTMLElement): void {
    avatar.classList.add('scd-social-profile-avatar');
    const current = this.options.getGatewayState();
    const activeDuel = Boolean(current.match && current.match.state.phase !== 'finished' && current.match.state.phase !== 'cancelled');
    const availability = this.effectiveAvailability(current);
    const presence = availability === 'offline' ? 'offline' : activeDuel ? 'duel' : availability;
    const badge = element('button', 'scd-social-presence-badge') as HTMLButtonElement;
    badge.type = 'button'; badge.dataset.scdOwnPresence = 'true';
    badge.appendChild(icon(presenceAsset({ presence }), presenceLabel({ presence })));
    badge.addEventListener('click', () => this.openPresencePicker());
    this.options.registerTooltip(badge, `Presence: ${presenceLabel({ presence })}\nClick to change your visible availability.`, 'Y');
    avatar.appendChild(badge);
  }

  public createProfileControls(): HTMLElement {
    const controls = element('div', 'scd-social-profile-controls');
    const friends = element('button', 'scd-button scd-social-friends-button') as HTMLButtonElement;
    friends.type = 'button';
    friends.addEventListener('click', () => this.openFriends());
    controls.appendChild(friends);
    queueMicrotask(() => this.refreshProfileControls());
    return controls;
  }

  public openFriends(view: 'friends' | 'requests' = 'friends'): void {
    if (!this.options.getGatewayState().identity) return;
    this.activeView = view;
    this.modal?.remove();
    const overlay = element('div', 'scd-modal-overlay scd-social-overlay');
    overlay.id = 'skribbl-duels-friends';
    overlay.dataset.scdRuntimeId = this.options.runtimeId;
    const wrapper = element('div', 'scd-modal-wrapper');
    const modal = element('div', 'scd-modal-container scd-social-modal');
    const header = element('div', 'scd-social-header');
    header.appendChild(element('div', 'scd-social-title'));
    const close = element('button', 'scd-icon-button scd-modal-close', '×') as HTMLButtonElement;
    close.type = 'button';
    close.addEventListener('click', () => this.closeFriends());
    this.options.registerTooltip(close, 'Close friends list', 'Y');
    header.appendChild(close);
    const body = element('div', 'scd-social-body');
    modal.append(header, body);
    wrapper.appendChild(modal);
    overlay.appendChild(wrapper);
    overlay.addEventListener('click', event => { if (event.target === overlay) this.closeFriends(); });
    (document.body ?? document.documentElement).appendChild(overlay);
    this.modal = overlay;
    this.renderModal();
    this.options.onModalVisibilityChanged();
  }

  public renderSettings(target: HTMLElement): void {
    const state = this.options.getGatewayState();
    const snapshot = state.social;
    const card = element('div', 'scd-card scd-stack');
    card.appendChild(element('strong', '', 'Social privacy'));
    if (!snapshot || state.status !== 'connected') {
      card.appendChild(element('div', 'scd-muted', 'Connect the authenticated Gateway to manage Social settings.'));
      target.appendChild(card); this.renderListSettings(target);
      return;
    }
    const draft = { ...snapshot.preferences };
    const select = <T extends string>(labelText: string, value: T, values: readonly T[], update: (value: T) => void): HTMLLabelElement => {
      const label = element('label', 'scd-label');
      const input = element('select') as HTMLSelectElement;
      for (const item of values) {
        const option = element('option') as HTMLOptionElement;
        option.value = item;
        option.textContent = item.slice(0, 1).toUpperCase() + item.slice(1);
        option.selected = item === value;
        input.appendChild(option);
      }
      input.addEventListener('change', () => update(input.value as T));
      label.append(element('span', '', labelText), input);
      return label;
    };
    const save = (): void => {
      if (!socialPreferencesEqual(draft, snapshot.preferences)) this.options.gateway.setSocialPreferences(draft);
    };
    card.append(
      select('Profile status visibility', draft.profileStatusVisibility, ['everyone', 'friends', 'nobody'] as const, value => { draft.profileStatusVisibility = value; save(); }),
      select('Lobby status visibility', draft.lobbyStatusVisibility, ['everyone', 'friends', 'nobody'] as const, value => { draft.lobbyStatusVisibility = value; save(); }),
      this.checkbox('Allow friends to join my public lobby', draft.allowLobbyJoin, value => { draft.allowLobbyJoin = value; save(); }),
      this.checkbox('Receive friend requests', draft.receiveFriendRequests, value => { draft.receiveFriendRequests = value; save(); }),
      this.checkbox('Receive Match invitations', draft.receiveMatchInvites, value => { draft.receiveMatchInvites = value; save(); })
    );
    target.appendChild(card); this.renderListSettings(target);
  }

  private renderListSettings(target: HTMLElement): void {
    const card = element('div', 'scd-card scd-stack');
    card.appendChild(element('strong', '', 'Friends list'));
    const display = element('label', 'scd-label');
    const mode = element('select');
    for (const [value, label] of [['always', 'Always'], ['homepage', 'Homepage'], ['never', 'Never']] as const) {
      const option = element('option', '', label); option.value = value; option.selected = this.uiPreferences.showFriendsList === value; mode.appendChild(option);
    }
    mode.addEventListener('change', () => { this.uiPreferences.showFriendsList = mode.value as LocalSocialUiPreferences['showFriendsList']; this.saveUiPreferences(); this.renderHomepageList(); });
    display.append(element('span', '', 'Show friends list'), mode);
    const position = element('label', 'scd-label'); const anchor = element('select');
    for (const value of ['bottom-left', 'bottom-right', 'top-left', 'top-right'] as const) {
      const option = element('option', '', value.replace('-', ' ')); option.value = value; option.selected = value === this.uiPreferences.homepageAnchor; anchor.appendChild(option);
    }
    anchor.addEventListener('change', () => { this.uiPreferences.homepageAnchor = anchor.value as LocalSocialUiPreferences['homepageAnchor']; this.saveUiPreferences(); this.renderHomepageList(); });
    position.append(element('span', '', 'Position'), anchor); card.append(display, position); target.appendChild(card);
  }

  private checkbox(labelText: string, checked: boolean, onChange: (value: boolean) => void): HTMLLabelElement {
    const label = element('label', 'scd-label');
    const input = element('input') as HTMLInputElement;
    input.type = 'checkbox'; input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    label.append(element('span', '', labelText), input);
    return label;
  }

  private refreshProfileControls(): void {
    const current = this.options.getGatewayState();
    const activeDuel = Boolean(current.match && current.match.state.phase !== 'finished' && current.match.state.phase !== 'cancelled');
    const availability = this.effectiveAvailability(current);
    const presence = availability === 'offline' ? 'offline' : activeDuel ? 'duel' : availability;
    document.querySelectorAll<HTMLButtonElement>('.scd-social-presence-badge[data-scd-own-presence="true"]').forEach(badge => {
      badge.replaceChildren(icon(presenceAsset({ presence }), presenceLabel({ presence })));
      this.options.registerTooltip(badge, `Presence: ${presenceLabel({ presence })}\nClick to change your visible availability.`, 'Y');
    });
    const count = current.social?.requests.filter(request => request.direction === 'incoming').length ?? 0;
    document.querySelectorAll<HTMLButtonElement>('.scd-social-friends-button').forEach(button => {
      button.replaceChildren(icon('friendList', 'Friends list'), element('span', '', count > 0 ? `Friends (${count})` : 'Friends list'));
      this.options.registerTooltip(button, count > 0 ? `${count} received friend request${count === 1 ? '' : 's'}` : 'Open friends, requests and Quick Messages', 'Y');
    });
  }

  private renderModal(): void {
    const root = this.modal;
    if (!root) return;
    const social = this.options.getGatewayState().social;
    const title = root.querySelector<HTMLElement>('.scd-social-title');
    title?.replaceChildren(icon('friendList', 'Friends list'), element('strong', '', 'Friends list'));
    const body = root.querySelector<HTMLElement>('.scd-social-body');
    if (!body) return;
    body.replaceChildren();
    if (!social) {
      body.appendChild(element('div', 'scd-card scd-muted', 'Loading your friends from the Gateway…'));
      return;
    }
    const tabs = element('div', 'scd-social-tabs');
    const friendsTab = element('button', `scd-button${this.activeView === 'friends' ? ' selected' : ''}`, `Friends (${social.friends.length})`) as HTMLButtonElement;
    const requestsTab = element('button', `scd-button${this.activeView === 'requests' ? ' selected' : ''}`, `Pending requests (${social.requests.length})`) as HTMLButtonElement;
    friendsTab.type = requestsTab.type = 'button';
    friendsTab.addEventListener('click', () => { this.activeView = 'friends'; this.renderModal(); });
    requestsTab.addEventListener('click', () => { this.activeView = 'requests'; this.renderModal(); });
    this.options.registerTooltip(friendsTab, 'Show your friends list', 'Y');
    this.options.registerTooltip(requestsTab, 'Show received, ignored and outgoing requests', 'Y');
    tabs.append(friendsTab, requestsTab);
    body.appendChild(tabs);
    if (this.activeView === 'friends') this.renderFriendsView(body, social.friends);
    else this.renderRequestsView(body, social.requests);
  }

  private renderFriendsView(body: HTMLElement, friends: readonly GatewaySocialProfile[]): void {
    const search = element('form', 'scd-social-search') as HTMLFormElement;
    const input = element('input') as HTMLInputElement;
    input.type = 'search'; input.placeholder = 'Discord username (#0 optional)'; input.autocomplete = 'off'; input.maxLength = 66; input.value = this.searchQuery;
    const submit = element('button', 'scd-button primary', 'Search') as HTMLButtonElement;
    submit.type = 'submit';
    search.addEventListener('submit', event => {
      event.preventDefault(); this.searchQuery = input.value.trim();
      if (!this.searchQuery) return;
      this.searchRequestId = this.options.gateway.searchFriend(this.searchQuery);
      this.renderModal();
    });
    search.append(input, submit);
    body.appendChild(search);
    const state = this.options.getGatewayState();
    if (this.searchRequestId && state.friendSearch?.requestId === this.searchRequestId) {
      body.appendChild(this.createSearchResult(
        state.friendSearch.profile,
        state.friendSearch.relationship,
        state.friendSearch.canUnblock
      ));
    } else if (this.searchRequestId) body.appendChild(this.createSearchSkeleton());
    const list = element('div', 'scd-social-list');
    if (friends.length === 0) list.appendChild(element('div', 'scd-card scd-muted', 'No friends yet. Search by Discord username to send a request.'));
    for (const friend of this.sortedFriends(friends)) list.appendChild(this.createFriendRow(friend, true));
    body.appendChild(list);
  }

  private createSearchResult(profile: GatewaySocialProfile | null, relationship: string, canUnblock: boolean): HTMLElement {
    const result = element('div', 'scd-social-search-result');
    if (!profile) {
      result.appendChild(element('div', 'scd-muted', 'No Skribbl Duels account matched that Discord username.'));
      return result;
    }
    result.appendChild(this.createIdentity(profile));
    const label = relationship === 'friend' ? 'Already friends'
      : relationship === 'incoming-request' ? 'Request received — open Pending requests'
      : relationship === 'outgoing-request' ? 'Request pending'
      : relationship === 'self' ? 'This is your account'
      : relationship === 'blocked' && !canUnblock ? 'Unavailable' : null;
    if (label) result.appendChild(element('span', 'scd-muted', label));
    if (relationship === 'none') {
      const add = element('button', 'scd-button primary', 'Send friend request') as HTMLButtonElement;
      add.type = 'button';
      add.addEventListener('click', () => {
        add.disabled = true;
        this.options.gateway.sendFriendRequest(profile.accountId);
        this.searchRequestId = null;
        this.searchQuery = '';
        this.renderModal();
      });
      this.options.registerTooltip(add, `Send ${profile.displayName} a friend request`, 'Y');
      result.appendChild(add);
    } else if (relationship === 'blocked' && canUnblock) {
      const unblock = this.iconButton('friendUnblock', `Unblock ${profile.displayName}`, () => {
        this.searchRequestId = this.options.gateway.unblockFriend(profile.accountId);
        this.renderModal();
      });
      result.appendChild(unblock);
    }
    return result;
  }

  private createSearchSkeleton(): HTMLElement {
    const result = element('div', 'scd-social-search-result scd-social-search-skeleton');
    result.setAttribute('aria-busy', 'true');
    result.setAttribute('aria-label', 'Searching for account');
    result.appendChild(element('div', 'scd-social-search-spinner'));
    const copy = element('div', 'scd-social-search-skeleton-copy');
    copy.append(element('span', 'scd-social-skeleton-line username'), element('span', 'scd-social-skeleton-line presence'));
    result.appendChild(copy);
    return result;
  }

  private renderRequestsView(body: HTMLElement, requests: readonly GatewayFriendRequestSummary[]): void {
    const list = element('div', 'scd-social-list');
    if (requests.length === 0) list.appendChild(element('div', 'scd-card scd-muted', 'No pending or ignored friend requests.'));
    for (const request of requests) {
      const row = element('div', 'scd-social-row');
      row.appendChild(this.createIdentity(request.profile));
      row.appendChild(element('span', 'scd-muted scd-social-request-kind', request.direction === 'incoming'
        ? request.status === 'ignored' ? 'Ignored request' : 'Received request' : 'Outgoing request'));
      const actions = element('div', 'scd-social-actions');
      if (request.direction === 'incoming') {
        actions.append(
          this.iconButton('friendCheckmark', 'Accept friend request', () => this.options.gateway.respondToFriendRequest(request.friendRequestId, 'accept')),
          this.iconButton('friendCrossmark', 'Decline friend request', () => this.options.gateway.respondToFriendRequest(request.friendRequestId, 'decline')),
          this.iconButton('friendIgnore', 'Ignore friend request', () => this.options.gateway.respondToFriendRequest(request.friendRequestId, 'ignore')),
          this.iconButton('friendBlock', 'Block this account', () => this.options.gateway.respondToFriendRequest(request.friendRequestId, 'block'))
        );
      } else actions.appendChild(this.iconButton('friendWithdraw', 'Withdraw friend request', () => this.options.gateway.withdrawFriendRequest(request.friendRequestId)));
      row.appendChild(actions); list.appendChild(row);
    }
    body.appendChild(list);
  }

  private createFriendRow(friend: GatewaySocialProfile, removable: boolean): HTMLElement {
    const row = element('div', `scd-social-row presence-${friend.presence}`);
    row.appendChild(this.createIdentity(friend));
    const actions = element('div', 'scd-social-actions');
    row.appendChild(this.createFriendPin(friend));
    if (friend.presence === 'online' || friend.presence === 'idle') {
      actions.appendChild(this.iconButton('friendDuelsLogo', 'Invite to a Duel', () => this.openMatchInvitePicker(friend)));
    }
    actions.appendChild(this.iconButton('friendMessage', 'Open Quick Messages', () => this.openMessages(friend), this.unread.has(friend.accountId) ? 'unread' : ''));
    if (friend.lobby) actions.appendChild(this.iconButton(friend.canJoinLobby ? 'friendJoin' : 'friendLocked',
      friend.canJoinLobby ? 'Join public lobby' : 'This friend disabled lobby joining',
      () => friend.canJoinLobby ? this.joinLobby(friend) : this.showLocked(friend)));
    if (removable) actions.appendChild(this.iconButton('friendTrash', 'Remove friend', () => this.confirmRemoveFriend(friend), 'danger'));
    row.appendChild(actions);
    return row;
  }

  private createIdentity(profile: GatewaySocialProfile, showActivity = true, clickable = true): HTMLElement {
    const identity = element('div', 'scd-social-identity');
    const avatarWrap = element(clickable && profile.accountId !== this.options.getGatewayState().identity?.accountId ? 'button' : 'div', 'scd-social-avatar-wrap');
    if (avatarWrap instanceof HTMLButtonElement) {
      avatarWrap.type = 'button'; avatarWrap.addEventListener('click', () => this.openProfile(profile.accountId, profile));
      this.options.registerTooltip(avatarWrap, `Open ${profile.displayName}'s profile`, 'Y');
    }
    avatarWrap.append(this.options.createAvatar(profile, 'scd-social-avatar'), icon(presenceAsset(profile), presenceLabel(profile), 'scd-social-status-icon'));
    const copy = element('div', 'scd-social-copy');
    const name = element('div', 'scd-social-name');
    appendColoredDuelName(name, profile.displayName, profile.nameColorIndex);
    copy.appendChild(name);
    if (showActivity) copy.appendChild(element('div', 'scd-muted scd-social-lobby', this.activityLabel(profile)));
    if (profile.statusChallengeId || profile.statusText) {
      const status = element('div', 'scd-social-visible-status');
      if (profile.statusChallengeId) status.appendChild(this.options.createStatusIcon(profile.statusChallengeId));
      if (profile.statusText) {
        const text = element('span', 'scd-social-status-text', profile.statusText);
        this.options.registerOverflowTooltip(text, profile.statusText);
        status.appendChild(text);
      }
      copy.appendChild(status);
    }
    identity.append(avatarWrap, copy);
    return identity;
  }

  private iconButton(asset: ProgressionAssetId, tooltip: string, action: () => void, extraClass = ''): HTMLButtonElement {
    const button = element('button', `scd-icon-button scd-social-icon-button ${extraClass}`.trim()) as HTMLButtonElement;
    button.type = 'button'; button.appendChild(icon(asset, tooltip)); button.addEventListener('click', action);
    this.options.registerTooltip(button, tooltip, 'Y');
    return button;
  }

  private openPresencePicker(): void {
    const snapshot = this.options.getGatewayState().social;
    if (!snapshot) return;
    this.openDetail('Set online status', body => {
      for (const value of ['online', 'idle', 'offline'] as const) {
        const button = element('button', `scd-button scd-social-presence-choice${this.effectiveAvailability() === value ? ' selected' : ''}`) as HTMLButtonElement;
        button.type = 'button';
        button.append(icon(presenceAsset({ presence: value }), value), element('span', '', value.slice(0, 1).toUpperCase() + value.slice(1)));
        button.addEventListener('click', () => {
          this.optimisticAvailability = value;
          this.refreshProfileControls();
          try {
            this.options.gateway.setSocialPreferences({ ...snapshot.preferences, availability: value });
            this.closeDetail();
          } catch {
            this.optimisticAvailability = null;
            this.refreshProfileControls();
            this.options.showToast('Social action unavailable', 'Your visible availability could not be updated.', 5_000);
          }
        });
        this.options.registerTooltip(button, value === 'offline' ? 'Hide your online and active-Duel presence from other players' : `Appear ${value} to other players`, 'Y');
        body.appendChild(button);
      }
    });
  }

  private openMessages(friend: GatewaySocialProfile): void {
    this.openDetail('', body => {
      const history = element('div', 'scd-social-message-history');
      history.setAttribute('role', 'log'); history.setAttribute('aria-live', 'polite');
      const more = element('button', 'scd-button scd-social-load-history', 'Load older messages'); more.type = 'button';
      more.addEventListener('click', () => { if (this.nextHistorySequence !== null) this.requestConversationHistory(this.nextHistorySequence); });
      const form = element('form', 'scd-social-message-form');
      const input = element('input'); input.type = 'text'; input.maxLength = 300; input.placeholder = 'Write a message…';
      input.dataset.scdFriendMessageInput = 'true'; input.value = this.conversationDrafts.get(friend.accountId) ?? '';
      input.addEventListener('input', () => this.conversationDrafts.set(friend.accountId, input.value));
      const picker = this.createEmojiPicker(input);
      const emojis = this.iconButton('friendSlimy', 'Choose a Skribbl emoji', () => {
        picker.hidden = !picker.hidden; emojis.setAttribute('aria-expanded', String(!picker.hidden));
      }, 'scd-social-emoji-toggle'); emojis.setAttribute('aria-expanded', 'false');
      const send = element('button', 'scd-button primary', 'Send'); send.type = 'submit';
      form.addEventListener('submit', event => {
        event.preventDefault(); event.stopPropagation();
        const message = input.value.trim(); if (!message || send.disabled) return;
        const id = `friend-message-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
        this.recordMessage({ id, clientMessageId: id, accountId: friend.accountId, direction: 'outgoing', message, occurredAt: Date.now(), status: 'pending' });
        input.value = ''; this.conversationDrafts.delete(friend.accountId); picker.hidden = true; emojis.setAttribute('aria-expanded', 'false');
        this.refreshConversationHistory(true); this.sendPendingMessage(id); input.focus({ preventScroll: true });
      });
      form.append(input, emojis, send);
      const retention = element('div', 'scd-muted scd-social-chat-retention', 'The latest 24 hours are synced between browsers; older messages may remain in this browser.');
      body.append(more, history, form, picker, retention);
    });
    this.activeConversationId = friend.accountId; this.conversationProfile = friend; this.nextHistorySequence = null;
    this.unread.delete(friend.accountId); this.renderHomepageList(); if (this.modal?.isConnected) this.renderModal();
    this.refreshConversationHeader(); this.refreshConversationHistory(true); this.requestConversationHistory();
    queueMicrotask(() => this.detailModal?.querySelector<HTMLInputElement>('[data-scd-friend-message-input]')?.focus());
  }

  private readonly messageKeydown = (event: KeyboardEvent): void => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input?.matches('[data-scd-friend-message-input]') || !this.detailModal?.contains(input)) return;
    event.stopPropagation();
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault(); event.stopImmediatePropagation(); input.form?.requestSubmit();
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      const picker = this.detailModal.querySelector<HTMLElement>('.scd-social-emoji-picker');
      if (picker && !picker.hidden) { picker.hidden = true; this.detailModal.querySelector('.scd-social-emoji-toggle')?.setAttribute('aria-expanded', 'false'); }
      else input.blur();
    }
  };

  private createEmojiPicker(input: HTMLInputElement): HTMLElement {
    const picker = element('div', 'scd-social-emoji-picker'); picker.hidden = true;
    picker.setAttribute('aria-label', 'Skribbl emojis');
    const grid = element('div', 'scd-social-emoji-grid');
    for (const emoji of SOCIAL_EMOJIS) {
      if (!emoji.source) continue;
      const button = element('button', 'scd-icon-button scd-social-emoji-choice'); button.type = 'button';
      const image = element('img'); image.src = emoji.source; image.alt = emoji.label; button.appendChild(image);
      button.addEventListener('click', () => {
        const start = input.selectionStart ?? input.value.length; const end = input.selectionEnd ?? start;
        const value = input.value.slice(0, start) + emoji.token + input.value.slice(end);
        if (Array.from(value).length > 300) { this.options.showToast('Message too long', 'A message can contain up to 300 characters.'); return; }
        input.value = value; if (this.activeConversationId) this.conversationDrafts.set(this.activeConversationId, value);
        picker.hidden = true; this.detailModal?.querySelector('.scd-social-emoji-toggle')?.setAttribute('aria-expanded', 'false');
        input.focus({ preventScroll: true }); input.setSelectionRange(start + emoji.token.length, start + emoji.token.length);
      });
      this.options.registerTooltip(button, emoji.label, 'Y'); grid.appendChild(button);
    }
    picker.appendChild(grid); return picker;
  }

  private sendPendingMessage(id: string): void {
    const entry = this.messages.find(item => item.direction === 'outgoing' && (item.clientMessageId ?? item.id) === id);
    if (!entry) return; entry.status = 'pending'; this.refreshConversationHistory(true);
    try { this.options.gateway.sendFriendMessage(entry.accountId, entry.message, id); }
    catch {
      entry.status = 'failed'; this.saveMessages(); this.refreshConversationHistory();
      this.options.showToast('Message not sent', 'Reconnect the Gateway, then retry your message.');
    }
  }

  private requestConversationHistory(beforeSequence: number | null = null): void {
    if (!this.activeConversationId) return;
    try {
      this.historyLoading = true;
      const requestId = this.options.gateway.getFriendChatHistory(this.activeConversationId, beforeSequence);
      this.activeHistoryRequestId = requestId; this.historyRequests.set(requestId, this.activeConversationId);
      if (beforeSequence !== null) this.historyPrependRequests.add(requestId);
    } catch { this.historyLoading = false; }
    this.refreshConversationHistory();
  }

  private refreshConversationHeader(): void {
    if (!this.activeConversationId || !this.detailModal) return;
    const state = this.options.getGatewayState();
    const friend = state.social?.friends.find(item => item.accountId === this.activeConversationId) ?? this.conversationProfile;
    if (!friend) return; this.conversationProfile = friend;
    this.detailModal.querySelector('.scd-modal-title')?.replaceChildren(this.createIdentity(friend, false));
    const connectedFriend = state.status === 'connected' && Boolean(state.social?.friends.some(item => item.accountId === friend.accountId));
    const input = this.detailModal.querySelector<HTMLInputElement>('[data-scd-friend-message-input]');
    const send = this.detailModal.querySelector<HTMLButtonElement>('.scd-social-message-form button[type="submit"]');
    if (input) { input.disabled = !connectedFriend; input.placeholder = connectedFriend ? 'Write a message…' : 'Messaging unavailable'; }
    if (send) send.disabled = !connectedFriend;
  }

  private refreshConversationHistory(forceBottom = false, prepended = false): void {
    if (!this.detailModal || !this.activeConversationId) return;
    const history = this.detailModal.querySelector<HTMLElement>('.scd-social-message-history');
    if (!history) return;
    const follow = forceBottom || !prepended && history.scrollHeight - history.scrollTop - history.clientHeight < 40;
    const oldHeight = history.scrollHeight; const oldTop = history.scrollTop; history.replaceChildren();
    const entries = this.messages.filter(item => item.accountId === this.activeConversationId);
    if (entries.length === 0) history.appendChild(element('div', 'scd-muted', this.historyLoading ? 'Loading messages…' : 'Start a conversation.'));
    for (const message of entries) {
      const row = element('div', `scd-social-message ${message.direction}${message.status === 'pending' ? ' pending' : ''}${message.status === 'failed' ? ' failed' : ''}`);
      row.dataset.messageId = message.clientMessageId ?? message.id;
      const copy = element('span', 'scd-social-message-text'); appendSocialMessage(copy, message.message);
      row.append(element('span', 'scd-social-message-author', message.direction === 'outgoing' ? 'You' : this.conversationProfile?.displayName ?? 'Friend'), copy);
      if (message.status === 'pending') row.appendChild(element('span', 'scd-muted scd-social-message-state', 'Sending…'));
      if (message.status === 'failed') {
        const retry = element('button', 'scd-button scd-social-message-retry', 'Retry'); retry.type = 'button';
        retry.addEventListener('click', () => this.sendPendingMessage(message.clientMessageId ?? message.id)); row.appendChild(retry);
      }
      history.appendChild(row);
    }
    const more = this.detailModal.querySelector<HTMLButtonElement>('.scd-social-load-history');
    if (more) { more.hidden = this.nextHistorySequence === null; more.disabled = this.historyLoading; }
    history.scrollTop = follow ? history.scrollHeight : oldTop + (prepended ? Math.max(0, history.scrollHeight - oldHeight) : 0);
  }

  private scheduleConversationRead(): void {
    if (!this.activeConversationId) return;
    this.unread.delete(this.activeConversationId);
    if (this.readTimer !== null) window.clearTimeout(this.readTimer);
    this.readTimer = window.setTimeout(() => {
      this.readTimer = null; const friendId = this.activeConversationId; if (!friendId) return;
      const through = Math.max(0, ...this.messages.filter(item => item.accountId === friendId && item.direction === 'incoming').map(item => item.sequence ?? 0));
      if (through > 0) { try { this.options.gateway.markFriendChatRead(friendId, through); } catch {} }
    }, 250);
  }

  public openProfile(accountId: string, preview?: GatewaySocialProfile): void {
    if (accountId === this.options.getGatewayState().identity?.accountId) return;
    this.openDetail('Player profile', body => {
      if (preview) body.appendChild(this.createIdentity(preview, false, false));
      else body.appendChild(this.createSearchSkeleton());
    });
    this.activeProfileId = accountId;
    try { this.profileRequestId = this.options.gateway.getFriendProfile(accountId); }
    catch { this.options.showToast('Profile unavailable', 'Reconnect the Gateway to view this profile.'); }
  }

  private refreshProfileCard(): void {
    if (!this.activeProfileId || !this.detailModal || !this.profileCard) return;
    const body = this.detailModal.querySelector<HTMLElement>('.scd-social-detail-body'); if (!body) return;
    body.replaceChildren(); const profile = this.profileCard.profile;
    if (!profile) { body.appendChild(element('div', 'scd-muted', 'This profile is unavailable.')); return; }
    const latest = this.options.getGatewayState().social?.friends.find(item => item.accountId === profile.accountId) ?? profile;
    const card = element('div', 'scd-social-profile-card');
    const identity = this.createIdentity(latest, false, false); card.appendChild(identity);
    const stats = element('div', 'scd-social-profile-stats');
    const pinned = this.profileCard.pinnedStats.length === 2 ? this.profileCard.pinnedStats
      : DEFAULT_PINNED_PROFILE_STAT_IDS.map(id => ({ id, value: this.profileCard!.pinnedStats.find(item => item.id === id)?.value ?? '—' }));
    for (const stat of pinned) {
      if (!isProfileStatId(stat.id)) continue;
      const definition = PROFILE_STAT_DEFINITION_BY_ID[stat.id]; const statCard = element('div', 'scd-profile-stat scd-social-public-stat');
      const image = element('img', 'scd-social-stat-icon'); image.src = EMBEDDED_STAT_ICON_ASSETS[STAT_ICON_ASSET_PATHS[stat.id]] ?? ''; image.alt = definition.label;
      const pin = icon('friendPin', 'Pinned statistic', 'scd-profile-pin-icon scd-icon');
      statCard.append(pin, image, element('span', 'scd-profile-stat-label', definition.label), element('span', 'scd-profile-stat-value', stat.value));
      this.options.registerTooltip(statCard, definition.description, 'Y'); stats.appendChild(statCard);
    }
    const friend = this.profileCard.relationship === 'friend';
    const action = this.iconButton(friend ? 'friendList' : 'friendAdd', friend ? 'Already friends' : 'Send friend request', () => {
      if (friend) { this.closeDetail(); this.openFriends(); }
      else { this.options.gateway.sendFriendRequest(profile.accountId); action.disabled = true; }
    }, 'scd-social-profile-friend-action');
    action.disabled = !friend && this.profileCard.relationship !== 'none';
    if (action.disabled) this.options.registerTooltip(action, this.profileCard.relationship === 'blocked' ? 'Friend requests unavailable' : 'Friend request pending', 'Y');
    card.append(action, stats); body.appendChild(card);
  }

  private activityLabel(profile: GatewaySocialProfile): string {
    if (profile.presence === 'duel') return 'Active Duel';
    if (profile.presence === 'offline') return 'Offline';
    if (profile.lobby) return `${profile.lobby.languageName} ${profile.lobby.lobbyType === 'public' ? 'Public' : 'Private'} ${profile.lobby.playerCount}/${profile.lobby.maxPlayers}`;
    return profile.activity === 'lobby' ? 'Playing Skribbl' : profile.activity === 'home' ? 'Viewing Homepage' : presenceLabel(profile);
  }

  private sortedFriends(friends: readonly GatewaySocialProfile[]): GatewaySocialProfile[] {
    return friends.map(friend => ({ ...friend, pinned: this.optimisticPins.get(friend.accountId)?.pinned ?? friend.pinned })).sort(compareSocialFriends);
  }

  private createFriendPin(friend: GatewaySocialProfile): HTMLButtonElement {
    return this.iconButton('friendPin', friend.pinned ? 'Unpin friend' : 'Pin friend', () => {
      const update = { pinned: !friend.pinned, requestId: null as string | null };
      this.optimisticPins.set(friend.accountId, update); this.renderHomepageList(); if (this.modal?.isConnected) this.renderModal();
      try { update.requestId = this.options.gateway.setFriendPinned(friend.accountId, update.pinned); }
      catch { this.optimisticPins.delete(friend.accountId); this.renderHomepageList(); if (this.modal?.isConnected) this.renderModal(); }
    }, `scd-social-pin${friend.pinned ? ' pinned' : ''}`);
  }


  private openMatchInvitePicker(friend: GatewaySocialProfile): void {
    this.openDetail(`Invite ${friend.displayName}`, body => {
      body.appendChild(element('div', 'scd-muted', 'Choose a Duel format. The invitation stays live until accepted, declined or expired.'));
      const actions = element('div', 'scd-social-format-actions');
      for (const [format, label] of [['casual', 'Casual 3×3'], ['ranked', 'Ranked 5×5']] as const) {
        const button = element('button', `scd-button ${format === 'ranked' ? 'primary' : ''}`, label) as HTMLButtonElement;
        button.type = 'button';
        button.addEventListener('click', () => {
          button.disabled = true; this.options.gateway.sendFriendMatchInvite(friend.accountId, format); this.closeDetail();
          this.options.showToast('Match invitation sent', `${friend.displayName} can now accept your ${label} invitation.`);
        });
        this.options.registerTooltip(button, `Invite ${friend.displayName} to ${label}`, 'Y');
        actions.appendChild(button);
      }
      body.appendChild(actions);
    });
  }

  private confirmRemoveFriend(friend: GatewaySocialProfile): void {
    this.openDetail(`Remove ${friend.displayName}?`, body => {
      body.appendChild(element('p', 'scd-muted', 'This removes the friendship for both players. Local Quick Messages remain in this browser.'));
      const actions = element('div', 'scd-social-format-actions');
      const cancel = element('button', 'scd-button', 'Cancel') as HTMLButtonElement;
      const remove = element('button', 'scd-button danger', 'Remove friend') as HTMLButtonElement;
      cancel.type = remove.type = 'button'; cancel.addEventListener('click', () => this.closeDetail());
      remove.addEventListener('click', () => { remove.disabled = true; this.options.gateway.removeFriend(friend.accountId); this.closeDetail(); });
      actions.append(cancel, remove); body.appendChild(actions);
    });
  }

  private openDetail(titleText: string, render: (body: HTMLElement) => void): void {
    this.closeDetail();
    const overlay = element('div', 'scd-modal-overlay scd-social-detail-overlay');
    overlay.dataset.scdRuntimeId = this.options.runtimeId;
    const wrapper = element('div', 'scd-modal-wrapper');
    const modal = element('div', 'scd-modal-container scd-social-detail-modal');
    const header = element('div', 'scd-social-detail-header');
    header.appendChild(element('div', 'scd-modal-title', titleText));
    const close = element('button', 'scd-icon-button scd-modal-close', '×') as HTMLButtonElement;
    close.type = 'button'; close.addEventListener('click', () => this.closeDetail()); this.options.registerTooltip(close, 'Close', 'Y');
    header.appendChild(close);
    const body = element('div', 'scd-social-detail-body'); render(body);
    modal.append(header, body); wrapper.appendChild(modal); overlay.appendChild(wrapper);
    overlay.addEventListener('click', event => { if (event.target === overlay) this.closeDetail(); });
    (document.body ?? document.documentElement).appendChild(overlay);
    this.detailModal = overlay; this.options.onModalVisibilityChanged();
  }

  private closeDetail(): void {
    if (this.readTimer !== null) window.clearTimeout(this.readTimer); this.readTimer = null;
    this.activeConversationId = null; this.conversationProfile = null; this.activeProfileId = null;
    this.profileRequestId = null; this.profileCard = null;
    this.detailModal?.remove(); this.detailModal = null; this.options.onModalVisibilityChanged();
  }
  private closeFriends(): void { this.closeDetail(); this.modal?.remove(); this.modal = null; this.options.onModalVisibilityChanged(); }
  private closeAll(): void { this.closeFriends(); }

  private handleSocialEvent(event: GatewaySocialEventMessage): void {
    if ((event.kind === 'friend-message-received' || event.kind === 'friend-message-sent') && event.message && event.clientMessageId) {
      const direction = event.kind === 'friend-message-received' ? 'incoming' as const : 'outgoing' as const;
      const fresh = event.chatMessage ? this.recordChatMessage(event.chatMessage) : this.recordMessage({
        id: event.clientMessageId, clientMessageId: event.clientMessageId, accountId: event.profile.accountId,
        direction, message: event.message, occurredAt: event.occurredAt, status: 'sent'
      });
      if (direction === 'incoming' && fresh && this.activeConversationId !== event.profile.accountId) {
        this.unread.add(event.profile.accountId);
        this.actionToast(`${event.profile.displayName} sent a message`, event.message, event.profile,
          [{ label: 'Reply', action: () => this.openMessages(event.profile), primary: true }]);
      }
      if (this.activeConversationId === event.profile.accountId) { this.refreshConversationHistory(direction === 'outgoing'); this.scheduleConversationRead(); }
    } else if (event.kind === 'friend-request-received' && event.friendRequestId) {
      this.actionToast('Friend request', `${event.profile.displayName} sent you a friend request.`, event.profile, [
        { label: 'Accept', action: () => this.options.gateway.respondToFriendRequest(event.friendRequestId!, 'accept'), primary: true },
        { label: 'Decline', action: () => this.options.gateway.respondToFriendRequest(event.friendRequestId!, 'decline') },
        { label: 'Ignore', action: () => this.options.gateway.respondToFriendRequest(event.friendRequestId!, 'ignore') },
        { label: 'Block', action: () => this.options.gateway.respondToFriendRequest(event.friendRequestId!, 'block') }
      ]);
    } else if (event.kind === 'match-invite-received' && event.inviteId && event.format) {
      const label = event.format === 'ranked' ? 'Ranked 5×5' : 'Casual 3×3';
      this.actionToast('Friend Match invitation', `${event.profile.displayName} invited you to ${label}.`, event.profile, [
        { label: 'Accept', action: () => {
          this.matchInviteAcceptancePending = true;
          this.options.gateway.respondToFriendMatchInvite(event.inviteId!, true);
        }, primary: true },
        { label: 'Decline', action: () => this.options.gateway.respondToFriendMatchInvite(event.inviteId!, false) }
      ]);
    } else if (event.kind === 'friend-request-accepted') this.options.showToast('Friend request accepted', `${event.profile.displayName} is now in your friends list.`);
    else if (event.kind === 'match-invite-declined') this.options.showToast('Match invitation declined', `${event.profile.displayName} declined your invitation.`);
    else if (event.kind === 'friend-removed') this.options.showToast('Friendship updated', `${event.profile.displayName} is no longer in your friends list.`);
    this.renderHomepageList();
  }

  private actionToast(titleText: string, message: string, profile: GatewaySocialProfile, actions: Array<{ label: string; action: () => void; primary?: boolean }>): void {
    let container = document.querySelector<HTMLElement>('.typo-toast-container');
    if (!container) { container = element('div', 'typo-toast-container'); (document.body ?? document.documentElement).appendChild(container); }
    const toast = element('div', 'typo-toast scd-duel-toast scd-social-toast');
    toast.dataset.scdRuntimeId = this.options.runtimeId;
    const closeToast = (): void => {
      if (!toast.isConnected || toast.classList.contains('closing')) return;
      const timer = this.toastTimers.get(toast); if (timer !== undefined) window.clearTimeout(timer);
      this.toastTimers.delete(toast); toast.classList.add('closing'); window.setTimeout(() => toast.remove(), 150);
    };
    const close = element('span', 'close-toast', '×'); close.addEventListener('click', closeToast);
    const identity = element('div', 'scd-toast-profile');
    const avatar = this.createIdentity(profile, false); avatar.querySelector('.scd-social-copy')?.remove();
    identity.append(avatar, element('strong', '', titleText));
    const buttons = element('div', 'typo-toast-confirm');
    for (const item of actions) {
      const button = element('button', `scd-button${item.primary ? ' primary' : ''}`, item.label) as HTMLButtonElement;
      button.type = 'button'; button.addEventListener('click', () => { item.action(); closeToast(); }); buttons.appendChild(button);
    }
    const copy = element('span'); appendSocialMessage(copy, message);
    toast.append(identity, close, copy, buttons); container.appendChild(toast);
    this.toastTimers.set(toast, window.setTimeout(closeToast, 3_500));
  }

  private renderHomepageList(): void {
    this.homepageList?.remove(); this.homepageList = null;
    const state = this.options.getGatewayState();
    if (this.uiPreferences.showFriendsList === 'never'
        || (this.uiPreferences.showFriendsList === 'homepage' && !this.options.isHomepageVisible())
        || state.status !== 'connected' || !state.social) return;
    const panel = element('aside', `scd-home-friends ${this.uiPreferences.homepageAnchor}`);
    panel.dataset.scdRuntimeId = this.options.runtimeId;
    const header = element('button', 'scd-home-friends-header') as HTMLButtonElement;
    header.type = 'button'; header.append(icon('friendList', 'Friends list'), element('strong', '', `Friends · ${state.social.friends.length}`));
    header.addEventListener('click', () => this.openFriends()); this.options.registerTooltip(header, 'Open friends list', 'Y');
    const list = element('div', 'scd-home-friends-list');
    if (state.social.friends.length === 0) list.appendChild(element('div', 'scd-muted scd-home-friends-empty', 'No friends yet'));
    for (const friend of this.sortedFriends(state.social.friends)) {
      const row = element('div', `scd-home-friend presence-${friend.presence}`);
      row.append(this.createFriendPin(friend), this.createIdentity(friend));
      const actions = element('div', 'scd-home-friend-actions');
      if (friend.presence === 'online' || friend.presence === 'idle') actions.appendChild(this.iconButton('friendDuelsLogo', 'Invite to a Duel', () => this.openMatchInvitePicker(friend)));
      actions.appendChild(this.iconButton('friendMessage', 'Open Quick Messages', () => this.openMessages(friend), this.unread.has(friend.accountId) ? 'unread' : ''));
      if (friend.lobby) actions.appendChild(this.iconButton(friend.canJoinLobby ? 'friendJoin' : 'friendLocked', friend.canJoinLobby ? 'Join public lobby' : 'Lobby joining disabled', () => friend.canJoinLobby ? this.joinLobby(friend) : this.showLocked(friend)));
      row.appendChild(actions); list.appendChild(row);
    }
    panel.append(header, list); (document.body ?? document.documentElement).appendChild(panel); this.homepageList = panel;
  }

  private joinLobby(friend: GatewaySocialProfile): void {
    if (!friend.lobby?.lobbyId || !friend.canJoinLobby) { this.showLocked(friend); return; }
    document.dispatchEvent(new CustomEvent('joinLobby', { detail: friend.lobby.lobbyId }));
    this.options.showToast('Joining friend', `Opening ${friend.displayName}'s ${friend.lobby.languageName} lobby…`);
  }

  private showLocked(friend: GatewaySocialProfile): void {
    const overlay = element('div', 'scd-social-locked-overlay');
    overlay.append(icon('friendLocked', 'Lobby joining locked'), element('strong', '', `${friend.displayName} disabled lobby joining.`));
    (document.body ?? document.documentElement).appendChild(overlay); window.setTimeout(() => overlay.remove(), 1_500);
  }

  private syncPresence(): void {
    const state = this.options.getGatewayState();
    const homepageVisible = this.options.isHomepageVisible();
    const homepageVisibilityChanged = homepageVisible !== this.lastHomepageVisible;
    this.lastHomepageVisible = homepageVisible;
    if (state.status !== 'connected') {
      this.lastPresenceFingerprint = '';
      if (homepageVisibilityChanged || this.homepageList) this.renderHomepageList();
      return;
    }
    const report = socialPresenceReport(this.options.getLobbySnapshot());
    const fingerprint = JSON.stringify([state.connectionId, report.page, report.lobby]);
    if (this.presenceRequestId !== null && Date.now() - this.presenceSentAt >= 10_000) {
      this.presenceRequestId = null; this.lastPresenceFingerprint = '';
    }
    if (fingerprint !== this.lastPresenceFingerprint && this.presenceRequestId === null) {
      try {
        this.presenceRequestId = this.options.gateway.setSocialPresence(report.page, report.lobby);
        this.pendingPresenceFingerprint = fingerprint; this.presenceSentAt = Date.now();
      } catch (error) { console.warn('[Skribbl Duels Social] Presence report deferred', error instanceof Error ? error.message : String(error)); }
    }
    const stats = this.options.getPinnedStats?.();
    if (stats) {
      const statsFingerprint = JSON.stringify([state.identity?.accountId, stats]);
      if (statsFingerprint !== this.lastStatsFingerprint && Date.now() - this.statsSentAt >= 15_000) {
        try { this.options.gateway.setSocialPinnedStats(stats); this.lastStatsFingerprint = statsFingerprint; this.statsSentAt = Date.now(); } catch {}
      }
    }
    if (homepageVisibilityChanged) this.renderHomepageList();
  }

  private recordMessage(message: LocalFriendMessage): boolean {
    const index = this.messages.findIndex(item => item.accountId === message.accountId && item.direction === message.direction
      && ((item.clientMessageId ?? item.id) === (message.clientMessageId ?? message.id) || item.id === message.id));
    const fresh = index < 0;
    if (index >= 0) this.messages[index] = { ...this.messages[index], ...message };
    else this.messages.push(message);
    this.messages.sort((a, b) => a.occurredAt - b.occurredAt || (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER));
    this.saveMessages(); return fresh;
  }

  private recordChatMessage(message: GatewayFriendChatMessage): boolean {
    const self = this.options.getGatewayState().identity?.accountId;
    if (!self || (message.senderId !== self && message.recipientId !== self)) return false;
    return this.recordMessage({ id: message.messageId, clientMessageId: message.clientMessageId, sequence: message.sequence,
      accountId: message.senderId === self ? message.recipientId : message.senderId,
      direction: message.senderId === self ? 'outgoing' : 'incoming', message: message.message, occurredAt: message.occurredAt, status: 'sent' });
  }

  private loadMessages(): void {
    this.messages = [];
    const accountId = this.options.getGatewayState().identity?.accountId;
    if (!accountId) return;
    try {
      const parsed = JSON.parse(localStorage.getItem(`${MESSAGE_STORAGE_PREFIX}${accountId}`) ?? '[]') as LocalFriendMessage[];
      this.messages = Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === 'string'
        && typeof item.accountId === 'string' && (item.direction === 'incoming' || item.direction === 'outgoing')
        && typeof item.message === 'string' && Number.isFinite(item.occurredAt)).slice(-1_000)
        .map(item => item.status === 'pending' ? { ...item, status: 'failed' as const } : item) : [];
    } catch {}
  }

  private saveMessages(): void {
    const accountId = this.options.getGatewayState().identity?.accountId;
    if (!accountId) return;
    try { localStorage.setItem(`${MESSAGE_STORAGE_PREFIX}${accountId}`, JSON.stringify(this.messages.slice(-1_000))); } catch {}
  }
  private effectiveAvailability(state = this.options.getGatewayState()): GatewaySocialAvailability {
    return this.optimisticAvailability ?? state.social?.preferences.availability ?? 'offline';
  }
  private saveUiPreferences(): void { try { localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(this.uiPreferences)); } catch {} }

  private ensureStyles(): void {
    if (document.getElementById('skribbl-duels-social-styles')) return;
    const style = document.createElement('style'); style.id = 'skribbl-duels-social-styles';
    style.textContent = `
#skribbl-duels-friends,#skribbl-duels-friends *,.scd-social-detail-overlay,.scd-social-detail-overlay *,.scd-home-friends,.scd-home-friends *{box-sizing:border-box}
.scd-social-modal{width:min(800px,calc(100vw - 24px));max-height:min(760px,calc(100vh - 24px))}.scd-social-header{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 44px;align-items:center;gap:6px;padding:8px 10px}
.scd-social-title{display:flex;align-items:center;justify-content:center;gap:8px;font-size:1.25em}.scd-social-title .scd-icon{width:38px;height:38px}.scd-social-body{min-height:240px;overflow:auto;padding:12px}.scd-social-tabs,.scd-social-format-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:10px}.scd-social-tabs .selected{background:#53e237}
.scd-social-search{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-bottom:10px}.scd-social-search-result{display:flex;align-items:center;gap:10px;padding:9px;margin-bottom:10px;border-radius:8px;background:var(--COLOR_PANEL_BG)}.scd-social-search-result .scd-social-identity{flex:1}.scd-social-search-spinner{width:46px;height:46px;flex:none;background:url('/img/load.gif') center/contain no-repeat;animation:scd-queue-load-rotate .8s ease-in-out infinite}.scd-social-search-skeleton-copy{flex:1;display:flex;flex-direction:column;gap:7px}.scd-social-skeleton-line{display:block;height:12px;border-radius:6px;background:linear-gradient(90deg,var(--COLOR_PANEL_LO),var(--COLOR_PANEL_HI),var(--COLOR_PANEL_LO));background-size:200% 100%;animation:scd-social-skeleton 1.1s ease-in-out infinite}.scd-social-skeleton-line.username{width:min(210px,65%)}.scd-social-skeleton-line.presence{width:min(125px,42%);height:9px}@keyframes scd-social-skeleton{from{background-position:200% 0}to{background-position:-200% 0}}.scd-social-list{display:flex;flex-direction:column;gap:6px}
.scd-social-row{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px;border-radius:8px;background:var(--COLOR_PANEL_BG)}.scd-social-identity{min-width:0;display:flex;align-items:center;gap:9px;text-align:left}.scd-social-avatar-wrap{position:relative;width:46px;height:46px;flex:none}.scd-social-avatar{width:46px!important;height:46px!important;font-size:18px;display:grid;place-items:center}.scd-social-avatar.scd-avatar-skribbl .scd-skribbl-avatar{width:100%;height:100%}
.scd-social-status-icon{position:absolute;right:-3px;bottom:-3px;width:20px;height:20px;z-index:2}.scd-social-status-icon[aria-label='Online']{width:26px;height:20px;animation:icon_drawing .8s ease-in-out infinite alternate}.scd-social-status-icon .scd-icon-image{object-fit:contain}.scd-social-copy{min-width:0;display:flex;flex-direction:column}.scd-social-name,.scd-social-lobby,.scd-social-status-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.scd-social-name{font-weight:900}.scd-social-lobby{font-size:10px}.scd-social-status-text{max-width:340px;font-size:11px;opacity:.85}.scd-social-visible-status{min-width:0;display:flex;align-items:center;gap:4px}.scd-social-visible-status>.scd-icon{width:20px;height:20px;flex:none}
.scd-social-actions,.scd-home-friend-actions{display:flex;align-items:center;gap:5px}.scd-social-icon-button{position:relative;width:36px;height:36px;border-radius:6px}.scd-social-icon-button .scd-icon{width:31px;height:31px}.scd-social-icon-button.selected{background:#53e237}.scd-social-tabs .selected:hover:not(:disabled),.scd-social-presence-choice.selected:hover:not(:disabled),.scd-social-icon-button.selected:hover:not(:disabled){background:#38c41c}.scd-social-icon-button.unread::after{content:'';position:absolute;right:-2px;top:-3px;width:15px;height:15px;background:url('${assetUrl('friendPing') ?? ''}') center/contain no-repeat;filter:drop-shadow(2px 2px 0 rgba(0,0,0,.25))}.scd-social-request-kind{justify-self:start;font-size:10px}
.scd-social-profile-avatar{overflow:visible!important}.scd-social-presence-badge{position:absolute;right:-7px;bottom:-4px;width:38px;height:38px;border:0;padding:0;background:transparent;z-index:4;cursor:pointer}.scd-social-presence-badge .scd-icon{width:100%;height:100%}.scd-social-profile-controls{width:100%}.scd-social-friends-button{width:100%;min-height:46px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:800}.scd-social-friends-button .scd-icon{width:34px;height:34px}
.scd-social-detail-overlay{z-index:2147483647}.scd-social-detail-modal{width:min(580px,calc(100vw - 24px));max-height:min(680px,calc(100vh - 24px))}.scd-social-detail-header{display:grid;grid-template-columns:minmax(0,1fr) 44px;align-items:center;padding:8px 10px}.scd-social-detail-body{min-height:0;overflow:auto;padding:12px}.scd-social-presence-choice{width:100%;min-height:58px;display:flex;align-items:center;justify-content:flex-start;gap:10px;margin-bottom:7px}.scd-social-presence-choice.selected{background:#53e237}.scd-social-presence-choice .scd-icon{width:42px;height:42px}
.scd-social-message-history{min-height:180px;max-height:390px;overflow:auto;display:flex;flex-direction:column;gap:6px;padding:4px}.scd-social-message{align-self:flex-start;max-width:85%;display:flex;flex-direction:column;padding:7px 9px;border-radius:8px;background:var(--COLOR_PANEL_LO);overflow-wrap:anywhere}.scd-social-message.outgoing{align-self:flex-end;background:var(--SCD_ACCENT)}.scd-social-message-author{font-size:9px;font-weight:900;opacity:.72}.scd-social-message-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:10px}
.scd-home-friends{position:fixed;z-index:2147483639;width:min(370px,calc(100vw - 24px));border-radius:9px;background:var(--COLOR_PANEL_BG);color:var(--COLOR_PANEL_TEXT,#fff);filter:drop-shadow(0 8px 16px rgba(0,0,0,.28));overflow:hidden;pointer-events:auto}.scd-home-friends.bottom-left{left:12px;bottom:12px}.scd-home-friends.bottom-right{right:12px;bottom:12px}.scd-home-friends.top-left{left:12px;top:12px}.scd-home-friends.top-right{right:12px;top:12px}.scd-home-friends-header{width:100%;min-height:40px;display:flex;align-items:center;justify-content:center;gap:7px;border:0;padding:5px;background:var(--SCD_ACCENT);color:inherit;font:inherit;cursor:pointer}.scd-home-friends-header:hover{background:var(--SCD_ACCENT_HOVER)}.scd-home-friends-header .scd-icon{width:30px;height:30px}.scd-home-friends-list{max-height:290px;overflow:auto}.scd-home-friend{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:5px;padding:7px}.scd-home-friend:nth-child(odd){background:var(--COLOR_PANEL_LO)}.scd-home-friend:nth-child(even){background:var(--COLOR_PANEL_HI)}.scd-home-friend .scd-social-avatar-wrap,.scd-home-friend .scd-social-avatar{width:38px!important;height:38px!important}.scd-home-friend .scd-social-status-icon{width:18px;height:18px}.scd-home-friend .scd-social-icon-button{width:30px;height:30px}.scd-home-friend .scd-social-icon-button .scd-icon{width:27px;height:27px}.scd-home-friends-empty{padding:12px;text-align:center}
.scd-social-locked-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(0,0,0,.55);color:#fff;pointer-events:none;animation:scd-social-lock-glow 1.5s ease both}.scd-social-locked-overlay .scd-icon{width:120px;height:120px;filter:drop-shadow(0 0 8px #fff) drop-shadow(0 0 22px rgba(255,255,255,.45))}@keyframes scd-social-lock-glow{0%{opacity:0;transform:scale(.75)}18%,72%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.06)}}
.scd-social-avatar-wrap{border:0;padding:0;background:transparent;color:inherit;cursor:pointer;overflow:visible}.scd-social-avatar-wrap>.scd-social-avatar{pointer-events:none}
.scd-social-row,.scd-home-friend{position:relative;padding-right:24px}.scd-social-list{padding:8px 5px 2px}.scd-home-friends-list{padding:8px 5px 2px}.scd-home-friend{border-radius:7px;margin-bottom:6px}
.scd-social-pin{position:absolute!important;right:-5px;top:-7px;width:22px!important;height:22px!important;padding:0!important;z-index:3;opacity:.6;background:transparent!important;transition:opacity .18s ease,transform .18s ease;filter:drop-shadow(2px 2px 0 rgba(0,0,0,.35))}.scd-social-pin.pinned{opacity:1}.scd-social-pin:hover{transform:translateY(-1px)}.scd-social-pin .scd-icon{width:22px!important;height:22px!important}
.scd-social-detail-header .scd-modal-title{min-width:0}.scd-social-detail-header .scd-social-identity{width:100%}.scd-social-detail-header .scd-social-status-text{max-width:360px}
.scd-social-detail-body{position:relative}.scd-social-message-form{grid-template-columns:minmax(0,1fr) 36px auto;align-items:center}.scd-social-message-form .scd-social-emoji-toggle{width:36px;height:36px}
.scd-social-emoji-picker{position:absolute;left:12px;right:12px;bottom:62px;z-index:5;padding:10px;border-radius:9px;background:var(--COLOR_PANEL_BG);box-shadow:0 5px 20px rgba(0,0,0,.3);max-height:240px;overflow:auto}.scd-social-emoji-picker[hidden],.scd-social-load-history[hidden]{display:none!important}
.scd-social-emoji-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(38px,1fr));gap:5px}.scd-social-emoji-choice{display:grid;place-items:center;width:38px;height:38px;padding:3px}.scd-social-emoji-choice img{width:32px;height:32px;object-fit:contain;transition:transform .15s}.scd-social-emoji-choice:hover img{transform:scale(1.1)}.scd-social-emoji{display:inline-block;width:26px;height:26px;object-fit:contain;vertical-align:middle;margin:0 2px}
.scd-social-message.pending{opacity:.65}.scd-social-message.failed{outline:1px solid #de523d}.scd-social-message-state{font-size:10px}.scd-social-message-retry{padding:3px 8px;font-size:11px}.scd-social-load-history{width:100%;margin-bottom:8px}.scd-social-chat-retention{font-size:10px;margin-top:6px}
.scd-social-profile-card{position:relative;display:flex;flex-direction:column;gap:18px;padding:12px 7px}.scd-social-profile-card>.scd-social-identity{padding-right:45px}.scd-social-profile-card .scd-social-avatar-wrap,.scd-social-profile-card .scd-social-avatar{width:82px!important;height:82px!important}.scd-social-profile-card .scd-social-status-icon{width:30px;height:30px;right:-4px;bottom:-4px}.scd-social-profile-card .scd-social-status-icon[aria-label='Online']{width:39px}.scd-social-profile-card .scd-social-name{font-size:20px}.scd-social-profile-card .scd-social-status-text{font-size:13px;max-width:350px}
.scd-social-profile-friend-action{position:absolute;right:3px;top:12px}.scd-social-profile-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:4px 5px}.scd-social-public-stat{position:relative;min-width:0;overflow:visible}.scd-social-stat-icon{grid-row:1/3;width:32px;height:32px;object-fit:contain}.scd-social-public-stat .scd-profile-pin-icon .scd-icon-image{width:100%;height:100%;object-fit:contain}

@media(max-width:680px){.scd-social-row{grid-template-columns:1fr}.scd-social-actions{justify-content:flex-end}.scd-home-friends{width:min(330px,calc(100vw - 16px))}.scd-social-header{grid-template-columns:minmax(0,1fr) 34px}}
`;
    document.head.appendChild(style);
  }
}
