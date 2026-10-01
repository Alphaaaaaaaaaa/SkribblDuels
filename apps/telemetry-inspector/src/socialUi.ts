import type {
  GatewayFriendRequestSummary,
  GatewaySocialEventMessage,
  GatewaySocialAvailability,
  GatewaySocialLobbyPresence,
  GatewaySocialPreferences,
  GatewaySocialProfile
} from '@skribbl-duels/gateway-contracts';
import { type SocketIoGatewayClient, type GatewayConnectionSnapshot } from '@skribbl-duels/gateway-client';
import { EMBEDDED_PROGRESSION_ASSETS, type ProgressionAssetId } from './generatedProgressionAssets';
import { appendColoredDuelName } from './nameColors';

interface SocialLobbySnapshot {
  hydrated: boolean;
  lobbyId: string | null;
  lobbyType: number | null;
  languageName: string | null;
  playerCount: number;
  maxPlayers: number | null;
}

interface SocialUiOptions {
  runtimeId: string;
  gateway: SocketIoGatewayClient;
  getGatewayState(): GatewayConnectionSnapshot;
  getLobbySnapshot(): SocialLobbySnapshot;
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
}

interface LocalSocialUiPreferences {
  version: 1;
  showHomepageList: boolean;
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
    const parsed = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? 'null') as Partial<LocalSocialUiPreferences> | null;
    const anchors = new Set(['bottom-left', 'bottom-right', 'top-left', 'top-right']);
    return {
      version: 1,
      showHomepageList: typeof parsed?.showHomepageList === 'boolean' ? parsed.showHomepageList : true,
      homepageAnchor: anchors.has(String(parsed?.homepageAnchor))
        ? parsed!.homepageAnchor as LocalSocialUiPreferences['homepageAnchor'] : 'bottom-left'
    };
  } catch {
    return { version: 1, showHomepageList: true, homepageAnchor: 'bottom-left' };
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

  public constructor(private readonly options: SocialUiOptions) {}

  public start(): void {
    this.ensureStyles();
    this.loadMessages();
    this.syncPresence();
    this.presencePoll = window.setInterval(() => this.syncPresence(), 2_000);
    this.renderHomepageList();
  }

  public stop(): void {
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
      this.loadMessages();
    }
    for (const event of next.socialEvents) {
      if (this.handledEvents.has(event.eventId)) continue;
      this.handledEvents.add(event.eventId);
      this.handleSocialEvent(event);
    }
    if (next.socialError && next.socialError.requestId !== previous.socialError?.requestId) {
      this.optimisticAvailability = null;
      if (next.socialError.requestId === this.searchRequestId) this.searchRequestId = null;
      this.refreshProfileControls();
      this.options.showToast('Social action unavailable', next.socialError.message, 7_000);
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
      this.renderHomepageList();
      if (this.modal?.isConnected) this.renderModal();
      this.refreshProfileControls();
    }
    if (friendSearchChanged && this.modal?.isConnected) this.renderModal();
    if (next.status === 'connected' && previous.status !== 'connected') {
      this.lastPresenceFingerprint = '';
      this.syncPresence();
    }
  }

  public decorateProfileAvatar(avatar: HTMLElement): void {
    avatar.classList.add('scd-social-profile-avatar');
    const current = this.options.getGatewayState();
    const activeDuel = Boolean(current.match && current.match.state.phase !== 'finished' && current.match.state.phase !== 'cancelled');
    const availability = this.effectiveAvailability(current);
    const presence = availability === 'offline' ? 'offline' : activeDuel ? 'duel' : availability;
    const badge = element('button', 'scd-social-presence-badge') as HTMLButtonElement;
    badge.type = 'button';
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
      target.appendChild(card);
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
    const homepage = element('div', 'scd-card scd-stack');
    homepage.appendChild(element('strong', '', 'Homepage friends list'));
    homepage.appendChild(this.checkbox('Show friends list on homepage', this.uiPreferences.showHomepageList, value => {
      this.uiPreferences.showHomepageList = value; this.saveUiPreferences(); this.renderHomepageList();
    }));
    homepage.appendChild(select('Position', this.uiPreferences.homepageAnchor,
      ['bottom-left', 'bottom-right', 'top-left', 'top-right'] as const, value => {
        this.uiPreferences.homepageAnchor = value; this.saveUiPreferences(); this.renderHomepageList();
      }));
    target.append(card, homepage);
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
    document.querySelectorAll<HTMLButtonElement>('.scd-social-presence-badge').forEach(badge => {
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
    for (const friend of friends) list.appendChild(this.createFriendRow(friend, true));
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
    actions.appendChild(this.iconButton('friendPin', friend.pinned ? 'Unpin friend' : 'Pin friend',
      () => this.options.gateway.setFriendPinned(friend.accountId, !friend.pinned), friend.pinned ? 'selected' : ''));
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

  private createIdentity(profile: GatewaySocialProfile): HTMLElement {
    const identity = element('div', 'scd-social-identity');
    const avatarWrap = element('div', 'scd-social-avatar-wrap');
    avatarWrap.append(this.options.createAvatar(profile, 'scd-social-avatar'), icon(presenceAsset(profile), presenceLabel(profile), 'scd-social-status-icon'));
    const copy = element('div', 'scd-social-copy');
    const name = element('div', 'scd-social-name');
    appendColoredDuelName(name, profile.displayName, profile.nameColorIndex);
    const lobby = profile.presence === 'duel' ? 'Active Duel'
      : profile.lobby ? `${profile.lobby.languageName} ${profile.lobby.lobbyType === 'public' ? 'Public' : 'Private'} ${profile.lobby.playerCount}/${profile.lobby.maxPlayers}`
      : profile.presence === 'online' || profile.presence === 'idle' ? 'Viewing Homepage' : 'Offline';
    copy.append(name, element('div', 'scd-muted scd-social-lobby', lobby));
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
    this.unread.delete(friend.accountId); this.renderHomepageList();
    this.openDetail(`Quick Messages · ${friend.displayName}`, body => {
      const history = element('div', 'scd-social-message-history');
      const entries = this.messages.filter(item => item.accountId === friend.accountId);
      if (entries.length === 0) history.appendChild(element('div', 'scd-muted', 'Messages are stored only in this browser and are delivered only while both friends are online.'));
      for (const message of entries) {
        const row = element('div', `scd-social-message ${message.direction}`);
        row.append(element('span', 'scd-social-message-author', message.direction === 'outgoing' ? 'You' : friend.displayName), element('span', '', message.message));
        history.appendChild(row);
      }
      const form = element('form', 'scd-social-message-form') as HTMLFormElement;
      const input = element('input') as HTMLInputElement;
      input.type = 'text'; input.maxLength = 300; input.placeholder = friend.presence === 'offline' ? 'Friend is offline' : 'Write a Quick Message…'; input.disabled = friend.presence === 'offline';
      const send = element('button', 'scd-button primary', 'Send') as HTMLButtonElement;
      send.type = 'submit'; send.disabled = input.disabled;
      form.addEventListener('submit', event => {
        event.preventDefault(); const message = input.value.trim(); if (!message) return;
        this.options.gateway.sendFriendMessage(friend.accountId, message); input.value = '';
      });
      form.append(input, send); body.append(history, form);
      queueMicrotask(() => { history.scrollTop = history.scrollHeight; input.focus(); });
    });
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

  private closeDetail(): void { this.detailModal?.remove(); this.detailModal = null; this.options.onModalVisibilityChanged(); }
  private closeFriends(): void { this.closeDetail(); this.modal?.remove(); this.modal = null; this.options.onModalVisibilityChanged(); }
  private closeAll(): void { this.closeFriends(); }

  private handleSocialEvent(event: GatewaySocialEventMessage): void {
    if (event.kind === 'friend-message-received' && event.message && event.clientMessageId) {
      this.recordMessage({ id: event.clientMessageId, accountId: event.profile.accountId, direction: 'incoming', message: event.message, occurredAt: event.occurredAt });
      this.unread.add(event.profile.accountId);
      this.actionToast(`${event.profile.displayName} sent a message`, event.message, event.profile,
        [{ label: 'Reply', action: () => this.openMessages(event.profile), primary: true }]);
    } else if (event.kind === 'friend-message-sent' && event.message && event.clientMessageId) {
      this.recordMessage({ id: event.clientMessageId, accountId: event.profile.accountId, direction: 'outgoing', message: event.message, occurredAt: event.occurredAt });
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
    const closeToast = (): void => { toast.classList.add('closing'); window.setTimeout(() => toast.remove(), 150); };
    const close = element('span', 'close-toast', '×'); close.addEventListener('click', closeToast);
    const identity = element('div', 'scd-toast-profile');
    identity.append(this.options.createAvatar(profile, 'scd-toast-avatar'), element('strong', '', titleText));
    const buttons = element('div', 'typo-toast-confirm');
    for (const item of actions) {
      const button = element('button', `scd-button${item.primary ? ' primary' : ''}`, item.label) as HTMLButtonElement;
      button.type = 'button'; button.addEventListener('click', () => { item.action(); closeToast(); }); buttons.appendChild(button);
    }
    toast.append(identity, close, element('span', '', message), buttons); container.appendChild(toast);
  }

  private renderHomepageList(): void {
    this.homepageList?.remove(); this.homepageList = null;
    const state = this.options.getGatewayState();
    if (!this.uiPreferences.showHomepageList || !this.options.isHomepageVisible() || state.status !== 'connected' || !state.social) return;
    const panel = element('aside', `scd-home-friends ${this.uiPreferences.homepageAnchor}`);
    panel.dataset.scdRuntimeId = this.options.runtimeId;
    const header = element('button', 'scd-home-friends-header') as HTMLButtonElement;
    header.type = 'button'; header.append(icon('friendList', 'Friends list'), element('strong', '', `Friends · ${state.social.friends.length}`));
    header.addEventListener('click', () => this.openFriends()); this.options.registerTooltip(header, 'Open friends list', 'Y');
    const list = element('div', 'scd-home-friends-list');
    if (state.social.friends.length === 0) list.appendChild(element('div', 'scd-muted scd-home-friends-empty', 'No friends yet'));
    for (const friend of state.social.friends) {
      const row = element('div', `scd-home-friend presence-${friend.presence}`);
      row.appendChild(this.createIdentity(friend));
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
    const lobby = this.options.getLobbySnapshot();
    const page: 'home' | 'lobby' = lobby.hydrated && lobby.lobbyId ? 'lobby' : 'home';
    const socialLobby: GatewaySocialLobbyPresence | null = page === 'lobby' ? {
      lobbyId: lobby.lobbyId!, lobbyType: lobby.lobbyType === 0 ? 'public' : 'private',
      languageName: lobby.languageName ?? 'Unknown language', playerCount: Math.max(0, lobby.playerCount),
      maxPlayers: Math.max(1, Math.min(32, lobby.maxPlayers ?? 8))
    } : null;
    const fingerprint = JSON.stringify([state.connectionId, page, socialLobby]);
    if (fingerprint !== this.lastPresenceFingerprint) {
      this.lastPresenceFingerprint = fingerprint;
      try { this.options.gateway.setSocialPresence(page, socialLobby); } catch {}
    }
    if (homepageVisibilityChanged) this.renderHomepageList();
  }

  private recordMessage(message: LocalFriendMessage): void {
    if (this.messages.some(item => item.id === message.id)) return;
    this.messages.push(message); this.messages = this.messages.slice(-500); this.saveMessages();
  }

  private loadMessages(): void {
    this.messages = [];
    const accountId = this.options.getGatewayState().identity?.accountId;
    if (!accountId) return;
    try {
      const parsed = JSON.parse(localStorage.getItem(`${MESSAGE_STORAGE_PREFIX}${accountId}`) ?? '[]') as LocalFriendMessage[];
      this.messages = Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === 'string'
        && typeof item.accountId === 'string' && (item.direction === 'incoming' || item.direction === 'outgoing')
        && typeof item.message === 'string' && Number.isFinite(item.occurredAt)).slice(-500) : [];
    } catch {}
  }

  private saveMessages(): void {
    const accountId = this.options.getGatewayState().identity?.accountId;
    if (!accountId) return;
    try { localStorage.setItem(`${MESSAGE_STORAGE_PREFIX}${accountId}`, JSON.stringify(this.messages)); } catch {}
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
@media(max-width:680px){.scd-social-row{grid-template-columns:1fr}.scd-social-actions{justify-content:flex-end}.scd-home-friends{width:min(330px,calc(100vw - 16px))}.scd-social-header{grid-template-columns:minmax(0,1fr) 34px}}
`;
    document.head.appendChild(style);
  }
}
