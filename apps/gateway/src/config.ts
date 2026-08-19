export interface GatewayServerConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  clientOrigin: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseServiceRoleKey: string | null;
  helloTimeoutMs: number;
  heartbeatIntervalMs: number;
  matchmakingReadyTimeoutMs: number;
  simulatedPlayersEnabled: boolean;
  simulatedMatchDelayMs: number;
  simulatedReadyDelayMs: number;
  draftPickTimeoutMs: number;
  simulatedDraftPickDelayMs: number;
  draftFinalRevealMs: number;
  matchCountdownMs: number;
  reconnectGraceMs: number;
  drawProposalTimeoutMs: number;
  inviteTimeoutMs: number;
}

function requiredValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing Gateway environment variable: ${name}.`);
  return value;
}

function validUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) {
    throw new Error(`${name} must use HTTPS, except for localhost development.`);
  }
  return value.replace(/\/+$/, '');
}

export function readGatewayServerConfig(env: NodeJS.ProcessEnv = process.env): GatewayServerConfig {
  const rawPort = env.PORT?.trim() || '3000';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('PORT must be an integer from 0 through 65535.');
  }
  const nodeEnvValue = env.NODE_ENV?.trim() || 'development';
  const nodeEnv = nodeEnvValue === 'production' || nodeEnvValue === 'test'
    ? nodeEnvValue
    : 'development';
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
  if (nodeEnv === 'production' && !supabaseServiceRoleKey) {
    throw new Error('Missing Gateway environment variable: SUPABASE_SERVICE_ROLE_KEY.');
  }

  return {
    nodeEnv,
    port,
    clientOrigin: validUrl(requiredValue(env, 'CLIENT_ORIGIN'), 'CLIENT_ORIGIN'),
    supabaseUrl: validUrl(requiredValue(env, 'SUPABASE_URL'), 'SUPABASE_URL'),
    supabasePublishableKey: requiredValue(env, 'SUPABASE_PUBLISHABLE_KEY'),
    supabaseServiceRoleKey,
    helloTimeoutMs: 10_000,
    heartbeatIntervalMs: 25_000,
    matchmakingReadyTimeoutMs: 30_000,
    simulatedPlayersEnabled: env.MATCHMAKING_SIMULATED_PLAYERS?.trim().toLowerCase() === 'true',
    simulatedMatchDelayMs: 800,
    simulatedReadyDelayMs: 900,
    draftPickTimeoutMs: 15_000,
    simulatedDraftPickDelayMs: 1_100,
    draftFinalRevealMs: 3_200,
    matchCountdownMs: 10_000,
    reconnectGraceMs: 30_000,
    drawProposalTimeoutMs: 30_000,
    inviteTimeoutMs: 15 * 60_000
  };
}
