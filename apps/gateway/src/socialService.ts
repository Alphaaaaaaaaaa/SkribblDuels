import { randomUUID } from 'node:crypto';
import { STARTER_CHALLENGE_IDS } from '@skribbl-duels/challenge-definitions';
import type {
  GatewayClientIdentity,
  GatewayClientMessage,
  GatewayErrorMessage,
  GatewayFriendSearchResultMessage,
  GatewayServerMessage,
  GatewaySocialEventMessage,
  GatewaySocialLobbyPresence,
  GatewaySocialProfile,
  GatewaySocialSnapshotMessage
} from '@skribbl-duels/gateway-contracts';
import {
  SocialPersistenceError,
  type GatewaySocialGraph,
  type GatewaySocialPersistence,
  type GatewaySocialStoredPreferences,
  type GatewaySocialStoredProfile
} from './socialPersistence';

interface LiveSocialPresence {
  identity: GatewayClientIdentity;
  page: 'home' | 'lobby';
  lobby: GatewaySocialLobbyPresence | null;
  connectedAt: number;
  updatedAt: number;
}

export interface PendingFriendMatchInvite {
  inviteId: string;
  inviteToken: string;
  senderAccountId: string;
  recipientAccountId: string;
  format: 'casual' | 'ranked';
  expiresAt: number;
}

interface GatewaySocialServiceOptions {
  persistence: GatewaySocialPersistence;
  send(accountId: string, message: GatewayServerMessage): void;
  isAccountInActiveMatch(accountId: string): boolean;
  log(event: string, details: Record<string, unknown>): void;
}

type SocialCommand = Extract<GatewayClientMessage, { type:
  | 'SOCIAL_SYNC' | 'SOCIAL_PREFERENCES_SET' | 'SOCIAL_PROFILE_STATUS_SET' | 'SOCIAL_PRESENCE_SET'
  | 'FRIEND_SEARCH' | 'FRIEND_REQUEST_SEND' | 'FRIEND_REQUEST_RESPOND' | 'FRIEND_REQUEST_WITHDRAW'
  | 'FRIEND_REMOVE' | 'FRIEND_PIN_SET' | 'FRIEND_MESSAGE_SEND'
}>;

const SOCIAL_STATUS_CHALLENGE_IDS = new Set<string>(STARTER_CHALLENGE_IDS);

function gatewayError(code: string, message: string, requestId?: string): GatewayErrorMessage {
  return { type: 'ERROR', code, message, recoverable: true, ...(requestId ? { requestId } : {}) };
}

function commandRequestId(message: SocialCommand): string {
  return 'requestId' in message ? message.requestId : message.clientMessageId;
}

export class GatewaySocialService {
  private readonly live = new Map<string, LiveSocialPresence>();
  private readonly lastSeen = new Map<string, number>();
  private readonly pendingMatchInvites = new Map<string, PendingFriendMatchInvite>();

  public constructor(private readonly options: GatewaySocialServiceOptions) {}

  public async connected(identity: GatewayClientIdentity): Promise<void> {
    const now = Date.now();
    this.live.set(identity.accountId, { identity: structuredClone(identity), page: 'home', lobby: null, connectedAt: now, updatedAt: now });
    this.lastSeen.set(identity.accountId, now);
    await this.publishSnapshot(identity.accountId, null);
    await this.publishToFriends(identity.accountId);
  }

  public async disconnected(accountId: string): Promise<void> {
    this.live.delete(accountId);
    this.lastSeen.set(accountId, Date.now());
    await this.publishToFriends(accountId);
  }

  public clear(): void {
    this.live.clear();
    this.pendingMatchInvites.clear();
  }

  public async refreshAll(): Promise<void> {
    await Promise.all([...this.live.keys()].map(accountId => this.publishSnapshot(accountId, null)));
  }

