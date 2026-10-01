import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  GatewaySocialAvailability,
  GatewaySocialPreferences,
  GatewaySocialVisibility
} from '@skribbl-duels/gateway-contracts';

export interface GatewaySocialStoredProfile {
  accountId: string;
  displayName: string;
  discordUsername: string;
  avatarSource: 'discord' | 'skribbl';
  avatarUrl: string | null;
  skribblAvatar: readonly [number, number, number, number] | null;
  specialAvatarId: string | null;
  invisibleAvatarEntitled: boolean;
  nameColorIndex: number;
}

export interface GatewaySocialStoredPreferences extends GatewaySocialPreferences {
  statusChallengeId: string | null;
  statusText: string;
  revision: number;
}

export interface GatewaySocialStoredRequest {
  friendRequestId: string;
  senderId: string;
  recipientId: string;
  status: 'pending' | 'ignored';
  createdAt: number;
}

export interface GatewaySocialGraph {
  preferences: GatewaySocialStoredPreferences;
  friendIds: string[];
  pinnedFriendIds: string[];
  requests: GatewaySocialStoredRequest[];
}

export class SocialPersistenceError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'SocialPersistenceError';
  }
}

export interface GatewaySocialPersistence {
  checkHealth?(): Promise<void>;
  getProfiles(accountIds: readonly string[]): Promise<Map<string, GatewaySocialStoredProfile>>;
  getPreferencesForAccounts(accountIds: readonly string[]): Promise<Map<string, GatewaySocialStoredPreferences>>;
  findProfileByDiscordUsername(username: string): Promise<GatewaySocialStoredProfile | null>;
  getPreferences(accountId: string): Promise<GatewaySocialStoredPreferences>;
  setPreferences(accountId: string, preferences: GatewaySocialPreferences): Promise<GatewaySocialStoredPreferences>;
  setProfileStatus(accountId: string, challengeId: string | null, text: string): Promise<GatewaySocialStoredPreferences>;
  getGraph(accountId: string): Promise<GatewaySocialGraph>;
  relationship(accountId: string, otherAccountId: string): Promise<'friend' | 'incoming-request' | 'outgoing-request' | 'blocked' | 'none'>;
  sendFriendRequest(senderId: string, recipientId: string): Promise<GatewaySocialStoredRequest>;
  respondToFriendRequest(accountId: string, friendRequestId: string, response: 'accept' | 'decline' | 'ignore' | 'block'): Promise<{ request: GatewaySocialStoredRequest; otherAccountId: string }>;
  withdrawFriendRequest(accountId: string, friendRequestId: string): Promise<string>;
  canUnblock(accountId: string, blockedId: string): Promise<boolean>;
  unblockAccount(accountId: string, blockedId: string): Promise<void>;
  removeFriend(accountId: string, friendId: string): Promise<void>;
  setFriendPin(accountId: string, friendId: string, pinned: boolean): Promise<void>;
}

interface PreferenceRow {
  availability: string;
  profile_status_visibility: string;
  lobby_status_visibility: string;
  allow_lobby_join: boolean;
  receive_friend_requests: boolean;
  receive_match_invites: boolean;
  status_challenge_id: string | null;
  status_text: string;
  revision: number | string;
}

const DEFAULT_PREFERENCES: GatewaySocialStoredPreferences = {
  availability: 'online',
  profileStatusVisibility: 'everyone',
  lobbyStatusVisibility: 'friends',
  allowLobbyJoin: true,
  receiveFriendRequests: true,
  receiveMatchInvites: true,
  statusChallengeId: null,
  statusText: '',
  revision: 0
};

