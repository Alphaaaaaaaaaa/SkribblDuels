import { isHomepageTelemetryEligible } from '../apps/telemetry-inspector/src/homepageMatchmakingEligibility';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function event(
  type: TelemetryEvent['type'],
  payload: Record<string, unknown> = {},
  isSelf = false
): TelemetryEvent {
  return {
    schemaVersion: 1,
    eventId: `homepage-${type}-${String(payload.reasonName ?? 'none')}`,
    telemetrySequence: 1,
    type,
    category: type === 'PLAYER_LEFT' ? 'lobby' : 'home',
    occurredAt: 1,
    monotonicMs: 1,
    actor: { playerId: 1, name: 'Alpha', isSelf },
    context: {
      lobbySessionId: null,
      lobbyGeneration: 0,
      lobbyId: null,
      lobbyType: null,
      languageId: null,
      languageName: null,
      gameSessionId: null,
      roundSessionId: null,
      roundIndex: null,
      roundNumber: null,
      maxRounds: null,
      gameStateId: null,
      gameStateName: 'HOME',
      meId: 1,
      drawerId: null
    },
    source: {
      origin: 'system',
      rawRecordId: null,
      changeId: null,
      direction: null,
      socketEvent: null,
      packetId: null
    },
    payload,
    confidence: 'confirmed',
    highVolume: false
  } as TelemetryEvent;
}

assert(isHomepageTelemetryEligible(null), 'No Telemetry history should be homepage-eligible.');
for (const type of ['AVATAR_RANDOMIZED', 'LOGO_AVATAR_CLICKED', 'SPECIAL_AVATAR_FOUND'] as const) {
  assert(isHomepageTelemetryEligible(event(type)), `${type} should be homepage-eligible.`);
}
for (const reasonName of ['DISCONNECT', 'KICKED', 'BANNED']) {
  assert(
    isHomepageTelemetryEligible(event('PLAYER_LEFT', { reasonName }, true)),
    `A confirmed self ${reasonName} should be homepage-eligible.`
  );
}

assert(
  !isHomepageTelemetryEligible(event('PLAYER_LEFT', { reasonName: 'DISCONNECT' }, false)),
  'An opponent leaving must not unlock homepage matchmaking.'
);
assert(
  !isHomepageTelemetryEligible(event('PLAYER_LEFT', { reasonName: 'UNKNOWN_9' }, true)),
  'An unknown leave reason must fail closed.'
);
assert(
  !isHomepageTelemetryEligible(event('ROUND_STARTED')),
  'An active-lobby event must stay ineligible even if #home is forged visible.'
);

console.log('Homepage matchmaking Telemetry eligibility test passed.');
