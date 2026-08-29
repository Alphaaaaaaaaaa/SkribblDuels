import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { LocalPlayerStatsSnapshot } from '@skribbl-duels/telemetry-core';
import {
  DEFAULT_PINNED_PROFILE_STAT_IDS,
  PROFILE_STAT_DEFINITION_BY_ID,
  PROFILE_STAT_IDS
} from '../apps/telemetry-inspector/src/profileStats';

const registry = JSON.parse(await readFile(resolve(
  process.cwd(),
  'stat-icons/registry.template.json'
), 'utf8')) as {
  utilities: { pin: string };
  stats: Array<{ statId: string; assetPath: string }>;
};
assert.equal(registry.utilities.pin, 'stat-icons/pin.gif');
assert.deepEqual(
  new Set(registry.stats.map(entry => entry.statId)),
  new Set(PROFILE_STAT_IDS),
  'Every selectable profile statistic needs a reserved icon path.'
);
assert.equal(new Set(registry.stats.map(entry => entry.assetPath)).size, registry.stats.length);

const snapshot: LocalPlayerStatsSnapshot = {
  schemaVersion: 2,
  version: '0.2.0',
  createdAt: 1,
  updatedAt: 2,
  activity: {
    observedPlayTimeMs: 3_600_000,
    distinctLobbyIds: 3,
    lobbySessions: 4,
    uniqueUsernamesSeen: 5,
    playSessions: 4,
    currentSessionTimeMs: 60_000,
    longestSessionTimeMs: 120_000,
    playDays: 2,
    currentPlayDayStreak: 2,
    bestPlayDayStreak: 4
  },
  typing: {
    submittedMessages: 10,
    cleanSamples: 8,
    averageWpm: 80,
    medianWpm: 75,
    p90Wpm: 120,
    bestWpm: 140,
    improvementTrendPercent: 12.5,
    corrections: 1,
    pasteSubmissions: 0,
    autofillSubmissions: 0,
    compositionSubmissions: 0,
    untrustedSubmissions: 0
  },
  guessing: {
    attempts: 10,
    wrongGuesses: 5,
    correctGuesses: 5,
    firstGuesses: 1,
    accuracyPercent: 50,
    firstGuesserRatePercent: 20,
    averageGuessWpm: 90,
    medianGuessWpm: 85,
    p90GuessWpm: 130,
    bestGuessWpm: 150,
    averageGuessTimeMs: 8_000,
    medianGuessTimeMs: 7_000,
    p90GuessTimeMs: 12_000,
    bestGuessTimeMs: 2_000,
    wpmImprovementTrendPercent: 5,
    timeImprovementTrendPercent: 10
  },
  drawing: {
    roundsCompleted: 2,
    averageEffectivenessPercent: 75,
    bestEffectivenessPercent: 100,
    averageRoundScore: 450,
    bestRoundScore: 500,
    likesReceived: 3,
    dislikesReceived: 1
  },
  skribbl: {
    gamesCompleted: 4,
    wins: 2,
    winRatePercent: 50,
    averageFinalScore: 1_000,
    bestPublicScore: 1_500,
    bestPrivateScore: 1_700,
    currentWinStreak: 1,
    bestWinStreak: 2
  },
  social: { likesGiven: 2, dislikesGiven: 1, voteKicksGiven: 1, hostKicksGiven: 0 },
  duels: {
    matchesCompleted: 3,
    wins: 2,
    draws: 0,
    winRatePercent: 66.67,
    challengesCompleted: 12,
    currentWinStreak: 2,
    bestWinStreak: 2,
    localFastestChallengeMs: {}
  },
  languages: [{
    languageId: 0,
    languageName: 'English',
    officialWordCount: 100,
    seenOccurrences: 30,
    uniqueWordsSeen: 20,
    guessedOccurrences: 15,
    uniqueWordsGuessed: 10,
    typedOccurrences: 20,
    uniqueWordsTyped: 12,
    seenCoveragePercent: 20,
    guessedCoveragePercent: 10
  }]
};

assert.deepEqual(DEFAULT_PINNED_PROFILE_STAT_IDS, ['best-typing-wpm', 'duel-wins']);
assert.equal(PROFILE_STAT_DEFINITION_BY_ID['guess-accuracy'].value(snapshot), '50%');
assert.equal(PROFILE_STAT_DEFINITION_BY_ID['guessed-word-coverage'].value(snapshot), '10%');
assert.match(PROFILE_STAT_DEFINITION_BY_ID['play-day-streak'].value(snapshot), /best 4/);

const uiSource = await readFile(resolve(
  process.cwd(),
  'apps/telemetry-inspector/src/duelProductUi.ts'
), 'utf8');
assert.match(uiSource, /'button', 'scd-modal-account'/);
assert.match(uiSource, /'Skribbl Duel Profile'/);
assert.match(uiSource, /'View all Stats'/);
assert.match(uiSource, /'Choose profile status'/);
assert.match(uiSource, /subscribeLocalStats/);

console.log('Local Duel Profile, coverage and stat-icon registry test passed.');