function preferenceRow(row: PreferenceRow | null): GatewaySocialStoredPreferences {
  if (!row) return { ...DEFAULT_PREFERENCES };
  const availability: GatewaySocialAvailability = row.availability === 'idle' || row.availability === 'offline'
    ? row.availability : 'online';
  const visibility = (value: string, fallback: GatewaySocialVisibility): GatewaySocialVisibility => (
    value === 'everyone' || value === 'friends' || value === 'nobody' ? value : fallback
  );
  return {
    availability,
    profileStatusVisibility: visibility(row.profile_status_visibility, 'everyone'),
    lobbyStatusVisibility: visibility(row.lobby_status_visibility, 'friends'),
    allowLobbyJoin: row.allow_lobby_join !== false,
    receiveFriendRequests: row.receive_friend_requests !== false,
    receiveMatchInvites: row.receive_match_invites !== false,
    statusChallengeId: typeof row.status_challenge_id === 'string' ? row.status_challenge_id : null,
    statusText: String(row.status_text ?? '').slice(0, 80),
    revision: Number(row.revision ?? 0)
  };
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) throw new Error('Social persistence returned an invalid timestamp.');
  return parsed;
}

function canonicalPair(left: string, right: string): { account_low: string; account_high: string } {
  return left < right ? { account_low: left, account_high: right } : { account_low: right, account_high: left };
}

export class SupabaseGatewaySocialPersistence implements GatewaySocialPersistence {
  private readonly client: SupabaseClient;

