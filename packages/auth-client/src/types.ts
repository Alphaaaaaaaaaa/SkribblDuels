export const AUTH_CLIENT_VERSION = '0.38.0' as const;

export type AuthStatus = 'initializing' | 'signed-out' | 'signed-in' | 'error';

export interface DiscordAuthProfile {
  userId: string;
  discordId: string | null;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  createdAt: number | null;
}

export interface AuthSnapshot {
  status: AuthStatus;
  profile: DiscordAuthProfile | null;
  accessToken: string | null;
  expiresAt: number | null;
  error: string | null;
}

export interface AuthSubscription {
  unsubscribe(): void;
}

export interface SupabaseAuthUserLike {
  id: string;
  created_at?: string | null;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

export interface SupabaseSessionLike {
  access_token: string;
  expires_at?: number | null;
  user: SupabaseAuthUserLike;
}

export interface SupabaseAuthErrorLike {
  message?: string;
}

export interface SupabaseAuthClientLike {
  getSession(): Promise<{
    data: { session: SupabaseSessionLike | null };
    error: SupabaseAuthErrorLike | null;
  }>;
  exchangeCodeForSession(authCode: string): Promise<{
    data: {
      session: SupabaseSessionLike | null;
      user?: SupabaseAuthUserLike | null;
      redirectType?: string | null;
    };
    error: SupabaseAuthErrorLike | null;
  }>;
  signInWithOAuth(input: {
    provider: 'discord';
    options: {
      redirectTo: string;
      scopes?: string;
    };
  }): Promise<{
    data: { provider?: string; url?: string | null };
    error: SupabaseAuthErrorLike | null;
  }>;
  signOut(): Promise<{ error: SupabaseAuthErrorLike | null }>;
  onAuthStateChange(callback: (
    event: string,
    session: SupabaseSessionLike | null
  ) => void): {
    data: { subscription: AuthSubscription };
  };
}

export interface SupabaseAuthStorageLike {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface SupabaseClientLike {
  auth: SupabaseAuthClientLike;
  rpc?(functionName: string, parameters: Record<string, unknown>): Promise<{
    data: unknown;
    error: SupabaseAuthErrorLike | null;
  }>;
}

export interface DuelProfileUpdate {
  displayName: string;
  preferredLanguage: 'de' | 'en';
  avatarSource: 'discord' | 'skribbl';
  skribblAvatar: readonly [number, number, number, number] | null;
  specialAvatarId: string | null;
  nameColorIndex: number;
}

export interface SupabaseBrowserLibrary {
  createClient(
    url: string,
    publishableKey: string,
    options: {
      auth: {
        persistSession: boolean;
        autoRefreshToken: boolean;
        detectSessionInUrl: boolean;
        flowType: 'pkce';
        storageKey: string;
        storage: SupabaseAuthStorageLike;
      };
    }
  ): SupabaseClientLike;
}