  public async handle(accountId: string, message: SocialCommand): Promise<void> {
    try {
      if (message.type === 'SOCIAL_SYNC') {
        await this.publishSnapshot(accountId, message.requestId);
      } else if (message.type === 'SOCIAL_PREFERENCES_SET') {
        await this.options.persistence.setPreferences(accountId, message.preferences);
        await this.publishSnapshot(accountId, message.requestId);
        await this.publishToFriends(accountId);
      } else if (message.type === 'SOCIAL_PROFILE_STATUS_SET') {
        if (message.challengeId !== null && !SOCIAL_STATUS_CHALLENGE_IDS.has(message.challengeId)) {
          throw new SocialPersistenceError('INVALID_STATUS_ICON', 'This profile status icon is not available.');
        }
        await this.options.persistence.setProfileStatus(accountId, message.challengeId, message.text.trim());
        await this.publishSnapshot(accountId, message.requestId);
        await this.publishToFriends(accountId);
      } else if (message.type === 'SOCIAL_PRESENCE_SET') {
        const live = this.live.get(accountId);
        if (live) {
          live.page = message.page;
          live.lobby = message.lobby ? structuredClone(message.lobby) : null;
          live.updatedAt = Date.now();
          this.lastSeen.set(accountId, live.updatedAt);
        }
        await this.publishSnapshot(accountId, message.requestId);
        await this.publishToFriends(accountId);
      } else if (message.type === 'FRIEND_SEARCH') {
        await this.search(accountId, message.requestId, message.discordUsername);
      } else if (message.type === 'FRIEND_REQUEST_SEND') {
        const request = await this.options.persistence.sendFriendRequest(accountId, message.accountId);
        await this.publishSnapshot(accountId, message.requestId);
        await this.publishSnapshot(message.accountId, null);
        await this.sendEvent(message.accountId, 'friend-request-received', accountId, { friendRequestId: request.friendRequestId });
      } else if (message.type === 'FRIEND_REQUEST_RESPOND') {
        const result = await this.options.persistence.respondToFriendRequest(accountId, message.friendRequestId, message.response);
        await this.publishSnapshot(accountId, message.requestId);
        await this.publishSnapshot(result.otherAccountId, null);
        if (message.response === 'accept') {
          await this.sendEvent(result.otherAccountId, 'friend-request-accepted', accountId, { friendRequestId: message.friendRequestId });
        }
      } else if (message.type === 'FRIEND_REQUEST_WITHDRAW') {
        const other = await this.options.persistence.withdrawFriendRequest(accountId, message.friendRequestId);
        await this.publishSnapshot(accountId, message.requestId);
        await this.publishSnapshot(other, null);
      } else if (message.type === 'FRIEND_REMOVE') {
        await this.options.persistence.removeFriend(accountId, message.accountId);
        await this.publishSnapshot(accountId, message.requestId);
        await this.publishSnapshot(message.accountId, null);
        await this.sendEvent(message.accountId, 'friend-removed', accountId);
      } else if (message.type === 'FRIEND_PIN_SET') {
        await this.options.persistence.setFriendPin(accountId, message.accountId, message.pinned);
        await this.publishSnapshot(accountId, message.requestId);
      } else if (message.type === 'FRIEND_MESSAGE_SEND') {
        if (await this.options.persistence.relationship(accountId, message.accountId) !== 'friend') {
          throw new SocialPersistenceError('FRIEND_NOT_FOUND', 'Quick Messages can only be sent to friends.');
        }
        if (!this.live.has(message.accountId)) {
          throw new SocialPersistenceError('FRIEND_OFFLINE', 'This friend is offline. Quick Messages are not stored on the server.');
        }
        await this.sendEvent(message.accountId, 'friend-message-received', accountId, {
          clientMessageId: message.clientMessageId, message: message.message.trim()
        });
        await this.sendEvent(accountId, 'friend-message-sent', message.accountId, {
          clientMessageId: message.clientMessageId, message: message.message.trim()
        });
      }
    } catch (error) {
      const code = error instanceof SocialPersistenceError ? error.code : 'SOCIAL_ACTION_FAILED';
      const detail = error instanceof SocialPersistenceError ? error.message : 'The social action could not be completed. Please try again.';
      this.options.log('social-command-error', { accountId, commandType: message.type, error: error instanceof Error ? error.message : String(error) });
      this.options.send(accountId, gatewayError(code, detail, commandRequestId(message)));
    }
  }

