import type { LocalPlayerStatsSnapshot } from '@skribbl-duels/telemetry-core';

export const PROFILE_STAT_IDS = [
  'observed-play-time',
  'unique-users-seen',
  'distinct-lobbies',
  'lobby-sessions',
  'play-days',
  'play-day-streak',
  'longest-session',
  'submitted-messages',
  'average-typing-wpm',
  'median-typing-wpm',
  'p90-typing-wpm',
  'best-typing-wpm',
  'typing-trend',
  'guess-attempts',
  'guess-accuracy',
  'first-guesser-rate',
  'average-guess-wpm',
  'median-guess-wpm',
  'p90-guess-wpm',
  'best-guess-wpm',
  'average-guess-time',
  'median-guess-time',
  'p90-guess-time',
  'best-guess-time',
  'guess-wpm-trend',
  'guess-time-trend',
  'drawing-effectiveness',
  'drawing-round-score',
  'drawing-rounds',
  'drawing-reactions',
  'skribbl-wins',
  'skribbl-win-rate',
  'skribbl-win-streak',
  'best-public-score',
  'best-private-score',
  'duel-matches',
  'duel-wins',
  'duel-win-rate',
  'duel-win-streak',
  'challenges-completed',
  'social-actions',
  'unique-words-seen',
  'unique-words-guessed',
  'seen-word-coverage',
  'guessed-word-coverage'
] as const;

export type ProfileStatId = typeof PROFILE_STAT_IDS[number];

export interface ProfileStatDefinition {
  id: ProfileStatId;
  label: string;
  description: string;
  fallback: string;
  value(snapshot: LocalPlayerStatsSnapshot): string;
}

export const DEFAULT_PINNED_PROFILE_STAT_IDS: readonly [ProfileStatId, ProfileStatId] = [
  'best-typing-wpm',
  'duel-wins'
];

export const DEFAULT_MAIN_PROFILE_STAT_IDS: readonly ProfileStatId[] = [
  'observed-play-time',
  'unique-users-seen',
  'guess-accuracy',
  'average-guess-time',
  'skribbl-wins',
  'duel-wins',
  'challenges-completed',
  'unique-words-guessed',
  'guessed-word-coverage',
  'drawing-effectiveness',
  'play-day-streak',
  'skribbl-win-streak'
];

