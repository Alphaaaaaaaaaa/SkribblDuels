import { createClient } from '@supabase/supabase-js';
import type {
  GatewayAuthRequiredMessage,
  GatewayClientIdentity,
  GatewayErrorMessage
} from '@skribbl-duels/gateway-contracts';
import type { GatewayServerConfig } from './config';

export interface AuthenticatedGatewayAccount {
  identity: GatewayClientIdentity;
  accessTokenExpiresAt: number | null;
}

export type GatewayAuthenticationDecision =
  | { ok: true; account: AuthenticatedGatewayAccount }
  | { ok: false; message: GatewayAuthRequiredMessage | GatewayErrorMessage };

export type GatewayAccessAuthenticator = (
  accessToken: unknown
) => Promise<GatewayAuthenticationDecision>;

function authRequired(
  reason: GatewayAuthRequiredMessage['reason']
): GatewayAuthenticationDecision {
  return { ok: false, message: { type: 'AUTH_REQUIRED', reason } };
}

function gatewayError(code: string, message: string, recoverable: boolean): GatewayAuthenticationDecision {
  return {
    ok: false,
    message: { type: 'ERROR', code, message, recoverable }
  };
}

function classifyTokenFailure(error: unknown): GatewayAuthRequiredMessage['reason'] {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /expired|exp claim/i.test(message) ? 'expired-token' : 'invalid-token';
}

export function createSupabaseGatewayAuthenticator(
  config: Pick<GatewayServerConfig, 'supabaseUrl' | 'supabasePublishableKey'>
): GatewayAccessAuthenticator {
  const verifier = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });

  return async accessTokenValue => {
    if (typeof accessTokenValue !== 'string' || accessTokenValue.length === 0) {
      return authRequired('missing-token');
    }
    const accessToken = accessTokenValue;

    let accountId: string;
    let accessTokenExpiresAt: number | null;
    try {
      const { data, error } = await verifier.auth.getClaims(accessToken);
      if (error) return authRequired(classifyTokenFailure(error));
      const subject = data?.claims?.sub;
      if (typeof subject !== 'string' || subject.length === 0) {
        return authRequired('invalid-token');
      }
      accountId = subject;
      const expiresAt = data?.claims?.exp;
      accessTokenExpiresAt = typeof expiresAt === 'number' ? expiresAt * 1000 : null;
      if (accessTokenExpiresAt !== null && accessTokenExpiresAt <= Date.now()) {
        return authRequired('expired-token');
      }
    } catch (error) {
      return authRequired(classifyTokenFailure(error));
    }

    const scopedClient = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    });
    const { data: profile, error: profileError } = await scopedClient
      .from('profiles')
      .select('id, discord_id, username, display_name, avatar_url, preferred_language, avatar_source, skribbl_avatar, special_avatar_id')
      .eq('id', accountId)
      .maybeSingle();

    if (profileError) {
      return gatewayError(
        'PROFILE_LOOKUP_FAILED',
        'The authenticated Skribbl Duels profile could not be loaded.',
        true
      );
    }
    if (!profile) {
      return gatewayError(
        'PROFILE_NOT_FOUND',
        'No Skribbl Duels profile exists for the authenticated account.',
        false
      );
    }

    return {
      ok: true,
      account: {
        identity: {
          accountId: String(profile.id),
          displayName: String(profile.display_name),
          discordUserId: typeof profile.discord_id === 'string' ? profile.discord_id : null,
          discordUsername: String(profile.username),
          avatarSource: profile.avatar_source === 'skribbl' ? 'skribbl' : 'discord',
          avatarUrl: typeof profile.avatar_url === 'string' ? profile.avatar_url : null,
          skribblAvatar: Array.isArray(profile.skribbl_avatar) && profile.skribbl_avatar.length === 4
            ? profile.skribbl_avatar.map(Number) as [number, number, number, number]
            : null,
          specialAvatarId: typeof profile.special_avatar_id === 'string' ? profile.special_avatar_id : null,
          preferredLanguage: profile.preferred_language === 'de' ? 'de' : 'en'
        },
        accessTokenExpiresAt
      }
    };
  };
}
