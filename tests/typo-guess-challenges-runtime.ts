import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  blindGuessDefinition,
  deafGuessDefinition,
  drunkVisionDefinition
} from '@skribbl-duels/challenge-definitions';
import { normalizeTypoChallengeStateDetail } from '@skribbl-duels/telemetry-core';
import type {
  TelemetryEvent,
  TelemetryEventType
} from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const self = { playerId: 21, name: 'Alpha', isSelf: true } as const;

function context(roundSessionId: string) {
  return {
    lobbySessionId: 'typo-challenge-lobby-session',
    lobbyGeneration: 1,
    lobbyId: 'TYPOCHALLENGE1',
    lobbyType: 0,
    languageId: 1,
    languageName: 'German',
    gameSessionId: 'typo-challenge-game',
    roundSessionId,
    roundIndex: 0,
    roundNumber: 1,
    maxRounds: 3,
    gameStateId: 4,
    gameStateName: 'DRAWING',
    meId: 21,
    drawerId: 77
  } as const;
}

function category(type: TelemetryEventType): TelemetryEvent['category'] {
  if (type === 'ROUND_STARTED') return 'round';
  if (type === 'TYPO_CHALLENGE_STATE_CHANGED') return 'system';
  return 'guessing';
}

function event<T extends TelemetryEventType>(
  type: T,
  eventId: string,
  monotonicMs: number,
  payload: Extract<TelemetryEvent, { type: T }>['payload'],
  roundSessionId: string,
  actor: TelemetryEvent['actor'] = null
): Extract<TelemetryEvent, { type: T }> {
  return {
    schemaVersion: 1,
    eventId,
    telemetrySequence: monotonicMs,
    type,
    category: category(type),
    occurredAt: 1700000000000 + monotonicMs,
    monotonicMs,
    actor,
    context: context(roundSessionId),
    source: {
      origin: type.startsWith('TYPO_') ? 'dom-adapter' : 'decoded-packet',
      rawRecordId: null,
      changeId: null,
      direction: type === 'GUESS_SUBMITTED' ? 'client-to-server' : type.startsWith('TYPO_') ? null : 'server-to-client',
      socketEvent: type.startsWith('TYPO_') ? null : 'data',
      packetId: null
    },
    payload,
    confidence: type.startsWith('TYPO_') ? 'confirmed' : 'confirmed',
    highVolume: false
  } as Extract<TelemetryEvent, { type: T }>;
}

const roundPayload = {
  previousStateId: 3,
  stateId: 4,
  stateName: 'DRAWING',
  time: 80,
  roundIndex: 0,
  roundNumber: 1,
  maxRounds: 3,
  drawerId: 77,
  word: null,
  wordLengths: [5],
  initialTime: 80,
  players: []
};

const correctPayload = {
  playerId: 21,
  position: 1,
  elapsedMs: 5000,
  estimatedTimeAtGuess: 75,
  serverTimeAnchorAtGuess: 80,
  includesWord: true,
  word: 'Punkt',
  wrongGuessesBeforeCorrect: 0,
  isFirstGuesser: true
};

const definitions = [
  blindGuessDefinition,
  drunkVisionDefinition,
  deafGuessDefinition
] as const;

for (const definition of definitions) {
  const roundSessionId = `${definition.id}-valid-turn`;
  const engine = new ChallengeEngine({ autoPersist: false });
  engine.register(definition);
  engine.activate({ instanceId: definition.id, challengeId: definition.id });
  const activeState = {
    challengeId: definition.id === 'blind-guess' ? 1 : definition.id === 'drunk-vision' ? 2 : 3,
    challengeKey: definition.id,
    challengeName: definition.id === 'blind-guess' ? 'Blind Guess' : definition.id === 'drunk-vision' ? 'Drunk Vision' : 'Deaf Guess',
    selected: true,
    effectActive: true,
    featureActive: true,
    reason: 'trigger-applied',
    method: 'typo-relay'
  } as const;
  engine.process(event('TYPO_CHALLENGE_STATE_CHANGED', `${definition.id}-active-before-round`, 0, activeState, roundSessionId));
  engine.process(event('ROUND_STARTED', `${definition.id}-round-start`, 10, roundPayload, roundSessionId));
  engine.process(event('TYPO_CHALLENGE_STATE_CHANGED', `${definition.id}-active-during-round`, 50, activeState, roundSessionId));
  engine.process(event('TYPO_CHALLENGE_GUESS_ATTEMPT', `${definition.id}-attempt`, 500, {
    sourceGuessEventId: `${definition.id}-guess-submitted`,
    message: 'Punkt',
    activeChallengeKeys: [definition.id],
    selectedChallengeKeys: [definition.id],
    method: 'typo-relay'
  }, roundSessionId, self));
  engine.process(event('CORRECT_GUESS', `${definition.id}-second-guesser`, 625, {
    ...correctPayload,
    position: 2,
    isFirstGuesser: false
  }, roundSessionId, self));
  assert(engine.getInstance(definition.id)?.status === 'active', `${definition.id} must reject a non-first correct guess.`);
  engine.process(event('CORRECT_GUESS', `${definition.id}-correct`, 650, correctPayload, roundSessionId, self));
  assert(engine.getInstance(definition.id)?.status === 'completion-pending', `${definition.id} should complete while its Typo effect is selected and active.`);
}

