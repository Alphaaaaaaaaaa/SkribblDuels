import * as assert from 'node:assert/strict';
import type {
  TelemetryEventOf
} from '@skribbl-duels/telemetry-contracts';
import {
  ChatStatTelemetryTracker,
  chatStatAnnotationMatchesLine,
  formatChatStatDuration,
  resolveChatStatRenderParts
} from '../apps/telemetry-inspector/src/chatStatDisplay';

const BASE_TIME = 1_900_000_000_000;
let sequence = 0;

function context(roundSessionId: string) {
  return {
    lobbySessionId: 'chat-stats-lobby',
    lobbyGeneration: 1,
    lobbyId: 'CHAT-STATS',
    lobbyType: 0,
    languageId: 0,
    languageName: 'English',
    gameSessionId: 'chat-stats-game',
    roundSessionId,
    roundIndex: 0,
    roundNumber: 1,
    maxRounds: 3,
    gameStateId: 4,
    gameStateName: 'DRAWING',
    meId: 21,
    drawerId: 31
  } as const;
}

function measurement(
  id: string,
  message: string,
  occurredAt: number,
  durationMs: number,
  roundSessionId: string,
  pasteDetected = false
): TelemetryEventOf<'TEXT_INPUT_MEASURED'> {
  sequence += 1;
  return {
    schemaVersion: 1,
    eventId: `${id}-measurement`,
    telemetrySequence: sequence,
    type: 'TEXT_INPUT_MEASURED',
    category: 'chat',
    occurredAt,
    monotonicMs: occurredAt - BASE_TIME,
    actor: { playerId: 21, name: 'Alpha', isSelf: true },
    context: context(roundSessionId),
    source: {
      origin: 'dom-adapter',
      rawRecordId: null,
      changeId: null,
      direction: null,
      socketEvent: null,
      packetId: null
    },
    payload: {
      attemptId: `${id}-attempt`,
      message,
      eligibleGuess: true,
      inputSource: 'vanilla',
      startedAt: occurredAt - durationMs,
      submittedAt: occurredAt,
      durationMs,
      characterCount: Array.from(message.trim().normalize('NFKC')).length,
      correctionCount: 0,
      pasteDetected,
      autofillDetected: false,
      compositionUsed: false,
      trustedInput: true
    },
    confidence: 'confirmed',
    highVolume: false
  };
}

function submission(
  id: string,
  message: string,
  occurredAt: number,
  roundSessionId: string
): TelemetryEventOf<'GUESS_SUBMITTED'> {
  sequence += 1;
  return {
    schemaVersion: 1,
    eventId: `${id}-submission`,
    telemetrySequence: sequence,
    type: 'GUESS_SUBMITTED',
    category: 'guessing',
    occurredAt,
    monotonicMs: occurredAt - BASE_TIME,
    actor: { playerId: 21, name: 'Alpha', isSelf: true },
    context: context(roundSessionId),
    source: {
      origin: 'decoded-packet',
      rawRecordId: `${id}-outgoing`,
      changeId: null,
      direction: 'client-to-server',
      socketEvent: 'data',
      packetId: 30
    },
    payload: { message, submittedAtServerTime: 75 },
    confidence: 'derived',
    highVolume: false
  };
}

function correctGuess(options: {
  id: string;
  playerId: number;
  playerName: string;
  self: boolean;
  occurredAt: number;
  elapsedMs: number;
  position: number;
  roundSessionId: string;
  word?: string | null;
}): TelemetryEventOf<'CORRECT_GUESS'> {
  sequence += 1;
  return {
    schemaVersion: 1,
    eventId: `${options.id}-correct`,
    telemetrySequence: sequence,
    type: 'CORRECT_GUESS',
    category: 'guessing',
    occurredAt: options.occurredAt,
    monotonicMs: options.occurredAt - BASE_TIME,
    actor: {
      playerId: options.playerId,
      name: options.playerName,
      isSelf: options.self
    },
    context: context(options.roundSessionId),
    source: {
      origin: 'lobby-change',
      rawRecordId: `${options.id}-incoming`,
      changeId: `${options.id}-change`,
      direction: null,
      socketEvent: null,
      packetId: null
    },
    payload: {
      playerId: options.playerId,
      position: options.position,
      elapsedMs: options.elapsedMs,
      estimatedTimeAtGuess: 75,
      serverTimeAnchorAtGuess: 80,
      includesWord: options.word !== null,
      word: options.word === undefined ? 'apple' : options.word,
      wrongGuessesBeforeCorrect: 0,
      isFirstGuesser: options.position === 1
    },
    confidence: 'confirmed',
    highVolume: false
  };
}