const integer = (value: number): string => Math.round(value).toLocaleString();
const decimal = (value: number | null, suffix = ''): string => value === null ? '—' : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
const wpm = (value: number | null): string => decimal(value, ' WPM');
const percentage = (value: number | null): string => decimal(value, '%');
const duration = (value: number | null): string => {
  if (value === null) return '—';
  const totalSeconds = Math.max(0, Math.round(value / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};
const trend = (value: number | null): string => value === null
  ? 'Collecting…'
  : `${value >= 0 ? '+' : ''}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

function languageTotals(snapshot: LocalPlayerStatsSnapshot): {
  seen: number;
  guessed: number;
  official: number;
  seenCovered: number;
  guessedCovered: number;
} {
  return snapshot.languages.reduce((total, language) => {
    total.seen += language.uniqueWordsSeen;
    total.guessed += language.uniqueWordsGuessed;
    if (language.officialWordCount !== null) {
      total.official += language.officialWordCount;
      total.seenCovered += language.uniqueWordsSeen;
      total.guessedCovered += language.uniqueWordsGuessed;
    }
    return total;
  }, { seen: 0, guessed: 0, official: 0, seenCovered: 0, guessedCovered: 0 });
}

const definitions: ProfileStatDefinition[] = [
  { id: 'observed-play-time', label: 'Observed play time', description: 'Visible time observed while a Skribbl lobby was active.', fallback: '⏱', value: s => duration(s.activity.observedPlayTimeMs) },
  { id: 'unique-users-seen', label: 'Users seen', description: 'Distinct normalized Skribbl usernames observed locally.', fallback: '👥', value: s => integer(s.activity.uniqueUsernamesSeen) },
  { id: 'distinct-lobbies', label: 'Different lobbies', description: 'Distinct lobby IDs joined.', fallback: '⌂', value: s => integer(s.activity.distinctLobbyIds) },
  { id: 'lobby-sessions', label: 'Lobby sessions', description: 'Distinct authoritative lobby sessions observed.', fallback: '↪', value: s => integer(s.activity.lobbySessions) },
  { id: 'play-days', label: 'Play days', description: 'Different local calendar days with observed lobby activity.', fallback: '▦', value: s => integer(s.activity.playDays) },
  { id: 'play-day-streak', label: 'Play-day streak', description: 'Current consecutive local play-day streak; tooltip includes the personal best.', fallback: '🔥', value: s => `${integer(s.activity.currentPlayDayStreak)} · best ${integer(s.activity.bestPlayDayStreak)}` },
  { id: 'longest-session', label: 'Longest session', description: 'Longest continuously observed local play session.', fallback: '⌛', value: s => duration(s.activity.longestSessionTimeMs) },
  { id: 'submitted-messages', label: 'Messages measured', description: 'Local chat submissions measured for WPM eligibility.', fallback: '✎', value: s => integer(s.typing.submittedMessages) },
  { id: 'average-typing-wpm', label: 'Average WPM', description: 'Lifetime average across clean, trusted typing samples.', fallback: 'A', value: s => wpm(s.typing.averageWpm) },
  { id: 'median-typing-wpm', label: 'Median WPM', description: 'Median of the latest 512 clean typing samples.', fallback: 'M', value: s => wpm(s.typing.medianWpm) },
  { id: 'p90-typing-wpm', label: 'P90 WPM', description: '90th percentile of the latest 512 clean typing samples.', fallback: '90', value: s => wpm(s.typing.p90Wpm) },
  { id: 'best-typing-wpm', label: 'Best WPM', description: 'Fastest clean local message sample.', fallback: '⚡', value: s => wpm(s.typing.bestWpm) },
  { id: 'typing-trend', label: 'Typing trend', description: 'Latest 20 clean samples compared with the previous 20.', fallback: '↗', value: s => trend(s.typing.improvementTrendPercent) },
  { id: 'guess-attempts', label: 'Guess attempts', description: 'All locally observed submitted guesses.', fallback: '?', value: s => integer(s.guessing.attempts) },
  { id: 'guess-accuracy', label: 'Guess accuracy', description: 'Correct guesses divided by all submitted guess attempts.', fallback: '◎', value: s => percentage(s.guessing.accuracyPercent) },
  { id: 'first-guesser-rate', label: 'First-guesser rate', description: 'Correct guesses that were also the first correct guess.', fallback: '1', value: s => percentage(s.guessing.firstGuesserRatePercent) },
  { id: 'average-guess-wpm', label: 'Average guess WPM', description: 'Average clean WPM for guesses that became correct.', fallback: 'G', value: s => wpm(s.guessing.averageGuessWpm) },
  { id: 'median-guess-wpm', label: 'Median guess WPM', description: 'Median of the latest 512 clean correct-guess samples.', fallback: 'GM', value: s => wpm(s.guessing.medianGuessWpm) },
  { id: 'p90-guess-wpm', label: 'P90 guess WPM', description: '90th percentile of the latest 512 clean correct-guess samples.', fallback: 'G90', value: s => wpm(s.guessing.p90GuessWpm) },
  { id: 'best-guess-wpm', label: 'Best guess WPM', description: 'Fastest clean correct-guess typing sample.', fallback: 'G⚡', value: s => wpm(s.guessing.bestGuessWpm) },
  { id: 'average-guess-time', label: 'Average guess time', description: 'Average elapsed time until your correct guess.', fallback: 'GT', value: s => duration(s.guessing.averageGuessTimeMs) },
  { id: 'median-guess-time', label: 'Median guess time', description: 'Median of the latest 512 correct-guess times.', fallback: 'TM', value: s => duration(s.guessing.medianGuessTimeMs) },
  { id: 'p90-guess-time', label: 'P90 guess time', description: '90th percentile of the latest 512 correct-guess times.', fallback: 'T90', value: s => duration(s.guessing.p90GuessTimeMs) },
  { id: 'best-guess-time', label: 'Best guess time', description: 'Fastest observed correct-guess time.', fallback: '⏱', value: s => duration(s.guessing.bestGuessTimeMs) },
  { id: 'guess-wpm-trend', label: 'Guess WPM trend', description: 'Latest 20 clean guess-WPM samples compared with the previous 20.', fallback: 'G↗', value: s => trend(s.guessing.wpmImprovementTrendPercent) },
  { id: 'guess-time-trend', label: 'Guess-time trend', description: 'Latest 20 guess times compared with the previous 20; faster is positive.', fallback: 'T↗', value: s => trend(s.guessing.timeImprovementTrendPercent) },
  { id: 'drawing-effectiveness', label: 'Drawing effectiveness', description: 'Average share of eligible opponents who guessed your drawings.', fallback: '✐', value: s => percentage(s.drawing.averageEffectivenessPercent) },
  { id: 'drawing-round-score', label: 'Drawing score', description: 'Average score in your completed drawing rounds.', fallback: '✎', value: s => decimal(s.drawing.averageRoundScore) },
  { id: 'drawing-rounds', label: 'Drawing rounds', description: 'Own drawing rounds completed with authoritative round results.', fallback: '▧', value: s => integer(s.drawing.roundsCompleted) },
  { id: 'drawing-reactions', label: 'Drawing reactions', description: 'Likes and dislikes received for your drawings.', fallback: '♥', value: s => `${integer(s.drawing.likesReceived)} / ${integer(s.drawing.dislikesReceived)}` },
  { id: 'skribbl-wins', label: 'Skribbl wins', description: 'Sole first-place game finishes with a positive score.', fallback: 'W', value: s => integer(s.skribbl.wins) },
  { id: 'skribbl-win-rate', label: 'Skribbl win rate', description: 'Skribbl wins divided by completed games.', fallback: '%', value: s => percentage(s.skribbl.winRatePercent) },
  { id: 'skribbl-win-streak', label: 'Skribbl win streak', description: 'Current Skribbl win streak and personal best.', fallback: 'S🔥', value: s => `${integer(s.skribbl.currentWinStreak)} · best ${integer(s.skribbl.bestWinStreak)}` },
  { id: 'best-public-score', label: 'Best public score', description: 'Highest score observed in a public lobby.', fallback: 'P', value: s => decimal(s.skribbl.bestPublicScore) },
  { id: 'best-private-score', label: 'Best private score', description: 'Highest score observed in a private lobby.', fallback: 'L', value: s => decimal(s.skribbl.bestPrivateScore) },
  { id: 'duel-matches', label: 'Duel matches', description: 'Authoritative Skribbl Duel conclusions recorded locally.', fallback: 'VS', value: s => integer(s.duels.matchesCompleted) },
  { id: 'duel-wins', label: 'Duel wins', description: 'Authoritative Skribbl Duel wins.', fallback: 'DW', value: s => integer(s.duels.wins) },
  { id: 'duel-win-rate', label: 'Duel win rate', description: 'Duel wins divided by completed Duel matches.', fallback: 'D%', value: s => percentage(s.duels.winRatePercent) },
  { id: 'duel-win-streak', label: 'Duel win streak', description: 'Current Duel win streak and personal best.', fallback: 'D🔥', value: s => `${integer(s.duels.currentWinStreak)} · best ${integer(s.duels.bestWinStreak)}` },
  { id: 'challenges-completed', label: 'Challenges completed', description: 'Confirmed authoritative challenge claims recorded locally.', fallback: '✓', value: s => integer(s.duels.challengesCompleted) },
  { id: 'social-actions', label: 'Social actions', description: 'Likes, dislikes, votekicks and host kicks submitted.', fallback: '☺', value: s => integer(s.social.likesGiven + s.social.dislikesGiven + s.social.voteKicksGiven + s.social.hostKicksGiven) },
  { id: 'unique-words-seen', label: 'Unique words seen', description: 'Unique revealed words across observed languages.', fallback: '◉', value: s => integer(languageTotals(s).seen) },
  { id: 'unique-words-guessed', label: 'Unique words guessed', description: 'Unique words you correctly guessed across observed languages.', fallback: '✓W', value: s => integer(languageTotals(s).guessed) },
  { id: 'seen-word-coverage', label: 'Seen-word coverage', description: 'Weighted coverage across languages with an authoritative word list.', fallback: 'C', value: s => { const t = languageTotals(s); return percentage(t.official > 0 ? (t.seenCovered / t.official) * 100 : null); } },
  { id: 'guessed-word-coverage', label: 'Guessed-word coverage', description: 'Weighted guessed coverage across languages with an authoritative word list.', fallback: 'GC', value: s => { const t = languageTotals(s); return percentage(t.official > 0 ? (t.guessedCovered / t.official) * 100 : null); } }
];

export const PROFILE_STAT_DEFINITIONS: readonly ProfileStatDefinition[] = definitions;
export const PROFILE_STAT_DEFINITION_BY_ID: Readonly<Record<ProfileStatId, ProfileStatDefinition>> =
  Object.fromEntries(definitions.map(definition => [definition.id, definition])) as Record<ProfileStatId, ProfileStatDefinition>;

export function isProfileStatId(value: unknown): value is ProfileStatId {
  return typeof value === 'string' && (PROFILE_STAT_IDS as readonly string[]).includes(value);
}