const disabled = new ChallengeEngine({ autoPersist: false });
disabled.register(blindGuessDefinition);
disabled.activate({ instanceId: 'blind', challengeId: 'blind-guess' });
disabled.process(event('TYPO_CHALLENGE_STATE_CHANGED', 'disabled-active-before-round', 950, {
  challengeId: 1, challengeKey: 'blind-guess', challengeName: 'Blind Guess',
  selected: true, effectActive: true, featureActive: true,
  reason: 'trigger-applied', method: 'typo-relay'
}, 'disabled-turn'));
disabled.process(event('ROUND_STARTED', 'disabled-round-start', 1000, roundPayload, 'disabled-turn'));
disabled.process(event('TYPO_CHALLENGE_STATE_CHANGED', 'disabled-active', 1050, {
  challengeId: 1,
  challengeKey: 'blind-guess',
  challengeName: 'Blind Guess',
  selected: true,
  effectActive: true,
  featureActive: true,
  reason: 'trigger-applied',
  method: 'typo-relay'
}, 'disabled-turn'));
disabled.process(event('TYPO_CHALLENGE_GUESS_ATTEMPT', 'disabled-attempt', 1200, {
  sourceGuessEventId: 'disabled-source-guess',
  message: 'Punkt',
  activeChallengeKeys: ['blind-guess'],
  selectedChallengeKeys: ['blind-guess'],
  method: 'typo-relay'
}, 'disabled-turn', self));
disabled.process(event('TYPO_CHALLENGE_STATE_CHANGED', 'disabled-selection-off', 1250, {
  challengeId: 1,
  challengeKey: 'blind-guess',
  challengeName: 'Blind Guess',
  selected: false,
  effectActive: false,
  featureActive: true,
  reason: 'selection-changed',
  method: 'typo-relay'
}, 'disabled-turn'));
disabled.process(event('TYPO_CHALLENGE_STATE_CHANGED', 'disabled-selection-on-again', 1300, {
  challengeId: 1,
  challengeKey: 'blind-guess',
  challengeName: 'Blind Guess',
  selected: true,
  effectActive: true,
  featureActive: true,
  reason: 'trigger-applied',
  method: 'typo-relay'
}, 'disabled-turn'));
disabled.process(event('TYPO_CHALLENGE_GUESS_ATTEMPT', 'disabled-second-attempt', 1350, {
  sourceGuessEventId: 'disabled-source-guess-2',
  message: 'Punkt',
  activeChallengeKeys: ['blind-guess'],
  selectedChallengeKeys: ['blind-guess'],
  method: 'typo-relay'
}, 'disabled-turn', self));
disabled.process(event('CORRECT_GUESS', 'disabled-correct', 1450, correctPayload, 'disabled-turn', self));
assert(disabled.getInstance('blind')?.status === 'active', 'Disabling and re-enabling a Typo challenge during the same turn must not complete it.');

const fallback = new ChallengeEngine({ autoPersist: false });
fallback.register(drunkVisionDefinition);
fallback.activate({ instanceId: 'drunk', challengeId: 'drunk-vision' });
fallback.process(event('TYPO_CHALLENGE_STATE_CHANGED', 'fallback-effect-before-round', 1950, {
  challengeId: 2, challengeKey: 'drunk-vision', challengeName: 'Drunk Vision',
  selected: null, effectActive: true, featureActive: null,
  reason: 'dom-fallback', method: 'dom-fallback'
}, 'fallback-turn'));
fallback.process(event('ROUND_STARTED', 'fallback-round-start', 2000, roundPayload, 'fallback-turn'));
fallback.process(event('TYPO_CHALLENGE_STATE_CHANGED', 'fallback-effect', 2050, {
  challengeId: 2,
  challengeKey: 'drunk-vision',
  challengeName: 'Drunk Vision',
  selected: null,
  effectActive: true,
  featureActive: null,
  reason: 'dom-fallback',
  method: 'dom-fallback'
}, 'fallback-turn'));
fallback.process(event('TYPO_CHALLENGE_GUESS_ATTEMPT', 'fallback-attempt', 2200, {
  sourceGuessEventId: 'fallback-source-guess',
  message: 'Punkt',
  activeChallengeKeys: ['drunk-vision'],
  selectedChallengeKeys: [],
  method: 'dom-fallback'
}, 'fallback-turn', self));
fallback.process(event('CORRECT_GUESS', 'fallback-correct', 2300, correctPayload, 'fallback-turn', self));
assert(fallback.getInstance('drunk')?.status === 'completion-pending', 'The DOM fallback should complete when the effect is visibly active at guess submission.');