assert.equal(formatChatStatDuration(5_385), '5.385s');
assert.equal(formatChatStatDuration(5_520), '5.520s');
assert.equal(formatChatStatDuration(75_000), '1m 15s');
assert.equal(formatChatStatDuration(529, true), '+529ms');
assert.equal(formatChatStatDuration(11_593, true), '+11.593s');
assert.equal(formatChatStatDuration(61_000, true), '+1m 1s');
assert.equal(formatChatStatDuration(-1), null);

const tracker = new ChatStatTelemetryTracker();
const normal = tracker.observe(measurement(
  'normal',
  'hello world!',
  BASE_TIME + 1_000,
  1_714,
  'round-normal'
))[0];
assert.ok(normal);
assert.equal(normal.kind, 'message');
assert.equal(normal.wpm, 84);
assert.ok(chatStatAnnotationMatchesLine(normal, 'Alpha: hello world!'));
assert.ok(!chatStatAnnotationMatchesLine(normal, 'Haxor: hello world!'));
assert.deepEqual(resolveChatStatRenderParts(normal, {
  wpmDisplay: 'correct-guesses',
  guessTimeDisplay: 'disabled'
}), []);
assert.deepEqual(
  resolveChatStatRenderParts(normal, {
    wpmDisplay: 'all-typed-messages',
    guessTimeDisplay: 'disabled'
  }).map(part => part.text),
  ['84wpm']
);

const measured = measurement('first', 'apple', BASE_TIME + 10_000, 328, 'round-first');
tracker.observe(measured);
tracker.observe(submission('first', 'apple', BASE_TIME + 10_050, 'round-first'));
const first = tracker.observe(correctGuess({
  id: 'first',
  playerId: 21,
  playerName: 'Alpha',
  self: true,
  occurredAt: BASE_TIME + 10_150,
  elapsedMs: 5_520,
  position: 1,
  roundSessionId: 'round-first'
}))[0];
assert.ok(first);
assert.equal(first.wpm, 183);
assert.equal(first.supersedesId, 'message:first-attempt');
assert.ok(chatStatAnnotationMatchesLine(first, 'Alpha guessed the word!'));
assert.deepEqual(
  resolveChatStatRenderParts(first, {
    wpmDisplay: 'correct-guesses',
    guessTimeDisplay: 'self-guesses'
  }).map(part => part.text),
  ['(5.520s)', '183wpm'],
  'Guess time must render before WPM when both settings are enabled.'
);

const second = tracker.observe(correctGuess({
  id: 'second',
  playerId: 22,
  playerName: 'Haxor',
  self: false,
  occurredAt: BASE_TIME + 10_679,
  elapsedMs: 6_049,
  position: 2,
  roundSessionId: 'round-first',
  word: null
}))[0];
assert.ok(second);
assert.equal(second.guessDeltaMs, 529);
assert.deepEqual(
  resolveChatStatRenderParts(second, {
    wpmDisplay: 'disabled',
    guessTimeDisplay: 'all-guesses'
  }).map(part => part.text),
  ['(+529ms)']
);
assert.deepEqual(resolveChatStatRenderParts(second, {
  wpmDisplay: 'disabled',
  guessTimeDisplay: 'self-guesses'
}), []);
assert.equal(tracker.observe(correctGuess({
  id: 'second',
  playerId: 22,
  playerName: 'Haxor',
  self: false,
  occurredAt: BASE_TIME + 10_679,
  elapsedMs: 6_049,
  position: 2,
  roundSessionId: 'round-first',
  word: null
})).length, 0, 'A duplicate telemetry event must not append a duplicate stat suffix.');

const pastedTracker = new ChatStatTelemetryTracker();
assert.equal(pastedTracker.observe(measurement(
  'pasted',
  'apple',
  BASE_TIME + 20_000,
  328,
  'round-pasted',
  true
)).length, 0, 'Pasted input is not a typed WPM sample.');
pastedTracker.observe(submission('pasted', 'apple', BASE_TIME + 20_050, 'round-pasted'));
const pastedCorrect = pastedTracker.observe(correctGuess({
  id: 'pasted',
  playerId: 21,
  playerName: 'Alpha',
  self: true,
  occurredAt: BASE_TIME + 20_150,
  elapsedMs: 5_000,
  position: 1,
  roundSessionId: 'round-pasted'
}))[0];
assert.ok(pastedCorrect);
assert.equal(pastedCorrect.wpm, null);

console.log('Configurable skribbl-chat WPM and Guess Time display tests passed.');
