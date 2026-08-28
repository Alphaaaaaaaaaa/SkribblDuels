import {
  createHomepageMatchmakingAuthority,
  isHomepageTelemetryEligible,
  reduceHomepageMatchmakingAuthority
} from '../apps/telemetry-inspector/src/homepageMatchmakingEligibility';
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

const emptyLobby = {
  hydrated: false,
  lobbySessionId: null,
  lobbyId: null,
  playerCount: 0,
  gameStateName: 'DISCONNECTED'
};
let authority = createHomepageMatchmakingAuthority(true, emptyLobby);
assert(isHomepageTelemetryEligible(authority), 'A clean homepage reload should be immediately eligible.');
authority = reduceHomepageMatchmakingAuthority(authority, event('PROTOCOL_ANOMALY'));
assert(isHomepageTelemetryEligible(authority), 'Neutral bootstrap noise must not invalidate the homepage reload.');

for (const type of ['AVATAR_RANDOMIZED', 'LOGO_AVATAR_CLICKED', 'SPECIAL_AVATAR_FOUND'] as const) {
  const next = reduceHomepageMatchmakingAuthority('unknown', event(type));
  assert(isHomepageTelemetryEligible(next), `${type} should be homepage-eligible.`);
}
for (const reasonName of ['DISCONNECT', 'KICKED', 'BANNED']) {
  const next = reduceHomepageMatchmakingAuthority('lobby', event('PLAYER_LEFT', { reasonName }, true));
  assert(
    isHomepageTelemetryEligible(next),
    `A confirmed self ${reasonName} should be homepage-eligible.`
  );
}

assert(
  !isHomepageTelemetryEligible(reduceHomepageMatchmakingAuthority(
    'lobby',
    event('PLAYER_LEFT', { reasonName: 'DISCONNECT' }, false)
  )),
  'An opponent leaving must not unlock homepage matchmaking.'
);
assert(
  !isHomepageTelemetryEligible(reduceHomepageMatchmakingAuthority(
    'lobby',
    event('PLAYER_LEFT', { reasonName: 'UNKNOWN_9' }, true)
  )),
  'An unknown leave reason must fail closed.'
);
assert(
  !isHomepageTelemetryEligible(reduceHomepageMatchmakingAuthority('home', {
    ...event('ROUND_STARTED'),
    context: {
      ...event('ROUND_STARTED').context,
      lobbySessionId: 'lobby-session',
      lobbyId: 'lobby-id'
    }
  })),
  'An active-lobby event must stay ineligible even if #home is forged visible.'
);

assert(
  isHomepageTelemetryEligible(reduceHomepageMatchmakingAuthority('lobby', event('TYPO_LOBBY_LEFT'))),
  "Typo's leftLobby event should confirm the homepage."
);

assert(
  !isHomepageTelemetryEligible(createHomepageMatchmakingAuthority(true, {
    hydrated: true,
    lobbySessionId: 'active-session',
    lobbyId: 'active-lobby',
    playerCount: 4,
    gameStateName: 'DRAWING'
  })),
  'An active lobby snapshot must override a forged visible #home.'
);

console.log('Homepage matchmaking Telemetry eligibility test passed.');
