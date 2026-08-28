import * as assert from 'node:assert/strict';
import {
  LocalPlayerStatsService,
  MemoryLocalStatsPersistence,
  type LocalStatsPersistence,
  type LocalStatsTelemetrySource
} from '@skribbl-duels/telemetry-core';
import {
  TELEMETRY_EVENT_CATEGORIES,
  type TelemetryActor,
  type TelemetryEvent,
  type TelemetryEventType,
  type TelemetryPayloadMap
} from '@skribbl-duels/telemetry-contracts';

class FakeTelemetrySource implements LocalStatsTelemetrySource {
  private readonly listeners = new Set<(event: TelemetryEvent) => void>();
  public readonly recent: TelemetryEvent[] = [];

  public getRecent(): TelemetryEvent[] {
    return this.recent.slice().reverse();
  }

  public subscribe(listener: (event: TelemetryEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public emit(event: TelemetryEvent): void {
    this.recent.push(event);
    for (const listener of this.listeners) listener(event);
  }
}

let sequence = 0;
const selfActor: TelemetryActor = { playerId: 1, name: 'Alpha', isSelf: true };
const context = {
  lobbySessionId: 'lobby-session-1',
  lobbyGeneration: 1,
  lobbyId: 'public-room-1',
  lobbyType: 0,
  languageId: 0,
  languageName: 'English',
  gameSessionId: 'game-1',
  roundSessionId: 'round-1',
  roundIndex: 0,
  roundNumber: 1,
  maxRounds: 3,
  gameStateId: 4,
  gameStateName: 'DRAWING',
  meId: 1,
  drawerId: 2
};

function telemetry<TType extends TelemetryEventType>(
  type: TType,
  occurredAt: number,
  payload: TelemetryPayloadMap[TType],
  actor: TelemetryActor | null = null
): TelemetryEvent {
  sequence += 1;
  return {
    schemaVersion: 1,
    eventId: `local-stats-${sequence}`,
    telemetrySequence: sequence,
    type,
    category: TELEMETRY_EVENT_CATEGORIES[type],
    occurredAt,
    monotonicMs: occurredAt,
    actor,
    context: { ...context },
    source: {
      origin: type === 'TEXT_INPUT_MEASURED' ? 'dom-adapter' : 'decoded-packet',
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

let now = 1_000;
const source = new FakeTelemetrySource();
const persistence = new MemoryLocalStatsPersistence();
const stats = new LocalPlayerStatsService(source, persistence, {
  now: () => now,
  saveDebounceMs: 5,
  getOfficialWordCount: languageId => languageId === 0 ? 100 : null,
  hasOfficialWord: (languageId, word) => languageId === 0 && word.toLocaleLowerCase() === 'apple'
});
await stats.start();

source.emit(telemetry('LOBBY_HYDRATED', 1_000, {
  lobbyId: 'public-room-1',
  playerCount: 2,
  stateName: 'DRAWING',
  lobbyGeneration: 1,
  languageId: 0,
  languageName: 'English',
  meId: 1,
  ownerId: 2,
  roundIndex: 0,
  roundNumber: 1,
  players: [
    { id: 1, name: 'Alpha', avatar: [0, 0, 0, 0], score: 0, guessed: false, flags: 0 },
    { id: 2, name: 'Beta', avatar: [0, 0, 0, 0], score: 0, guessed: false, flags: 0 }
  ]
}));
source.emit(telemetry('TEXT_INPUT_MEASURED', 2_200, {
  attemptId: 'attempt-1',
  message: 'Apple',
  eligibleGuess: true,
  inputSource: 'vanilla',
  startedAt: 1_000,
  submittedAt: 2_200,
  durationMs: 1_200,
  characterCount: 5,
  correctionCount: 2,
  pasteDetected: false,
  autofillDetected: false,
  compositionUsed: false,
  trustedInput: true
}, selfActor));
source.emit(telemetry('GUESS_SUBMITTED', 2_210, {
  message: 'Apple',
  submittedAtServerTime: 70
}, selfActor));
source.emit(telemetry('CORRECT_GUESS', 2_300, {
  playerId: 1,
  position: 1,
  elapsedMs: 5_000,
  estimatedTimeAtGuess: 70,
  serverTimeAnchorAtGuess: 70,
  includesWord: false,
  word: null,
  wrongGuessesBeforeCorrect: 0,
  isFirstGuesser: true
}, selfActor));
source.emit(telemetry('WORD_REVEALED', 5_000, {
  previousStateId: 4,
  stateId: 5,
  stateName: 'ROUND_RESULTS',
  time: 0,
  roundIndex: 0,
  roundNumber: 1,
  maxRounds: 3,
  reason: 0,
  reasonName: 'TIME_UP',
  word: 'Apple',
  scores: []
}));
source.emit(telemetry('TEXT_INPUT_MEASURED', 6_000, {
  attemptId: 'attempt-paste',
  message: 'Pasted',
  eligibleGuess: false,
  inputSource: 'typo',
  startedAt: 5_500,
  submittedAt: 6_000,
  durationMs: 500,
  characterCount: 6,
  correctionCount: 0,
  pasteDetected: true,
  autofillDetected: false,
  compositionUsed: false,
  trustedInput: true
}, selfActor));
source.emit(telemetry('SCORE_CHANGED', 7_000, {
  playerId: 1,
  previousScore: 500,
  totalScore: 900,
  roundScore: 400,
  delta: 400,
  coolNumber: false
}, selfActor));
source.emit(telemetry('GAME_ENDED', 8_000, {
  previousStateId: 5,
  stateId: 6,
  stateName: 'GAME_ENDED',
  time: 0,
  roundIndex: 2,
  roundNumber: 3,
  maxRounds: 3,
  finalScores: [
    { playerId: 1, totalScore: 900, roundScore: 400 },
    { playerId: 2, totalScore: 800, roundScore: 350 }
  ]
}));
source.emit(telemetry('VOTE_SUBMITTED', 8_100, { vote: 1, voteName: 'LIKE' }, selfActor));
source.emit(telemetry('PLAYER_VOTEKICK_SUBMITTED', 8_200, { playerId: 2 }, selfActor));

stats.recordDuelConclusion('duel-1', 'win', 9_000);
stats.recordDuelConclusion('duel-1', 'win', 9_001);
stats.recordChallengeCompletion('claim-1', 'sniper', 10_000, 9_000);
stats.recordChallengeCompletion('claim-2', 'sniper', 12_000, 9_000);
stats.recordChallengeCompletion('claim-3', 'sniper', 11_000, 9_000);
stats.recordChallengeCompletion('claim-4', 'sniper', 15_000, 9_000);

now = 61_000;
const snapshot = stats.getSnapshot();
assert.equal(snapshot.activity.observedPlayTimeMs, 60_000);
assert.equal(snapshot.activity.distinctLobbyIds, 1);
assert.equal(snapshot.activity.lobbySessions, 1);
assert.equal(snapshot.activity.uniqueUsernamesSeen, 1);
assert.equal(snapshot.typing.submittedMessages, 2);
assert.equal(snapshot.typing.cleanSamples, 1);
assert.equal(snapshot.typing.averageWpm, 50);
assert.equal(snapshot.typing.bestWpm, 50);
assert.equal(snapshot.typing.pasteSubmissions, 1);
assert.equal(snapshot.typing.corrections, 2);
assert.equal(snapshot.guessing.attempts, 1);
assert.equal(snapshot.guessing.correctGuesses, 1);
assert.equal(snapshot.guessing.firstGuesses, 1);
assert.equal(snapshot.guessing.averageGuessWpm, 50);
assert.equal(snapshot.guessing.averageGuessTimeMs, 5_000);
assert.equal(snapshot.skribbl.gamesCompleted, 1);
assert.equal(snapshot.skribbl.wins, 1);
assert.equal(snapshot.skribbl.bestPublicScore, 900);
assert.equal(snapshot.social.likesGiven, 1);
assert.equal(snapshot.social.voteKicksGiven, 1);
assert.equal(snapshot.duels.matchesCompleted, 1);
assert.equal(snapshot.duels.wins, 1);
assert.equal(snapshot.duels.challengesCompleted, 4);
assert.deepEqual(snapshot.duels.localFastestChallengeMs.sniper, [1_000, 2_000, 3_000]);
assert.equal(snapshot.languages[0]?.seenOccurrences, 1);
assert.equal(snapshot.languages[0]?.guessedOccurrences, 1);
assert.equal(snapshot.languages[0]?.typedOccurrences, 1);
assert.equal(snapshot.languages[0]?.guessedCoveragePercent, 1);

const apple = stats.getWordStats({ languageId: 0 })[0];
assert.equal(apple?.word, 'Apple');
assert.equal(apple?.timesSeen, 1);
assert.equal(apple?.timesTyped, 1);
assert.equal(apple?.timesGuessed, 1);
assert.equal(apple?.bestWpm, 50);
assert.equal(apple?.averageWpm, 50);
assert.equal(apple?.bestGuessTimeMs, 5_000);
assert.equal(apple?.averageGuessTimeMs, 5_000);
assert.equal(stats.getObservedUsernames()[0]?.name, 'Beta');

await stats.flush();
stats.destroy();

const restored = new LocalPlayerStatsService(new FakeTelemetrySource(), persistence, {
  now: () => now,
  getOfficialWordCount: () => 100
});
await restored.start();
assert.equal(restored.getSnapshot().typing.averageWpm, 50, 'Durable local stats did not restore.');
assert.equal(restored.getWordStats()[0]?.timesGuessed, 1, 'Durable word stats did not restore.');
restored.destroy();

let warned = false;
const originalWarn = console.warn;
console.warn = () => { warned = true; };
const unavailableIndexedDb: LocalStatsPersistence = {
  async load() { throw new Error('blocked'); },
  async save() { throw new Error('unreachable'); },
  async clear() { throw new Error('unreachable'); }
};
const memoryFallback = new LocalPlayerStatsService(
  new FakeTelemetrySource(),
  unavailableIndexedDb,
  { now: () => now }
);
await memoryFallback.start();
assert.equal(memoryFallback.getSnapshot().typing.submittedMessages, 0);
assert.equal(warned, true, 'IndexedDB fallback should leave a diagnostic warning.');
memoryFallback.destroy();
console.warn = originalWarn;

console.log('Local player WPM and word-stat pipeline test passed.');