const fallbackWithoutPriorState = new ChallengeEngine({ autoPersist: false });
fallbackWithoutPriorState.register(deafGuessDefinition);
fallbackWithoutPriorState.activate({ instanceId: 'deaf-no-prior-state', challengeId: 'deaf-guess' });
fallbackWithoutPriorState.process(event('ROUND_STARTED', 'deaf-live-round-start', 3000, roundPayload, 'deaf-live-turn'));
fallbackWithoutPriorState.process(event('TYPO_CHALLENGE_GUESS_ATTEMPT', 'deaf-live-attempt', 3200, {
  sourceGuessEventId: 'deaf-live-source-guess',
  message: 'Pasta',
  activeChallengeKeys: ['deaf-guess'],
  selectedChallengeKeys: [],
  method: 'dom-fallback'
}, 'deaf-live-turn', self));
fallbackWithoutPriorState.process(event('CORRECT_GUESS', 'deaf-live-correct', 3300, {
  ...correctPayload,
  word: 'Pasta'
}, 'deaf-live-turn', self));
assert(
  fallbackWithoutPriorState.getInstance('deaf-no-prior-state')?.status === 'active',
  'A Typo effect first observed during the drawing turn must not complete Deaf Guess.'
);

const fallbackDisabled = new ChallengeEngine({ autoPersist: false });
fallbackDisabled.register(blindGuessDefinition);
fallbackDisabled.activate({ instanceId: 'blind-fallback-disabled', challengeId: 'blind-guess' });
fallbackDisabled.process(event('TYPO_CHALLENGE_STATE_CHANGED', 'blind-fallback-before-round', 3950, {
  challengeId: 1, challengeKey: 'blind-guess', challengeName: 'Blind Guess',
  selected: null, effectActive: true, featureActive: null,
  reason: 'dom-fallback', method: 'dom-fallback'
}, 'blind-fallback-turn'));
fallbackDisabled.process(event('ROUND_STARTED', 'blind-fallback-round-start', 4000, roundPayload, 'blind-fallback-turn'));
fallbackDisabled.process(event('TYPO_CHALLENGE_STATE_CHANGED', 'blind-fallback-active', 4050, {
  challengeId: 1,
  challengeKey: 'blind-guess',
  challengeName: 'Blind Guess',
  selected: null,
  effectActive: true,
  featureActive: null,
  reason: 'dom-fallback',
  method: 'dom-fallback'
}, 'blind-fallback-turn'));
fallbackDisabled.process(event('TYPO_CHALLENGE_STATE_CHANGED', 'blind-fallback-off', 4100, {
  challengeId: 1,
  challengeKey: 'blind-guess',
  challengeName: 'Blind Guess',
  selected: null,
  effectActive: false,
  featureActive: null,
  reason: 'dom-fallback',
  method: 'dom-fallback'
}, 'blind-fallback-turn'));
fallbackDisabled.process(event('TYPO_CHALLENGE_STATE_CHANGED', 'blind-fallback-on-again', 4150, {
  challengeId: 1,
  challengeKey: 'blind-guess',
  challengeName: 'Blind Guess',
  selected: null,
  effectActive: true,
  featureActive: null,
  reason: 'dom-fallback',
  method: 'dom-fallback'
}, 'blind-fallback-turn'));
fallbackDisabled.process(event('TYPO_CHALLENGE_GUESS_ATTEMPT', 'blind-fallback-attempt', 4200, {
  sourceGuessEventId: 'blind-fallback-source-guess',
  message: 'Goldfisch',
  activeChallengeKeys: ['blind-guess'],
  selectedChallengeKeys: [],
  method: 'dom-fallback'
}, 'blind-fallback-turn', self));
fallbackDisabled.process(event('CORRECT_GUESS', 'blind-fallback-correct', 4300, {
  ...correctPayload,
  word: 'Goldfisch'
}, 'blind-fallback-turn', self));
assert(
  fallbackDisabled.getInstance('blind-fallback-disabled')?.status === 'active',
  'A visible DOM deactivation followed by reactivation in the same turn must remain disqualified.'
);

const normalized = normalizeTypoChallengeStateDetail({
  challengeId: 3,
  active: true,
  selected: true,
  featureActive: true,
  reason: 'trigger-applied'
});
assert(normalized?.challengeKey === 'deaf-guess', 'Relay normalization should map Typo challenge ID 3 to deaf-guess.');
assert(normalized.effectActive === true && normalized.selected === true, 'Relay normalization should preserve active and selected state.');

console.log('Typo active-guess challenge runtime tests passed.');
