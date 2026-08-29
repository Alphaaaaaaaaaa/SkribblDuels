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
context.roundSessionId = 'round-drawing';
context.drawerId = 1;
source.emit(telemetry('ROUND_STARTED', 7_100, {
  previousStateId: 3,
  stateId: 4,
  stateName: 'DRAWING',
  time: 80,
  roundIndex: 1,
  roundNumber: 2,
  maxRounds: 3,
  drawerId: 1,
  word: 'Pear',
  wordLengths: [4],
  initialTime: 80,
  players: [
    { id: 1, name: 'Alpha', avatar: [0, 0, 0, 0], score: 900, guessed: false, flags: 0 },
    { id: 2, name: 'Beta', avatar: [0, 0, 0, 0], score: 800, guessed: false, flags: 0 }
  ]
}));
source.emit(telemetry('CORRECT_GUESS', 7_300, {
  playerId: 2,
  position: 1,
  elapsedMs: 8_000,
  estimatedTimeAtGuess: 72,
  serverTimeAnchorAtGuess: 72,
  includesWord: false,
  word: null,
  wrongGuessesBeforeCorrect: 0,
  isFirstGuesser: true
}, { playerId: 2, name: 'Beta', isSelf: false }));
source.emit(telemetry('LIKE_RECEIVED', 7_350, {}));
source.emit(telemetry('ROUND_RESULTS_AVAILABLE', 7_500, {
  previousStateId: 4,
  stateId: 5,
  stateName: 'ROUND_RESULTS',
  time: 0,
  roundIndex: 1,
  roundNumber: 2,
  maxRounds: 3,
  reason: 0,
  reasonName: 'TIME_UP',
  word: 'Pear',
  scores: [
    { playerId: 1, totalScore: 1_400, roundScore: 500 },
    { playerId: 2, totalScore: 1_150, roundScore: 350 }
  ]
}));
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
assert.equal(snapshot.activity.playSessions, 1);
assert.equal(snapshot.activity.playDays, 1);
assert.equal(snapshot.activity.currentPlayDayStreak, 1);
assert.equal(snapshot.activity.bestPlayDayStreak, 1);
assert.equal(snapshot.typing.submittedMessages, 2);
assert.equal(snapshot.typing.cleanSamples, 1);
assert.equal(snapshot.typing.averageWpm, 50);
assert.equal(snapshot.typing.bestWpm, 50);
assert.equal(snapshot.typing.medianWpm, 50);
assert.equal(snapshot.typing.p90Wpm, 50);
assert.equal(snapshot.typing.pasteSubmissions, 1);
assert.equal(snapshot.typing.corrections, 2);
assert.equal(snapshot.guessing.attempts, 1);
assert.equal(snapshot.guessing.correctGuesses, 1);
assert.equal(snapshot.guessing.firstGuesses, 1);
assert.equal(snapshot.guessing.averageGuessWpm, 50);
assert.equal(snapshot.guessing.averageGuessTimeMs, 5_000);
assert.equal(snapshot.guessing.medianGuessTimeMs, 5_000);
assert.equal(snapshot.guessing.p90GuessTimeMs, 5_000);
assert.equal(snapshot.guessing.accuracyPercent, 100);
assert.equal(snapshot.guessing.firstGuesserRatePercent, 100);
assert.equal(snapshot.drawing.roundsCompleted, 1);
assert.equal(snapshot.drawing.averageEffectivenessPercent, 100);
assert.equal(snapshot.drawing.averageRoundScore, 500);
assert.equal(snapshot.drawing.likesReceived, 1);
assert.equal(snapshot.skribbl.gamesCompleted, 1);
assert.equal(snapshot.skribbl.wins, 1);
assert.equal(snapshot.skribbl.currentWinStreak, 1);
assert.equal(snapshot.skribbl.bestWinStreak, 1);
assert.equal(snapshot.skribbl.bestPublicScore, 900);
assert.equal(snapshot.social.likesGiven, 1);
assert.equal(snapshot.social.voteKicksGiven, 1);
assert.equal(snapshot.duels.matchesCompleted, 1);
assert.equal(snapshot.duels.wins, 1);
assert.equal(snapshot.duels.currentWinStreak, 1);
assert.equal(snapshot.duels.bestWinStreak, 1);
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

