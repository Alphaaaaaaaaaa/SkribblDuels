import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  bulletSkribblIoDefinition,
  instaLikeDefinition
} from '@skribbl-duels/challenge-definitions';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const selfActor = { playerId: 21, name: 'Alpha', isSelf: true } as const;

function context(roundSessionId: string, drawerId = 77) {
  return {
    lobbySessionId: 'speed-lobby-session',
    lobbyGeneration: 1,
    lobbyId: 'SPEED1',
    lobbyType: 0,
    languageId: 1,
    languageName: 'German',
    gameSessionId: 'speed-game-session',
    roundSessionId,
    roundIndex: 0,
    roundNumber: 1,
    maxRounds: 3,
    gameStateId: 4,
    gameStateName: 'DRAWING',
    meId: 21,
    drawerId
  } as const;
}

function event<T extends TelemetryEvent['type']>(
  type: T,
  eventId: string,
  monotonicMs: number,
  payload: Extract<TelemetryEvent, { type: T }>['payload'],
  roundSessionId: string,
  actor: TelemetryEvent['actor'] = null,
  drawerId = 77
): Extract<TelemetryEvent, { type: T }> {
  return {
    schemaVersion: 1,
    eventId,
    telemetrySequence: monotonicMs,
    type,
    category: type === 'ROUND_STARTED' ? 'round' : type === 'VOTE_SUBMITTED' ? 'drawing' : 'guessing',
    occurredAt: 1700000000000 + monotonicMs,
    monotonicMs,
    actor,
    context: context(roundSessionId, drawerId),
    source: {
      origin: 'decoded-packet',
      rawRecordId: null,
      changeId: null,
      direction: type === 'VOTE_SUBMITTED' ? 'client-to-server' : 'server-to-client',
      socketEvent: null,
      packetId: null
    },
    payload,
    confidence: 'confirmed',
    highVolume: false
  } as Extract<TelemetryEvent, { type: T }>;
}

const roundPayload = (drawerId = 77) => ({
  previousStateId: 3,
  stateId: 4,
  stateName: 'DRAWING',
  time: 80,
  roundIndex: 0,
  roundNumber: 1,
  maxRounds: 3,
  drawerId,
  word: null,
  wordLengths: [5],
  initialTime: 80
});

const correctPayload = (elapsedMs: number) => ({
  playerId: 21,
  position: 2,
  elapsedMs,
  estimatedTimeAtGuess: 80 - elapsedMs / 1000,
  serverTimeAnchorAtGuess: 80,
  includesWord: true,
  word: 'Punkt',
  wrongGuessesBeforeCorrect: 0,
  isFirstGuesser: false
});

const insta = new ChallengeEngine({ autoPersist: false });
insta.register(instaLikeDefinition);
insta.activate({ instanceId: 'insta', challengeId: 'instalike' });
insta.process(event('ROUND_STARTED', 'insta-round-late', 1000, roundPayload(), 'insta-turn-late'));
insta.process(event('VOTE_SUBMITTED', 'insta-like-late', 1251, { vote: 1 }, 'insta-turn-late', selfActor));
assert(insta.getInstance('insta')?.progress.current === 0, 'A like after 251 ms must not complete InstaLike.');
insta.process(event('ROUND_STARTED', 'insta-round-exact', 2000, roundPayload(), 'insta-turn-exact'));
insta.process(event('VOTE_SUBMITTED', 'insta-dislike', 2050, { vote: -1 }, 'insta-turn-exact', selfActor));
assert(insta.getInstance('insta')?.progress.current === 0, 'A dislike must not complete InstaLike.');
insta.process(event('VOTE_SUBMITTED', 'insta-like-exact', 2250, { vote: 1 }, 'insta-turn-exact', selfActor));
assert(insta.getInstance('insta')?.status === 'completion-pending', 'A like at exactly 250 ms must complete InstaLike.');

const bullet = new ChallengeEngine({ autoPersist: false });
bullet.register(bulletSkribblIoDefinition);
bullet.activate({ instanceId: 'bullet', challengeId: 'bullet-skribbl-io' });

for (let index = 1; index <= 5; index += 1) {
  const roundSessionId = `bullet-turn-${index}`;
  const startedAt = 3000 + index * 20000;
  bullet.process(event('ROUND_STARTED', `bullet-round-${index}`, startedAt, roundPayload(), roundSessionId));
  const elapsedMs = index === 5 ? 10000 : 9000;
  bullet.process(event(
    'CORRECT_GUESS',
    `bullet-correct-${index}`,
    startedAt + elapsedMs,
    correctPayload(elapsedMs),
    roundSessionId,
    selfActor
  ));
  if (index === 2) {
    bullet.process(event(
      'CORRECT_GUESS',
      'bullet-duplicate-same-turn',
      startedAt + elapsedMs + 1,
      correctPayload(elapsedMs),
      roundSessionId,
      selfActor
    ));
  }
}

assert(bullet.getInstance('bullet')?.status === 'completion-pending', 'Five distinct fast guessing turns must complete Bullet skribbl.io.');
assert(bullet.getInstance('bullet')?.progress.current === 5, 'A duplicate correct event in one turn must not increase Bullet progress.');
assert(
  !(bullet.getInstance('bullet')?.completionCandidate?.evidenceEventIds.includes('bullet-duplicate-same-turn') ?? true),
  'A duplicate correct event must not become Bullet evidence.'
);

const tooSlow = new ChallengeEngine({ autoPersist: false });
tooSlow.register(bulletSkribblIoDefinition);
tooSlow.activate({ instanceId: 'slow', challengeId: 'bullet-skribbl-io' });
tooSlow.process(event('ROUND_STARTED', 'slow-round', 200000, roundPayload(), 'slow-turn'));
tooSlow.process(event('CORRECT_GUESS', 'slow-correct', 210001, correctPayload(10001), 'slow-turn', selfActor));
assert(tooSlow.getInstance('slow')?.progress.current === 0, 'A guess at 10001 ms must not count for Bullet skribbl.io.');

console.log('InstaLike and Bullet skribbl.io runtime tests passed.');
