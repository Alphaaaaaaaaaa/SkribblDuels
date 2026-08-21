import { createHash } from 'node:crypto';
import type { GatewayClientMessage } from '@skribbl-duels/gateway-contracts';
import type { GatewayRedisCommandClient } from './realtimeInfrastructure';

export type GatewayAbuseScope =
  | 'connection'
  | 'handshake'
  | 'matchmaking'
  | 'invite'
  | 'chat'
  | 'match-action'
  | 'telemetry'
  | 'claim';

export interface GatewayRateLimitPolicy {
  scope: GatewayAbuseScope;
  limit: number;
  windowMs: number;
}

export interface GatewayRateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface GatewayRateLimiter {
  consume(policy: GatewayRateLimitPolicy, subject: string): Promise<GatewayRateLimitDecision>;
}

interface LocalWindow {
  count: number;
  resetAt: number;
}

const FIXED_WINDOW_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

function safeSubject(subject: string): string {
  return createHash('sha256').update(subject).digest('hex');
}

export class InMemoryGatewayRateLimiter implements GatewayRateLimiter {
  private readonly windows = new Map<string, LocalWindow>();

  public async consume(policy: GatewayRateLimitPolicy, subject: string): Promise<GatewayRateLimitDecision> {
    const now = Date.now();
    const key = `${policy.scope}:${safeSubject(subject)}`;
    const existing = this.windows.get(key);
    const window = !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + policy.windowMs }
      : existing;
    window.count += 1;
    this.windows.set(key, window);
    if (this.windows.size > 10_000) {
      for (const [candidateKey, candidate] of this.windows) {
        if (candidate.resetAt <= now) this.windows.delete(candidateKey);
      }
    }
    return {
      allowed: window.count <= policy.limit,
      remaining: Math.max(0, policy.limit - window.count),
      retryAfterMs: Math.max(1, window.resetAt - now)
    };
  }
}

export class RedisGatewayRateLimiter implements GatewayRateLimiter {
  public constructor(private readonly client: GatewayRedisCommandClient) {}

  public async consume(policy: GatewayRateLimitPolicy, subject: string): Promise<GatewayRateLimitDecision> {
    const bucket = Math.floor(Date.now() / policy.windowMs);
    const key = `skd:v1:rate:${policy.scope}:${safeSubject(subject)}:${bucket}`;
    const raw = await this.client.eval(FIXED_WINDOW_SCRIPT, {
      keys: [key],
      arguments: [String(policy.windowMs + 1_000)]
    });
    const result = Array.isArray(raw) ? raw : [];
    const count = Number(result[0] ?? policy.limit + 1);
    const ttl = Number(result[1] ?? policy.windowMs);
    return {
      allowed: count <= policy.limit,
      remaining: Math.max(0, policy.limit - count),
      retryAfterMs: Math.max(1, ttl)
    };
  }
}

export const HANDSHAKE_RATE_LIMIT: GatewayRateLimitPolicy = {
  scope: 'handshake',
  limit: 30,
  windowMs: 60_000
};

export const CONNECTION_MESSAGE_RATE_LIMIT: GatewayRateLimitPolicy = {
  scope: 'connection',
  limit: 240,
  windowMs: 10_000
};

export function policyForMessage(message: GatewayClientMessage): GatewayRateLimitPolicy | null {
  switch (message.type) {
    case 'HELLO':
    case 'PING':
      return null;
    case 'MATCHMAKING_JOIN':
    case 'MATCHMAKING_LEAVE':
      return { scope: 'matchmaking', limit: 12, windowMs: 60_000 };
    case 'INVITE_CREATE':
    case 'INVITE_ACCEPT':
    case 'INVITE_CANCEL':
      return { scope: 'invite', limit: 15, windowMs: 60_000 };
    case 'DUEL_CHAT_SEND':
      return { scope: 'chat', limit: 24, windowMs: 10_000 };
    case 'TELEMETRY_BATCH':
      return { scope: 'telemetry', limit: 40, windowMs: 10_000 };
    case 'CLAIM_CANDIDATE':
      return { scope: 'claim', limit: 30, windowMs: 10_000 };
    default:
      return { scope: 'match-action', limit: 60, windowMs: 10_000 };
  }
}

export function requestIdForMessage(message: GatewayClientMessage): string | undefined {
  if ('requestId' in message && typeof message.requestId === 'string') return message.requestId;
  if ('actionId' in message && typeof message.actionId === 'string') return message.actionId;
  if ('clientMessageId' in message && typeof message.clientMessageId === 'string') return message.clientMessageId;
  if ('candidateId' in message && typeof message.candidateId === 'string') return message.candidateId;
  return undefined;
}