  public constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
    });
  }

  public async checkHealth(): Promise<void> {
    const [{ error }, contract] = await Promise.all([
      this.client.from('duel_social_preferences').select('profile_id', { head: true, count: 'exact' }).limit(1),
      this.client.rpc('gateway_social_contract_version')
    ]);
    if (error) throw new Error(`Social persistence health check failed: ${error.message}`);
    if (contract.error) throw new Error(`Social Contract v16 health check failed: ${contract.error.message}`);
    if (Number(contract.data) !== 16) {
      throw new Error(`Social Contract v16 is required; database reported v${String(contract.data)}.`);
    }
  }

  public async getProfiles(accountIds: readonly string[]): Promise<Map<string, GatewaySocialStoredProfile>> {
    const unique = [...new Set(accountIds)].filter(Boolean);
    const result = new Map<string, GatewaySocialStoredProfile>();
    if (unique.length === 0) return result;
    const [{ data, error }, entitlementResult] = await Promise.all([
      this.client.from('profiles')
        .select('id, display_name, username, avatar_source, avatar_url, skribbl_avatar, special_avatar_id, name_color_index')
        .in('id', unique),
      this.client.from('avatar_invisible_entitlements').select('profile_id').in('profile_id', unique)
    ]);
    if (error) throw new Error(`Unable to load social profiles: ${error.message}`);
    if (entitlementResult.error) throw new Error(`Unable to load social avatar entitlements: ${entitlementResult.error.message}`);
    const invisible = new Set((entitlementResult.data ?? []).map(row => String(row.profile_id)));
    for (const row of data ?? []) {
      const avatar = Array.isArray(row.skribbl_avatar) && row.skribbl_avatar.length === 4
        ? row.skribbl_avatar.map(Number) as [number, number, number, number] : null;
      result.set(String(row.id), {
        accountId: String(row.id),
        displayName: String(row.display_name),
        discordUsername: String(row.username),
        avatarSource: row.avatar_source === 'skribbl' ? 'skribbl' : 'discord',
        avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
        skribblAvatar: avatar,
        specialAvatarId: typeof row.special_avatar_id === 'string' ? row.special_avatar_id : null,
        invisibleAvatarEntitled: invisible.has(String(row.id)),
        nameColorIndex: Math.max(0, Math.min(27, Number(row.name_color_index ?? 26)))
      });
    }
    return result;
  }

  public async findProfileByDiscordUsername(username: string): Promise<GatewaySocialStoredProfile | null> {
    const normalized = username.trim().replace(/#0$/i, '').toLocaleLowerCase('en-US');
    if (!normalized) return null;
    const likeLiteral = normalized.replace(/[\\%_]/g, '\\$&');
    const searches = await Promise.all([
      this.client.from('profiles').select('id, username').ilike('username', likeLiteral).limit(2),
      this.client.from('profiles').select('id, username').ilike('username', `${likeLiteral}#0`).limit(2)
    ]);
    const failed = searches.find(result => result.error);
    if (failed?.error) throw new Error(`Unable to search Discord usernames: ${failed.error.message}`);
    const rows = searches.flatMap(result => result.data ?? []);
    const exact = rows.find(row => String(row.username).replace(/#0$/i, '').toLocaleLowerCase('en-US') === normalized);
    if (!exact) return null;
    return (await this.getProfiles([String(exact.id)])).get(String(exact.id)) ?? null;
  }

  public async getPreferencesForAccounts(accountIds: readonly string[]): Promise<Map<string, GatewaySocialStoredPreferences>> {
    const unique = [...new Set(accountIds)].filter(Boolean);
    const result = new Map<string, GatewaySocialStoredPreferences>();
    if (unique.length === 0) return result;
    const { data, error } = await this.client.from('duel_social_preferences').select('*').in('profile_id', unique);
    if (error) throw new Error(`Unable to load social preferences: ${error.message}`);
    for (const row of data ?? []) result.set(String(row.profile_id), preferenceRow(row as PreferenceRow));
    for (const accountId of unique) {
      if (!result.has(accountId)) result.set(accountId, { ...DEFAULT_PREFERENCES });
    }
    return result;
  }

  public async getPreferences(accountId: string): Promise<GatewaySocialStoredPreferences> {
    const { data, error } = await this.client.from('duel_social_preferences').select('*')
      .eq('profile_id', accountId).maybeSingle();
    if (error) throw new Error(`Unable to load social preferences: ${error.message}`);
    if (data) return preferenceRow(data as PreferenceRow);
    const { data: inserted, error: insertError } = await this.client.from('duel_social_preferences')
      .upsert({ profile_id: accountId }, { onConflict: 'profile_id', ignoreDuplicates: true })
      .select('*').maybeSingle();
    if (insertError) throw new Error(`Unable to initialize social preferences: ${insertError.message}`);
    if (inserted) return preferenceRow(inserted as PreferenceRow);
    const { data: concurrent, error: concurrentError } = await this.client.from('duel_social_preferences')
      .select('*').eq('profile_id', accountId).single();
    if (concurrentError) throw new Error(`Unable to load initialized social preferences: ${concurrentError.message}`);
    return preferenceRow(concurrent as PreferenceRow);
  }

  public async setPreferences(accountId: string, preferences: GatewaySocialPreferences): Promise<GatewaySocialStoredPreferences> {
    await this.getPreferences(accountId);
    const { data, error } = await this.client.from('duel_social_preferences').update({
      availability: preferences.availability,
      profile_status_visibility: preferences.profileStatusVisibility,
      lobby_status_visibility: preferences.lobbyStatusVisibility,
      allow_lobby_join: preferences.allowLobbyJoin,
      receive_friend_requests: preferences.receiveFriendRequests,
      receive_match_invites: preferences.receiveMatchInvites
    }).eq('profile_id', accountId).select('*').single();
    if (error) throw new Error(`Unable to update social preferences: ${error.message}`);
    return preferenceRow(data as PreferenceRow);
  }

  public async setProfileStatus(accountId: string, challengeId: string | null, text: string): Promise<GatewaySocialStoredPreferences> {
    await this.getPreferences(accountId);
    const { data, error } = await this.client.from('duel_social_preferences')
      .update({ status_challenge_id: challengeId, status_text: text })
      .eq('profile_id', accountId).select('*').single();
    if (error) throw new Error(`Unable to update social status: ${error.message}`);
    return preferenceRow(data as PreferenceRow);
  }

  public async getGraph(accountId: string): Promise<GatewaySocialGraph> {
    const [preferences, friendships, pins, requests] = await Promise.all([
      this.getPreferences(accountId),
      this.client.from('duel_friendships').select('account_low, account_high')
        .or(`account_low.eq.${accountId},account_high.eq.${accountId}`),
      this.client.from('duel_friend_pins').select('friend_id').eq('owner_id', accountId),
      this.client.from('duel_friend_requests').select('request_id, sender_id, recipient_id, status, created_at')
        .or(`sender_id.eq.${accountId},recipient_id.eq.${accountId}`)
        .in('status', ['pending', 'ignored']).order('created_at', { ascending: false })
    ]);
    if (friendships.error) throw new Error(`Unable to load friendships: ${friendships.error.message}`);
    if (pins.error) throw new Error(`Unable to load friend pins: ${pins.error.message}`);
    if (requests.error) throw new Error(`Unable to load friend requests: ${requests.error.message}`);
    return {
      preferences,
      friendIds: (friendships.data ?? []).map(row => String(row.account_low) === accountId ? String(row.account_high) : String(row.account_low)),
      pinnedFriendIds: (pins.data ?? []).map(row => String(row.friend_id)),
      requests: (requests.data ?? []).map(row => ({
        friendRequestId: String(row.request_id), senderId: String(row.sender_id), recipientId: String(row.recipient_id),
        status: row.status === 'ignored' ? 'ignored' : 'pending', createdAt: timestamp(row.created_at)
      }))
    };
  }

  public async relationship(accountId: string, otherAccountId: string): Promise<'friend' | 'incoming-request' | 'outgoing-request' | 'blocked' | 'none'> {
    const pair = canonicalPair(accountId, otherAccountId);
    const [friendship, block, request] = await Promise.all([
      this.client.from('duel_friendships').select('account_low').match(pair).maybeSingle(),
      this.client.from('duel_social_blocks').select('blocker_id')
        .or(`and(blocker_id.eq.${accountId},blocked_id.eq.${otherAccountId}),and(blocker_id.eq.${otherAccountId},blocked_id.eq.${accountId})`).limit(1),
      this.client.from('duel_friend_requests').select('sender_id, recipient_id')
        .or(`and(sender_id.eq.${accountId},recipient_id.eq.${otherAccountId}),and(sender_id.eq.${otherAccountId},recipient_id.eq.${accountId})`)
        .in('status', ['pending', 'ignored']).order('created_at', { ascending: false }).limit(1)
    ]);
    if (friendship.error || block.error || request.error) throw new Error('Unable to resolve the social relationship.');
    if (block.data?.length) return 'blocked';
    if (friendship.data) return 'friend';
    const active = request.data?.[0];
    if (!active) return 'none';
    return String(active.sender_id) === accountId ? 'outgoing-request' : 'incoming-request';
  }

  public async sendFriendRequest(senderId: string, recipientId: string): Promise<GatewaySocialStoredRequest> {
    if (senderId === recipientId) throw new SocialPersistenceError('FRIEND_REQUEST_SELF', 'You cannot send a friend request to yourself.');
    const [relationship, recipientPreferences] = await Promise.all([
      this.relationship(senderId, recipientId), this.getPreferences(recipientId)
    ]);
    if (!recipientPreferences.receiveFriendRequests) throw new SocialPersistenceError('FRIEND_REQUESTS_DISABLED', 'This account is not accepting friend requests.');
    if (relationship === 'friend') throw new SocialPersistenceError('ALREADY_FRIENDS', 'You are already friends.');
    if (relationship === 'blocked') throw new SocialPersistenceError('FRIEND_REQUEST_BLOCKED', 'This friend request cannot be sent.');
    if (relationship === 'incoming-request') throw new SocialPersistenceError('INCOMING_REQUEST_EXISTS', 'This player already sent you a friend request.');
    if (relationship === 'outgoing-request') throw new SocialPersistenceError('FRIEND_REQUEST_EXISTS', 'Your friend request is already pending.');
    const { data, error } = await this.client.from('duel_friend_requests').insert({
      sender_id: senderId, recipient_id: recipientId, status: 'pending'
    }).select('request_id, sender_id, recipient_id, status, created_at').single();
    if (error) throw new Error(`Unable to create friend request: ${error.message}`);
    return { friendRequestId: String(data.request_id), senderId: String(data.sender_id),
      recipientId: String(data.recipient_id), status: 'pending', createdAt: timestamp(data.created_at) };
  }

  public async respondToFriendRequest(accountId: string, friendRequestId: string, response: 'accept' | 'decline' | 'ignore' | 'block'): Promise<{ request: GatewaySocialStoredRequest; otherAccountId: string }> {
    const { data, error } = await this.client.rpc('gateway_respond_duel_friend_request', {
      actor_id: accountId, target_request_id: friendRequestId, response
    });
    if (error) {
      if (/not found/i.test(error.message)) throw new SocialPersistenceError('FRIEND_REQUEST_NOT_FOUND', 'This friend request is no longer available.');
      throw new Error(`Unable to update friend request: ${error.message}`);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== 'object') throw new SocialPersistenceError('FRIEND_REQUEST_NOT_FOUND', 'This friend request is no longer available.');
    const senderId = String(row.sender_id);
    return {
      request: { friendRequestId, senderId, recipientId: String(row.recipient_id),
        status: String(row.request_status) === 'ignored' ? 'ignored' : 'pending', createdAt: timestamp(row.request_created_at) },
      otherAccountId: senderId
    };
  }

  public async withdrawFriendRequest(accountId: string, friendRequestId: string): Promise<string> {
    const { data, error } = await this.client.from('duel_friend_requests')
      .update({ status: 'withdrawn', responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('request_id', friendRequestId).eq('sender_id', accountId).in('status', ['pending', 'ignored'])
      .select('recipient_id').maybeSingle();
    if (error) throw new Error(`Unable to withdraw friend request: ${error.message}`);
    if (!data) throw new SocialPersistenceError('FRIEND_REQUEST_NOT_FOUND', 'This friend request is no longer available.');
    return String(data.recipient_id);
  }

  public async canUnblock(accountId: string, blockedId: string): Promise<boolean> {
    const { data, error } = await this.client.from('duel_social_blocks').select('blocker_id')
      .match({ blocker_id: accountId, blocked_id: blockedId }).maybeSingle();
    if (error) throw new Error(`Unable to resolve the unblock action: ${error.message}`);
    return Boolean(data);
  }

  public async unblockAccount(accountId: string, blockedId: string): Promise<void> {
    const { data, error } = await this.client.from('duel_social_blocks').delete()
      .match({ blocker_id: accountId, blocked_id: blockedId }).select('blocked_id').maybeSingle();
    if (error) throw new Error(`Unable to unblock this account: ${error.message}`);
    if (!data) throw new SocialPersistenceError('SOCIAL_BLOCK_NOT_FOUND', 'This account is no longer blocked by you.');
  }

  public async removeFriend(accountId: string, friendId: string): Promise<void> {
    const pair = canonicalPair(accountId, friendId);
    const [friendship, pins] = await Promise.all([
      this.client.from('duel_friendships').delete().match(pair),
      this.client.from('duel_friend_pins').delete()
        .or(`and(owner_id.eq.${accountId},friend_id.eq.${friendId}),and(owner_id.eq.${friendId},friend_id.eq.${accountId})`)
    ]);
    if (friendship.error) throw new Error(`Unable to remove friendship: ${friendship.error.message}`);
    if (pins.error) throw new Error(`Unable to clear friend pins: ${pins.error.message}`);
  }

  public async setFriendPin(accountId: string, friendId: string, pinned: boolean): Promise<void> {
    if (await this.relationship(accountId, friendId) !== 'friend') throw new SocialPersistenceError('FRIEND_NOT_FOUND', 'Only friends can be pinned.');
    const operation = pinned
      ? this.client.from('duel_friend_pins').upsert({ owner_id: accountId, friend_id: friendId })
      : this.client.from('duel_friend_pins').delete().match({ owner_id: accountId, friend_id: friendId });
    const { error } = await operation;
    if (error) throw new Error(`Unable to update friend pin: ${error.message}`);
  }
}