context.languageId = 1;
context.languageName = 'German';
source.emit(telemetry('WORD_REVEALED', 5_100, {
  previousStateId: 4,
  stateId: 5,
  stateName: 'ROUND_RESULTS',
  time: 0,
  roundIndex: 0,
  roundNumber: 1,
  maxRounds: 3,
  reason: 0,
  reasonName: 'TIME_UP',
  word: 'Banane',
  scores: []
}));
context.languageId = 0;
context.languageName = 'English';
assert.deepEqual(
  stats.getWordStats({ sort: 'language' }).map(word => word.languageName),
  ['English', 'German'],
  'Language sorting must default to alphabetical order.'
);
assert.deepEqual(
  stats.getWordStats({ sort: 'alphabetical', direction: 'descending' }).map(word => word.word),
  ['Banane', 'Apple'],
  'Clicking Word a second time must support reverse-alphabetical order.'
);
assert.deepEqual(
  stats.getWordStats({ sort: 'average-wpm', direction: 'ascending' }).map(word => word.word),
  ['Apple', 'Banane'],
  'Unavailable WPM values must remain below measured words in either direction.'
);

await stats.flush();
const durableBeforeDestroy = await persistence.load();
stats.destroy();

const restored = new LocalPlayerStatsService(new FakeTelemetrySource(), persistence, {
  now: () => now,
  getOfficialWordCount: () => 100
});
await restored.start();
assert.equal(restored.getSnapshot().typing.averageWpm, 50, 'Durable local stats did not restore.');
assert.equal(restored.getWordStats()[0]?.timesGuessed, 1, 'Durable word stats did not restore.');
restored.destroy();

const legacySummary = structuredClone(durableBeforeDestroy.summary) as unknown as Record<string, unknown>;
legacySummary.schemaVersion = 1;
for (const key of [
  'typingWpmDistribution',
  'guessWpmDistribution',
  'guessTimeDistributionMs',
  'drawingRoundsCompleted',
  'currentSkribblWinStreak',
  'currentDuelWinStreak',
  'playDateKeys'
]) delete legacySummary[key];
const legacyPersistence: LocalStatsPersistence = {
  async load() {
    return {
      summary: legacySummary as never,
      words: durableBeforeDestroy.words,
      usernames: durableBeforeDestroy.usernames
    };
  },
  async save() {},
  async clear() {}
};
const migrated = new LocalPlayerStatsService(new FakeTelemetrySource(), legacyPersistence, {
  now: () => now
});
await migrated.start();
assert.equal(migrated.getSnapshot().schemaVersion, 2);
assert.equal(migrated.getSnapshot().typing.averageWpm, 50, 'Schema-v1 totals were not migrated.');
assert.equal(migrated.getSnapshot().typing.medianWpm, null, 'Missing legacy samples need an honest null percentile.');
migrated.destroy();

const trendSource = new FakeTelemetrySource();
const trendStats = new LocalPlayerStatsService(trendSource, new MemoryLocalStatsPersistence(), {
  now: () => now
});
await trendStats.start();
for (let index = 0; index < 40; index += 1) {
  context.roundSessionId = `trend-round-${index}`;
  context.drawerId = 2;
  const durationMs = index < 20 ? 1_000 : 500;
  const guessTimeMs = index < 20 ? 10_000 : 5_000;
  const occurredAt = 100_000 + index * 100;
  trendSource.emit(telemetry('TEXT_INPUT_MEASURED', occurredAt, {
    attemptId: `trend-attempt-${index}`,
    message: `word${index}`,
    eligibleGuess: true,
    inputSource: 'vanilla',
    startedAt: occurredAt - durationMs,
    submittedAt: occurredAt,
    durationMs,
    characterCount: 5,
    correctionCount: 0,
    pasteDetected: false,
    autofillDetected: false,
    compositionUsed: false,
    trustedInput: true
  }, selfActor));
  trendSource.emit(telemetry('GUESS_SUBMITTED', occurredAt + 1, {
    message: `word${index}`,
    submittedAtServerTime: 70
  }, selfActor));
  trendSource.emit(telemetry('CORRECT_GUESS', occurredAt + 2, {
    playerId: 1,
    position: 1,
    elapsedMs: guessTimeMs,
    estimatedTimeAtGuess: 70,
    serverTimeAnchorAtGuess: 70,
    includesWord: false,
    word: null,
    wrongGuessesBeforeCorrect: 0,
    isFirstGuesser: true
  }, selfActor));
}
const trendSnapshot = trendStats.getSnapshot();
assert.equal(trendSnapshot.typing.medianWpm, 90);
assert.equal(trendSnapshot.typing.p90Wpm, 120);
assert.equal(trendSnapshot.typing.improvementTrendPercent, 100);
assert.equal(trendSnapshot.guessing.wpmImprovementTrendPercent, 100);
assert.equal(trendSnapshot.guessing.timeImprovementTrendPercent, 50);
trendStats.destroy();

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
