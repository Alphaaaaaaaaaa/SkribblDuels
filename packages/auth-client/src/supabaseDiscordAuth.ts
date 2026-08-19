import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_AUTH_REDIRECT_URL,
  SUPABASE_AUTH_STORAGE_KEY,
  SUPABASE_PROJECT_URL,
  SUPABASE_PUBLISHABLE_KEY
} from './config';
import type {
  AuthSnapshot,
  AuthSubscription,
  DuelProfileUpdate,
  DiscordAuthProfile,
  SupabaseAuthUserLike,
  SupabaseBrowserLibrary,
  SupabaseClientLike,
  SupabaseSessionLike
} from './types';

type SupabaseClientFactory = SupabaseBrowserLibrary['createClient'];

const createBundledSupabaseClient: SupabaseClientFactory = (url, publishableKey, options) => (
  createSupabaseClient(url, publishableKey, options) as unknown as SupabaseClientLike
);

const INITIAL_STATE: AuthSnapshot = {
  status: 'initializing',
  profile: null,
  accessToken: null,
  expiresAt: null,
  error: null
};

export type DuelDisplayNameValidationError =
  | 'too-short'
  | 'too-long'
  | 'non-alphanumeric';

export function validateDuelDisplayName(value: string): DuelDisplayNameValidationError | null {
  if (value.length < 3) return 'too-short';
  if (value.length > 24) return 'too-long';
  return /^[A-Za-z0-9]+$/.test(value) ? null : 'non-alphanumeric';
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function profileFromUser(user: SupabaseAuthUserLike): DiscordAuthProfile {
  const metadata = user.user_metadata ?? {};
  const discordId = stringValue(metadata.provider_id)
    ?? stringValue(metadata.sub)
    ?? stringValue(metadata.discord_id);
  const username = stringValue(metadata.user_name)
    ?? stringValue(metadata.preferred_username)
    ?? stringValue(metadata.name)
    ?? 'Discord user';
  const displayName = stringValue(metadata.full_name)
    ?? stringValue(metadata.global_name)
    ?? stringValue(metadata.name)
    ?? username;
  const avatarUrl = stringValue(metadata.avatar_url)
    ?? stringValue(metadata.picture);

  return {
    userId: user.id,
    discordId,
    username,
    displayName,
    email: stringValue(user.email),
    avatarUrl
  };
}

function snapshotFromSession(session: SupabaseSessionLike | null): AuthSnapshot {
  if (!session) {
    return {
      status: 'signed-out',
      profile: null,
      accessToken: null,
      expiresAt: null,
      error: null
    };
  }
  return {
    status: 'signed-in',
    profile: profileFromUser(session.user),
    accessToken: session.access_token,
    expiresAt: typeof session.expires_at === 'number' ? session.expires_at * 1000 : null,
    error: null
  };
}

export class SupabaseDiscordAuthClient {
  private client: SupabaseClientLike | null = null;
  private state: AuthSnapshot = structuredClone(INITIAL_STATE);
  private listeners = new Set<(state: AuthSnapshot) => void>();
  private authSubscription: AuthSubscription | null = null;
  private started = false;
  private startPromise: Promise<AuthSnapshot> | null = null;

  public constructor(
    private readonly createClient: SupabaseClientFactory = createBundledSupabaseClient
  ) {}

  public getState(): AuthSnapshot {
    return structuredClone(this.state);
  }

  public subscribe(listener: (state: AuthSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  public start(): Promise<AuthSnapshot> {
    if (this.startPromise) return this.startPromise;
    if (this.started && this.client) return Promise.resolve(this.getState());

    this.update({
      status: 'initializing',
      profile: null,
      accessToken: null,
      expiresAt: null,
      error: null
    });
    const attempt = this.initialize();
    this.startPromise = attempt;
    void attempt.finally(() => {
      if (this.startPromise === attempt) this.startPromise = null;
    });
    return attempt;
  }

  private async initialize(): Promise<AuthSnapshot> {
    try {
      const client = this.createClient(
        SUPABASE_PROJECT_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: 'implicit',
            storageKey: SUPABASE_AUTH_STORAGE_KEY
          }
        }
      );
      this.authSubscription = client.auth.onAuthStateChange((_event, session) => {
        this.update(snapshotFromSession(session));
      }).data.subscription;
      this.client = client;
      this.started = true;
    } catch (error) {
      this.client = null;
      this.started = false;
      this.update({
        status: 'error',
        profile: null,
        accessToken: null,
        expiresAt: null,
        error: error instanceof Error ? error.message : String(error)
      });
      return this.getState();
    }

    const client = this.client;
    if (!client) {
      this.update({
        status: 'error',
        profile: null,
        accessToken: null,
        expiresAt: null,
        error: 'Supabase Auth could not create a browser client.'
      });
      return this.getState();
    }

    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error(error.message ?? 'Unable to restore Supabase session.');
      this.update(snapshotFromSession(data.session));
    } catch (error) {
      this.update({
        status: 'error',
        profile: null,
        accessToken: null,
        expiresAt: null,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return this.getState();
  }

  public async signInWithDiscord(): Promise<void> {
    const client = await this.ensureClient();
    this.update({ ...this.state, status: 'initializing', error: null });
    const { error } = await client.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: SUPABASE_AUTH_REDIRECT_URL,
        scopes: 'identify email'
      }
    });
    if (error) {
      this.update({ ...this.state, status: 'error', error: error.message ?? 'Discord login failed.' });
      throw new Error(error.message ?? 'Discord login failed.');
    }
  }

  public async signOut(): Promise<void> {
    const client = await this.ensureClient();
    const { error } = await client.auth.signOut();
    if (error) {
      this.update({ ...this.state, status: 'error', error: error.message ?? 'Sign out failed.' });
      throw new Error(error.message ?? 'Sign out failed.');
    }
    this.update(snapshotFromSession(null));
  }

  public getAccessToken(): string | null {
    return this.state.accessToken;
  }

  public async updateDuelProfile(update: DuelProfileUpdate): Promise<void> {
    const displayName = update.displayName;
    const displayNameError = validateDuelDisplayName(displayName);
    if (displayNameError === 'too-short') throw new Error('Duel display name must contain at least 3 characters.');
    if (displayNameError === 'too-long') throw new Error('Duel display name must contain no more than 24 characters.');
    if (displayNameError === 'non-alphanumeric') {
      throw new Error('Duel display name may contain only A-Z, a-z and 0-9.');
    }
    if (update.avatarSource === 'skribbl' && !update.skribblAvatar) {
      throw new Error('Select or capture a Skribbl avatar first.');
    }
    const client = await this.ensureClient();
    if (!client.rpc) throw new Error('Profile updates are unavailable in this client build.');
    const { error } = await client.rpc('update_skribbl_duels_profile', {
      duel_display_name: displayName,
      duel_preferred_language: update.preferredLanguage,
      duel_avatar_source: update.avatarSource,
      duel_skribbl_avatar: update.avatarSource === 'skribbl' ? update.skribblAvatar : null,
      duel_special_avatar_id: update.avatarSource === 'skribbl' ? update.specialAvatarId : null
    });
    if (error) throw new Error(error.message ?? 'Unable to update the Skribbl Duels profile.');
  }

  public stop(): void {
    this.authSubscription?.unsubscribe();
    this.authSubscription = null;
    this.listeners.clear();
    this.client = null;
    this.started = false;
    this.startPromise = null;
  }

  private async ensureClient(): Promise<SupabaseClientLike> {
    if (this.startPromise) await this.startPromise;
    if (!this.client) await this.start();
    if (!this.client) {
      throw new Error(this.state.error ?? 'Supabase Auth could not be initialized.');
    }
    return this.client;
  }

  private update(state: AuthSnapshot): void {
    this.state = structuredClone(state);
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }
}