  public async canSendMatchInvite(senderAccountId: string, recipientAccountId: string): Promise<void> {
    if (await this.options.persistence.relationship(senderAccountId, recipientAccountId) !== 'friend') {
      throw new SocialPersistenceError('FRIEND_NOT_FOUND', 'Match invitations can only be sent to friends.');
    }
    const preferences = await this.options.persistence.getPreferences(recipientAccountId);
    if (!preferences.receiveMatchInvites) throw new SocialPersistenceError('MATCH_INVITES_DISABLED', 'This friend is not accepting Match invitations.');
    if (!this.live.has(recipientAccountId)) throw new SocialPersistenceError('FRIEND_OFFLINE', 'This friend is currently offline.');
    if (this.options.isAccountInActiveMatch(recipientAccountId)) throw new SocialPersistenceError('FRIEND_IN_DUEL', 'This friend is already in an active Duel.');
  }

  public async deliverMatchInvite(input: PendingFriendMatchInvite): Promise<void> {
    this.pruneMatchInvites();
    for (const [inviteId, invite] of this.pendingMatchInvites) {
      if (invite.senderAccountId === input.senderAccountId) this.pendingMatchInvites.delete(inviteId);
    }
    this.pendingMatchInvites.set(input.inviteId, { ...input });
    await this.sendEvent(input.recipientAccountId, 'match-invite-received', input.senderAccountId, {
      inviteId: input.inviteId, inviteToken: input.inviteToken, format: input.format
    });
  }

  public matchInvite(inviteId: string, recipientAccountId: string): PendingFriendMatchInvite | null {
    this.pruneMatchInvites();
    const invite = this.pendingMatchInvites.get(inviteId);
    return invite?.recipientAccountId === recipientAccountId ? { ...invite } : null;
  }

  public async matchInviteResponded(inviteId: string, accepted: boolean): Promise<void> {
    const invite = this.pendingMatchInvites.get(inviteId);
    if (!invite) return;
    this.pendingMatchInvites.delete(inviteId);
    if (!accepted) await this.sendEvent(invite.senderAccountId, 'match-invite-declined', invite.recipientAccountId, {
      inviteId, format: invite.format
    });
  }

  private async search(accountId: string, requestId: string, username: string): Promise<void> {
    const found = await this.options.persistence.findProfileByDiscordUsername(username);
    let relationship: GatewayFriendSearchResultMessage['relationship'] = 'none';
    let profile: GatewaySocialProfile | null = null;
    if (found) {
      relationship = found.accountId === accountId ? 'self' : await this.options.persistence.relationship(accountId, found.accountId);
      profile = await this.profileFor(found, accountId, relationship === 'friend', false);
      if (relationship === 'blocked') {
        profile = {
          ...profile,
          statusChallengeId: null,
          statusText: '',
          presence: 'offline',
          lastSeenAt: null,
          lobby: null,
          canJoinLobby: false
        };
      }
    }
    this.options.send(accountId, { type: 'FRIEND_SEARCH_RESULT', requestId, profile, relationship });
  }

  private async publishSnapshot(accountId: string, requestId: string | null): Promise<void> {
    if (!this.live.has(accountId)) return;
    const graph = await this.options.persistence.getGraph(accountId);
    const accountIds = [...new Set([
      ...graph.friendIds,
      ...graph.requests.map(request => request.senderId === accountId ? request.recipientId : request.senderId)
    ])];
    const [stored, storedPreferences] = await Promise.all([
      this.options.persistence.getProfiles(accountIds),
      this.options.persistence.getPreferencesForAccounts(accountIds)
    ]);
    const friendSet = new Set(graph.friendIds);
    const pinned = new Set(graph.pinnedFriendIds);
    const profiles = new Map<string, GatewaySocialProfile>();
    for (const [id, profile] of stored) {
      profiles.set(id, await this.profileFor(
        profile,
        accountId,
        friendSet.has(id),
        pinned.has(id),
        storedPreferences.get(id)
      ));
    }
    const friends = graph.friendIds.map(id => profiles.get(id)).filter((profile): profile is GatewaySocialProfile => Boolean(profile))
      .sort((left, right) => Number(right.pinned) - Number(left.pinned) || left.displayName.localeCompare(right.displayName));
    const requests = graph.requests.map(request => {
      const otherId = request.senderId === accountId ? request.recipientId : request.senderId;
      const profile = profiles.get(otherId);
      return profile ? {
        friendRequestId: request.friendRequestId,
        direction: request.senderId === accountId ? 'outgoing' as const : 'incoming' as const,
        status: request.status,
        profile,
        createdAt: request.createdAt
      } : null;
    }).filter((request): request is NonNullable<typeof request> => Boolean(request));
    const message: GatewaySocialSnapshotMessage = {
      type: 'SOCIAL_SNAPSHOT', requestId, revision: graph.preferences.revision,
      preferences: {
        availability: graph.preferences.availability,
        profileStatusVisibility: graph.preferences.profileStatusVisibility,
        lobbyStatusVisibility: graph.preferences.lobbyStatusVisibility,
        allowLobbyJoin: graph.preferences.allowLobbyJoin,
        receiveFriendRequests: graph.preferences.receiveFriendRequests,
        receiveMatchInvites: graph.preferences.receiveMatchInvites
      },
      statusChallengeId: graph.preferences.statusChallengeId,
      statusText: graph.preferences.statusText,
      friends, requests
    };
    this.options.send(accountId, message);
  }

  private async publishToFriends(accountId: string): Promise<void> {
    let graph: GatewaySocialGraph;
    try { graph = await this.options.persistence.getGraph(accountId); }
    catch (error) {
      this.options.log('social-presence-publish-error', { accountId, error: error instanceof Error ? error.message : String(error) });
      return;
    }
    await Promise.all(graph.friendIds.filter(id => this.live.has(id)).map(id => this.publishSnapshot(id, null)));
  }

  private async profileFor(
    stored: GatewaySocialStoredProfile,
    viewerAccountId: string,
    isFriend: boolean,
    pinned: boolean,
    storedPreferences?: GatewaySocialStoredPreferences
  ): Promise<GatewaySocialProfile> {
    const preferences = storedPreferences ?? await this.options.persistence.getPreferences(stored.accountId);
    const live = this.live.get(stored.accountId);
    const visibleOnline = preferences.availability !== 'offline' && Boolean(live);
    const presence = !visibleOnline ? 'offline' as const
      : this.options.isAccountInActiveMatch(stored.accountId) ? 'duel' as const : preferences.availability;
    const canSeeStatus = stored.accountId === viewerAccountId || preferences.profileStatusVisibility === 'everyone'
      || (preferences.profileStatusVisibility === 'friends' && isFriend);
    const canSeeLobby = visibleOnline && Boolean(live?.lobby) && (stored.accountId === viewerAccountId
      || preferences.lobbyStatusVisibility === 'everyone' || (preferences.lobbyStatusVisibility === 'friends' && isFriend));
    return {
      ...stored,
      statusChallengeId: canSeeStatus ? preferences.statusChallengeId : null,
      statusText: canSeeStatus ? preferences.statusText : '',
      presence,
      lastSeenAt: visibleOnline ? null : (this.lastSeen.get(stored.accountId) ?? null),
      lobby: canSeeLobby ? structuredClone(live!.lobby) : null,
      canJoinLobby: canSeeLobby && preferences.allowLobbyJoin && live?.lobby?.lobbyType === 'public',
      pinned
    };
  }

  private async sendEvent(
    recipientAccountId: string,
    kind: GatewaySocialEventMessage['kind'],
    actorAccountId: string,
    details: Partial<Pick<GatewaySocialEventMessage, 'friendRequestId' | 'clientMessageId' | 'message' | 'inviteId' | 'inviteToken' | 'format'>> = {}
  ): Promise<void> {
    if (!this.live.has(recipientAccountId)) return;
    const actor = (await this.options.persistence.getProfiles([actorAccountId])).get(actorAccountId);
    if (!actor) return;
    const isFriend = await this.options.persistence.relationship(recipientAccountId, actorAccountId) === 'friend';
    const profile = await this.profileFor(actor, recipientAccountId, isFriend, false);
    this.options.send(recipientAccountId, {
      type: 'SOCIAL_EVENT', eventId: `social-${randomUUID()}`, kind, profile,
      friendRequestId: details.friendRequestId ?? null,
      clientMessageId: details.clientMessageId ?? null,
      message: details.message ?? null,
      inviteId: details.inviteId ?? null,
      inviteToken: details.inviteToken ?? null,
      format: details.format ?? null,
      occurredAt: Date.now()
    });
  }

  private pruneMatchInvites(): void {
    const now = Date.now();
    for (const [id, invite] of this.pendingMatchInvites) if (invite.expiresAt <= now) this.pendingMatchInvites.delete(id);
  }
}
