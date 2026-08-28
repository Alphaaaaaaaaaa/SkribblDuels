import type {
  TelemetryEvent,
  TelemetryEventOf
} from '@skribbl-duels/telemetry-contracts';

export const LOCAL_PLAYER_STATS_SCHEMA_VERSION = 1 as const;
export const LOCAL_PLAYER_STATS_VERSION = '0.1.0' as const;
const MAX_VALID_WPM = 609;
const MIN_VALID_TYPING_MS = 250;
const MAX_VALID_TYPING_MS = 300_000;
const RECENT_MARKER_LIMIT = 2_048;

export type LocalWordStatsSort =
  | 'occurrence'
  | 'guessed'
  | 'best-wpm'
  | 'average-wpm'
  | 'best-guess-time'
  | 'average-guess-time'
  | 'last-seen'
  | 'alphabetical';

export interface LocalWordStatsQuery {
  languageId?: number;
  sort?: LocalWordStatsSort;
  direction?: 'ascending' | 'descending';
  limit?: number;
}

export interface LocalWordStatsSnapshot {
  wordKey: string;
  languageId: number;
  languageName: string | null;
  word: string;
  timesSeen: number;
  timesTyped: number;
  timesGuessed: number;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
  firstGuessedAt: number | null;
  lastGuessedAt: number | null;
  bestWpm: number | null;
  averageWpm: number | null;
  bestGuessTimeMs: number | null;
  averageGuessTimeMs: number | null;
}

export interface LocalLanguageStatsSnapshot {
  languageId: number;
  languageName: string | null;
  officialWordCount: number | null;
  seenOccurrences: number;
  uniqueWordsSeen: number;
  guessedOccurrences: number;
  uniqueWordsGuessed: number;
  typedOccurrences: number;
  uniqueWordsTyped: number;
  seenCoveragePercent: number | null;
  guessedCoveragePercent: number | null;
}

export interface LocalPlayerStatsSnapshot {
  schemaVersion: typeof LOCAL_PLAYER_STATS_SCHEMA_VERSION;
  version: typeof LOCAL_PLAYER_STATS_VERSION;
  createdAt: number;
  updatedAt: number;
  activity: {
    observedPlayTimeMs: number;
    distinctLobbyIds: number;
    lobbySessions: number;
    uniqueUsernamesSeen: number;
  };
  typing: {
    submittedMessages: number;
    cleanSamples: number;
    averageWpm: number | null;
    bestWpm: number | null;
    corrections: number;
    pasteSubmissions: number;
    autofillSubmissions: number;
    compositionSubmissions: number;
    untrustedSubmissions: number;
  };
  guessing: {
    attempts: number;
    wrongGuesses: number;
    correctGuesses: number;
    firstGuesses: number;
    averageGuessWpm: number | null;
    bestGuessWpm: number | null;
    averageGuessTimeMs: number | null;
    bestGuessTimeMs: number | null;
  };
  skribbl: {
    gamesCompleted: number;
    wins: number;
    winRatePercent: number | null;
    averageFinalScore: number | null;
    bestPublicScore: number | null;
    bestPrivateScore: number | null;
  };
  social: {
    likesGiven: number;
    dislikesGiven: number;
    voteKicksGiven: number;
    hostKicksGiven: number;
  };
  duels: {
    matchesCompleted: number;
    wins: number;
    draws: number;
    winRatePercent: number | null;
    challengesCompleted: number;
    localFastestChallengeMs: Readonly<Record<string, readonly number[]>>;
  };
  languages: readonly LocalLanguageStatsSnapshot[];
}

export interface LocalObservedUsernameSnapshot {
  userKey: string;
  name: string;
  timesSeen: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface LocalPlayerStatsExport {
  exportedAt: number;
  privacy: string;
  snapshot: LocalPlayerStatsSnapshot;
  words: LocalWordStatsSnapshot[];
  usernames: LocalObservedUsernameSnapshot[];
}

export interface LocalStatsTelemetrySource {
  getRecent(): TelemetryEvent[];
  subscribe(listener: (event: TelemetryEvent) => void): () => void;
}

export interface LocalPlayerStatsOptions {
  now?: () => number;
  saveDebounceMs?: number;
  getOfficialWordCount?: (languageId: number) => number | null;
  hasOfficialWord?: (languageId: number, word: string) => boolean;
}

export interface StoredWordStats {
  wordKey: string;
  languageId: number;
  languageName: string | null;
  word: string;
  timesSeen: number;
  timesTyped: number;
  timesGuessed: number;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
  firstGuessedAt: number | null;
  lastGuessedAt: number | null;
  guessWpmSamples: number;
  totalGuessWpm: number;
  bestWpm: number | null;
  guessTimeSamples: number;
  totalGuessTimeMs: number;
  bestGuessTimeMs: number | null;
}

export interface StoredUsernameStats {
  userKey: string;
  name: string;
  timesSeen: number;
  firstSeenAt: number;
  lastSeenAt: number;
  lastLobbySessionId: string | null;
}

export interface StoredLocalStatsSummary {
  schemaVersion: typeof LOCAL_PLAYER_STATS_SCHEMA_VERSION;
  createdAt: number;
  updatedAt: number;
  observedPlayTimeMs: number;
  submittedMessages: number;
  cleanTypingSamples: number;
  totalTypingWpm: number;
  bestTypingWpm: number | null;
  corrections: number;
  pasteSubmissions: number;
  autofillSubmissions: number;
  compositionSubmissions: number;
  untrustedSubmissions: number;
  guessAttempts: number;
  wrongGuesses: number;
  correctGuesses: number;
  firstGuesses: number;
  guessWpmSamples: number;
  totalGuessWpm: number;
  bestGuessWpm: number | null;
  guessTimeSamples: number;
  totalGuessTimeMs: number;
  bestGuessTimeMs: number | null;
  gamesCompleted: number;
  skribblWins: number;
  finalScoreSamples: number;
  totalFinalScore: number;
  bestPublicScore: number | null;
  bestPrivateScore: number | null;
  likesGiven: number;
  dislikesGiven: number;
  voteKicksGiven: number;
  hostKicksGiven: number;
  duelMatchesCompleted: number;
  duelWins: number;
  duelDraws: number;
  challengesCompleted: number;
  localFastestChallengeMs: Record<string, number[]>;
  lobbyIds: string[];
  lobbySessionIds: string[];
  languageNames: Record<string, string | null>;
  recentEventIds: string[];
  recentBoundaryKeys: string[];
  recentDuelMatchIds: string[];
  recentClaimIds: string[];
}

export interface LocalStatsPersistenceSnapshot {
  summary: StoredLocalStatsSummary | null;
  words: StoredWordStats[];
  usernames: StoredUsernameStats[];
}

export interface LocalStatsPersistenceWrite {
  summary: StoredLocalStatsSummary;
  words: readonly StoredWordStats[];
  usernames: readonly StoredUsernameStats[];
}

export interface LocalStatsPersistence {
  load(): Promise<LocalStatsPersistenceSnapshot>;
  save(write: LocalStatsPersistenceWrite): Promise<void>;
  clear(): Promise<void>;
}

interface PendingMeasurement {
  eventId: string;
  occurredAt: number;
  roundSessionId: string | null;
  languageId: number;
  languageName: string | null;
  normalizedMessage: string;
  message: string;
  wpm: number | null;
  clean: boolean;
}

interface PendingCorrectGuess {
  languageId: number;
  languageName: string | null;
  message: string | null;
  wpm: number | null;
  guessTimeMs: number | null;
  occurredAt: number;
  wordCommitted: boolean;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error), { once: true });
  });
}

export class IndexedDbLocalStatsPersistence implements LocalStatsPersistence {
  private databasePromise: Promise<IDBDatabase> | null = null;

  public async load(): Promise<LocalStatsPersistenceSnapshot> {
    const database = await this.open();
    const transaction = database.transaction(['summary', 'words', 'usernames'], 'readonly');
    const done = transactionDone(transaction);
    const [summary, words, usernames] = await Promise.all([
      requestToPromise(transaction.objectStore('summary').get('current')),
      requestToPromise(transaction.objectStore('words').getAll()),
      requestToPromise(transaction.objectStore('usernames').getAll())
    ]);
    await done;
    const summaryRecord = summary as (StoredLocalStatsSummary & { id?: string }) | undefined;
    const cleanSummary = summaryRecord
      ? Object.fromEntries(Object.entries(summaryRecord).filter(([key]) => key !== 'id')) as unknown as StoredLocalStatsSummary
      : null;
    return {
      summary: cleanSummary?.schemaVersion === LOCAL_PLAYER_STATS_SCHEMA_VERSION
        ? structuredClone(cleanSummary)
        : null,
      words: (words as StoredWordStats[]).map(item => structuredClone(item)),
      usernames: (usernames as StoredUsernameStats[]).map(item => structuredClone(item))
    };
  }

  public async save(write: LocalStatsPersistenceWrite): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(['summary', 'words', 'usernames'], 'readwrite');
    transaction.objectStore('summary').put({ id: 'current', ...structuredClone(write.summary) });
    const words = transaction.objectStore('words');
    for (const word of write.words) words.put(structuredClone(word));
    const usernames = transaction.objectStore('usernames');
    for (const username of write.usernames) usernames.put(structuredClone(username));
    await transactionDone(transaction);
  }

  public async clear(): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(['summary', 'words', 'usernames'], 'readwrite');
    transaction.objectStore('summary').clear();
    transaction.objectStore('words').clear();
    transaction.objectStore('usernames').clear();
    await transactionDone(transaction);
  }

  private open(): Promise<IDBDatabase> {
    this.databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('skribblDuelsLocalStats', 1);
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('summary')) {
          database.createObjectStore('summary', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('words')) {
          const words = database.createObjectStore('words', { keyPath: 'wordKey' });
          words.createIndex('languageId', 'languageId', { unique: false });
        }
        if (!database.objectStoreNames.contains('usernames')) {
          database.createObjectStore('usernames', { keyPath: 'userKey' });
        }
      });
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error), { once: true });
      request.addEventListener('blocked', () => {
        reject(new Error('Local-stats IndexedDB upgrade was blocked by another open tab.'));
      }, { once: true });
    });
    return this.databasePromise;
  }
}

export class MemoryLocalStatsPersistence implements LocalStatsPersistence {
  private snapshot: LocalStatsPersistenceSnapshot = { summary: null, words: [], usernames: [] };

  public async load(): Promise<LocalStatsPersistenceSnapshot> {
    return structuredClone(this.snapshot);
  }

  public async save(write: LocalStatsPersistenceWrite): Promise<void> {
    const words = new Map(this.snapshot.words.map(item => [item.wordKey, item]));
    for (const word of write.words) words.set(word.wordKey, structuredClone(word));
    const usernames = new Map(this.snapshot.usernames.map(item => [item.userKey, item]));
    for (const username of write.usernames) usernames.set(username.userKey, structuredClone(username));
    this.snapshot = {
      summary: structuredClone(write.summary),
      words: [...words.values()].map(item => structuredClone(item)),
      usernames: [...usernames.values()].map(item => structuredClone(item))
    };
  }

  public async clear(): Promise<void> {
    this.snapshot = { summary: null, words: [], usernames: [] };
  }
}

function emptySummary(now: number): StoredLocalStatsSummary {
  return {
    schemaVersion: LOCAL_PLAYER_STATS_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    observedPlayTimeMs: 0,
    submittedMessages: 0,
    cleanTypingSamples: 0,
    totalTypingWpm: 0,
    bestTypingWpm: null,
    corrections: 0,
    pasteSubmissions: 0,
    autofillSubmissions: 0,
    compositionSubmissions: 0,
    untrustedSubmissions: 0,
    guessAttempts: 0,
    wrongGuesses: 0,
    correctGuesses: 0,
    firstGuesses: 0,
    guessWpmSamples: 0,
    totalGuessWpm: 0,
    bestGuessWpm: null,
    guessTimeSamples: 0,
    totalGuessTimeMs: 0,
    bestGuessTimeMs: null,
    gamesCompleted: 0,
    skribblWins: 0,
    finalScoreSamples: 0,
    totalFinalScore: 0,
    bestPublicScore: null,
    bestPrivateScore: null,
    likesGiven: 0,
    dislikesGiven: 0,
    voteKicksGiven: 0,
    hostKicksGiven: 0,
    duelMatchesCompleted: 0,
    duelWins: 0,
    duelDraws: 0,
    challengesCompleted: 0,
    localFastestChallengeMs: {},
    lobbyIds: [],
    lobbySessionIds: [],
    languageNames: {},
    recentEventIds: [],
    recentBoundaryKeys: [],
    recentDuelMatchIds: [],
    recentClaimIds: []
  };
}

export function normalizeLocalStatsWord(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

export function localStatsWordMatchKey(value: string): string {
  return normalizeLocalStatsWord(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/\s+/gu, '')
    .replace(/ß/gu, 'ss');
}

export function calculateLocalTypingWpm(characterCount: number, durationMs: number): number | null {
  if (!Number.isFinite(characterCount) || characterCount <= 0
      || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  return Math.round((((characterCount / 5) / (durationMs / 60_000)) + Number.EPSILON) * 100) / 100;
}

function average(total: number, samples: number): number | null {
  return samples > 0 ? Math.round(((total / samples) + Number.EPSILON) * 100) / 100 : null;
}

function percent(numerator: number, denominator: number): number | null {
  return denominator > 0
    ? Math.round((((numerator / denominator) * 100) + Number.EPSILON) * 100) / 100
    : null;
}

function boundedUnique(values: readonly string[], value: string, limit = RECENT_MARKER_LIMIT): string[] {
  const next = values.filter(item => item !== value);
  next.push(value);
  if (next.length > limit) next.splice(0, next.length - limit);
  return next;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function payloadRecord(event: TelemetryEvent): Record<string, unknown> {
  return event.payload as unknown as Record<string, unknown>;
}

export class LocalPlayerStatsService {
  private summary: StoredLocalStatsSummary;
  private readonly words = new Map<string, StoredWordStats>();
  private readonly usernames = new Map<string, StoredUsernameStats>();
  private readonly dirtyWords = new Set<string>();
  private readonly dirtyUsernames = new Set<string>();
  private readonly listeners = new Set<(snapshot: LocalPlayerStatsSnapshot) => void>();
  private readonly pendingMeasurements: PendingMeasurement[] = [];
  private readonly pendingCorrectByRound = new Map<string, PendingCorrectGuess>();
  private readonly now: () => number;
  private readonly saveDebounceMs: number;
  private readonly getOfficialWordCount: (languageId: number) => number | null;
  private readonly hasOfficialWord: (languageId: number, word: string) => boolean;
  private unsubscribeTelemetry: (() => void) | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private started = false;
  private lobbyActive = false;
  private visible = true;
  private lastActivitySampleAt: number;
  private readonly visibilityHandler = (): void => {
    this.sampleActivity();
    this.visible = typeof document === 'undefined' || !document.hidden;
    this.lastActivitySampleAt = this.now();
  };
  private readonly pageHideHandler = (): void => {
    this.sampleActivity();
    void this.flush();
  };

  public constructor(
    private readonly source: LocalStatsTelemetrySource,
    private persistence: LocalStatsPersistence = new IndexedDbLocalStatsPersistence(),
    options: LocalPlayerStatsOptions = {}
  ) {
    this.now = options.now ?? (() => Date.now());
    this.saveDebounceMs = options.saveDebounceMs ?? 750;
    this.getOfficialWordCount = options.getOfficialWordCount ?? (() => null);
    this.hasOfficialWord = options.hasOfficialWord ?? (() => false);
    const now = this.now();
    this.summary = emptySummary(now);
    this.lastActivitySampleAt = now;
  }

  public async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    let stored: LocalStatsPersistenceSnapshot;
    try {
      stored = await this.persistence.load();
    } catch (error) {
      console.warn(
        '[Skribbl Duels Local Stats] IndexedDB unavailable; using memory-only statistics for this runtime.',
        error
      );
      this.persistence = new MemoryLocalStatsPersistence();
      stored = await this.persistence.load();
    }
    if (stored.summary?.schemaVersion === LOCAL_PLAYER_STATS_SCHEMA_VERSION) {
      this.summary = structuredClone(stored.summary);
    }
    for (const word of stored.words) this.words.set(word.wordKey, structuredClone(word));
    for (const username of stored.usernames) this.usernames.set(username.userKey, structuredClone(username));
    for (const event of this.source.getRecent().reverse()) this.process(event, false);
    this.unsubscribeTelemetry = this.source.subscribe(event => this.process(event, true));
    this.visible = typeof document === 'undefined' || !document.hidden;
    this.lastActivitySampleAt = this.now();
    this.activityTimer = setInterval(() => this.sampleActivity(), 15_000);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler, true);
      window.addEventListener('pagehide', this.pageHideHandler, true);
    }
    this.notify();
  }

  public destroy(): void {
    if (!this.started) return;
    this.sampleActivity();
    this.started = false;
    this.unsubscribeTelemetry?.();
    this.unsubscribeTelemetry = null;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    if (this.activityTimer !== null) clearInterval(this.activityTimer);
    this.saveTimer = null;
    this.activityTimer = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler, true);
      window.removeEventListener('pagehide', this.pageHideHandler, true);
    }
    void this.flush();
  }

  public getSnapshot(): LocalPlayerStatsSnapshot {
    this.sampleActivity();
    const languageIds = new Set<number>();
    for (const key of Object.keys(this.summary.languageNames)) languageIds.add(Number(key));
    for (const word of this.words.values()) languageIds.add(word.languageId);
    const languages = [...languageIds]
      .filter(Number.isFinite)
      .sort((left, right) => left - right)
      .map(languageId => this.languageSnapshot(languageId));
    return {
      schemaVersion: LOCAL_PLAYER_STATS_SCHEMA_VERSION,
      version: LOCAL_PLAYER_STATS_VERSION,
      createdAt: this.summary.createdAt,
      updatedAt: this.summary.updatedAt,
      activity: {
        observedPlayTimeMs: Math.round(this.summary.observedPlayTimeMs),
        distinctLobbyIds: this.summary.lobbyIds.length,
        lobbySessions: this.summary.lobbySessionIds.length,
        uniqueUsernamesSeen: this.usernames.size
      },
      typing: {
        submittedMessages: this.summary.submittedMessages,
        cleanSamples: this.summary.cleanTypingSamples,
        averageWpm: average(this.summary.totalTypingWpm, this.summary.cleanTypingSamples),
        bestWpm: this.summary.bestTypingWpm,
        corrections: this.summary.corrections,
        pasteSubmissions: this.summary.pasteSubmissions,
        autofillSubmissions: this.summary.autofillSubmissions,
        compositionSubmissions: this.summary.compositionSubmissions,
        untrustedSubmissions: this.summary.untrustedSubmissions
      },
      guessing: {
        attempts: this.summary.guessAttempts,
        wrongGuesses: this.summary.wrongGuesses,
        correctGuesses: this.summary.correctGuesses,
        firstGuesses: this.summary.firstGuesses,
        averageGuessWpm: average(this.summary.totalGuessWpm, this.summary.guessWpmSamples),
        bestGuessWpm: this.summary.bestGuessWpm,
        averageGuessTimeMs: average(this.summary.totalGuessTimeMs, this.summary.guessTimeSamples),
        bestGuessTimeMs: this.summary.bestGuessTimeMs
      },
      skribbl: {
        gamesCompleted: this.summary.gamesCompleted,
        wins: this.summary.skribblWins,
        winRatePercent: percent(this.summary.skribblWins, this.summary.gamesCompleted),
        averageFinalScore: average(this.summary.totalFinalScore, this.summary.finalScoreSamples),
        bestPublicScore: this.summary.bestPublicScore,
        bestPrivateScore: this.summary.bestPrivateScore
      },
      social: {
        likesGiven: this.summary.likesGiven,
        dislikesGiven: this.summary.dislikesGiven,
        voteKicksGiven: this.summary.voteKicksGiven,
        hostKicksGiven: this.summary.hostKicksGiven
      },
      duels: {
        matchesCompleted: this.summary.duelMatchesCompleted,
        wins: this.summary.duelWins,
        draws: this.summary.duelDraws,
        winRatePercent: percent(this.summary.duelWins, this.summary.duelMatchesCompleted),
        challengesCompleted: this.summary.challengesCompleted,
        localFastestChallengeMs: structuredClone(this.summary.localFastestChallengeMs)
      },
      languages
    };
  }

  public getWordStats(query: LocalWordStatsQuery = {}): LocalWordStatsSnapshot[] {
    const items = [...this.words.values()]
      .filter(item => query.languageId === undefined || item.languageId === query.languageId)
      .map(item => this.wordSnapshot(item));
    const sort = query.sort ?? 'occurrence';
    const defaultDirection = sort === 'alphabetical' || sort.includes('time')
      ? 'ascending'
      : 'descending';
    const direction = query.direction ?? defaultDirection;
    const value = (item: LocalWordStatsSnapshot): number | string => {
      switch (sort) {
        case 'occurrence': return item.timesSeen;
        case 'guessed': return item.timesGuessed;
        case 'best-wpm': return item.bestWpm ?? -1;
        case 'average-wpm': return item.averageWpm ?? -1;
        case 'best-guess-time': return item.bestGuessTimeMs ?? Number.POSITIVE_INFINITY;
        case 'average-guess-time': return item.averageGuessTimeMs ?? Number.POSITIVE_INFINITY;
        case 'last-seen': return item.lastSeenAt ?? 0;
        case 'alphabetical': return item.word.toLocaleLowerCase();
      }
    };
    items.sort((left, right) => {
      const a = value(left);
      const b = value(right);
      const compared = typeof a === 'string' && typeof b === 'string'
        ? a.localeCompare(b)
        : Number(a) - Number(b);
      const primary = direction === 'ascending' ? compared : -compared;
      return primary || left.word.localeCompare(right.word);
    });
    const limit = query.limit === undefined
      ? items.length
      : Math.max(0, Math.min(items.length, Math.floor(query.limit)));
    return items.slice(0, limit);
  }

  public getObservedUsernames(): LocalObservedUsernameSnapshot[] {
    return [...this.usernames.values()]
      .map(user => ({
        userKey: user.userKey,
        name: user.name,
        timesSeen: user.timesSeen,
        firstSeenAt: user.firstSeenAt,
        lastSeenAt: user.lastSeenAt
      }))
      .sort((left, right) => right.timesSeen - left.timesSeen || left.name.localeCompare(right.name));
  }

  public export(): LocalPlayerStatsExport {
    return {
      exportedAt: this.now(),
      privacy: 'Local-only export. It contains observed Skribbl usernames and word history; share it deliberately.',
      snapshot: this.getSnapshot(),
      words: this.getWordStats({ sort: 'alphabetical' }),
      usernames: this.getObservedUsernames()
    };
  }

  public subscribe(listener: (snapshot: LocalPlayerStatsSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  public async clear(): Promise<void> {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await this.writeChain.catch(() => undefined);
    await this.persistence.clear();
    this.summary = emptySummary(this.now());
    this.words.clear();
    this.usernames.clear();
    this.dirtyWords.clear();
    this.dirtyUsernames.clear();
    this.pendingMeasurements.length = 0;
    this.pendingCorrectByRound.clear();
    this.lobbyActive = false;
    this.lastActivitySampleAt = this.now();
    this.notify();
  }

  public flush(): Promise<void> {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const words = [...this.dirtyWords]
      .map(key => this.words.get(key))
      .filter((item): item is StoredWordStats => item !== undefined)
      .map(item => structuredClone(item));
    const usernames = [...this.dirtyUsernames]
      .map(key => this.usernames.get(key))
      .filter((item): item is StoredUsernameStats => item !== undefined)
      .map(item => structuredClone(item));
    this.dirtyWords.clear();
    this.dirtyUsernames.clear();
    const write: LocalStatsPersistenceWrite = {
      summary: structuredClone(this.summary),
      words,
      usernames
    };
    const operation = this.writeChain.then(() => this.persistence.save(write));
    this.writeChain = operation.catch(error => {
      console.warn('[Skribbl Duels Local Stats] Persistence failed', error);
    });
    return operation;
  }

  public recordDuelConclusion(
    matchId: string,
    outcome: 'win' | 'loss' | 'draw',
    occurredAt = this.now()
  ): void {
    if (!matchId || this.summary.recentDuelMatchIds.includes(matchId)) return;
    this.summary.recentDuelMatchIds = boundedUnique(this.summary.recentDuelMatchIds, matchId);
    this.summary.duelMatchesCompleted += 1;
    if (outcome === 'win') this.summary.duelWins += 1;
    if (outcome === 'draw') this.summary.duelDraws += 1;
    this.changed(occurredAt);
  }

  public recordChallengeCompletion(
    claimId: string,
    challengeId: string,
    occurredAt: number,
    activatedAt: number | null
  ): void {
    if (!claimId || this.summary.recentClaimIds.includes(claimId)) return;
    this.summary.recentClaimIds = boundedUnique(this.summary.recentClaimIds, claimId);
    this.summary.challengesCompleted += 1;
    if (activatedAt !== null && occurredAt >= activatedAt) {
      const elapsed = Math.round(occurredAt - activatedAt);
      const current = this.summary.localFastestChallengeMs[challengeId] ?? [];
      this.summary.localFastestChallengeMs[challengeId] = [...current, elapsed]
        .sort((left, right) => left - right)
        .slice(0, 3);
    }
    this.changed(occurredAt);
  }

  private process(event: TelemetryEvent, notify: boolean): void {
    if (this.summary.recentEventIds.includes(event.eventId)) return;
    this.summary.recentEventIds = boundedUnique(this.summary.recentEventIds, event.eventId);
    const languageId = event.context.languageId ?? -1;
    if (event.context.languageName !== null) {
      this.summary.languageNames[String(languageId)] = event.context.languageName;
    }
    let mutated = false;
    switch (event.type) {
      case 'LOBBY_HYDRATED':
        mutated = this.observeHydration(event);
        this.setLobbyActive(true);
        break;
      case 'LOBBY_CHANGED': {
        const lobbyId = event.payload.lobbyId;
        this.setLobbyActive(lobbyId !== null);
        mutated = true;
        break;
      }
      case 'TYPO_LOBBY_LEFT':
        this.setLobbyActive(false);
        mutated = true;
        break;
      case 'PLAYER_JOINED':
        mutated = this.observeJoinedPlayer(event);
        break;
      case 'PLAYER_RENAMED':
        if (event.actor && !event.actor.isSelf && event.actor.name) {
          mutated = this.observeUsername(event.actor.name, event.context.lobbySessionId, event.occurredAt);
        }
        break;
      case 'TEXT_INPUT_MEASURED':
        this.observeMeasurement(event);
        mutated = true;
        break;
      case 'GUESS_SUBMITTED':
        this.observeGuessSubmission(event);
        mutated = true;
        break;
      case 'WRONG_GUESS':
        if (event.actor?.isSelf || event.payload.playerId === event.context.meId) {
          this.summary.wrongGuesses += 1;
          mutated = true;
        }
        break;
      case 'CORRECT_GUESS':
        mutated = this.observeCorrectGuess(event);
        break;
      case 'WORD_REVEALED':
        mutated = this.observeWordReveal(event);
        break;
      case 'SCORE_CHANGED':
        mutated = this.observeScore(event);
        break;
      case 'GAME_ENDED':
        mutated = this.observeGameEnded(event);
        break;
      case 'VOTE_SUBMITTED': {
        const vote = finiteNumber(payloadRecord(event).vote);
        if (vote === 1) this.summary.likesGiven += 1;
        if (vote === -1) this.summary.dislikesGiven += 1;
        mutated = vote === 1 || vote === -1;
        break;
      }
      case 'PLAYER_VOTEKICK_SUBMITTED':
        this.summary.voteKicksGiven += 1;
        mutated = true;
        break;
      case 'HOST_KICK_SUBMITTED':
        this.summary.hostKicksGiven += 1;
        mutated = true;
        break;
    }
    if (!mutated) return;
    this.changed(event.occurredAt, notify);
  }

  private observeHydration(event: TelemetryEventOf<'LOBBY_HYDRATED'>): boolean {
    const lobbyId = event.payload.lobbyId;
    const lobbySessionId = event.context.lobbySessionId;
    if (lobbyId) this.summary.lobbyIds = boundedUnique(this.summary.lobbyIds, lobbyId, 20_000);
    if (lobbySessionId) {
      this.summary.lobbySessionIds = boundedUnique(this.summary.lobbySessionIds, lobbySessionId, 20_000);
    }
    for (const player of event.payload.players ?? []) {
      if (player.id === event.context.meId) continue;
      this.observeUsername(player.name, lobbySessionId, event.occurredAt);
    }
    return true;
  }

  private observeJoinedPlayer(event: TelemetryEventOf<'PLAYER_JOINED'>): boolean {
    const user = event.payload.user;
    if (!user || user.id === event.context.meId) return false;
    return this.observeUsername(user.name, event.context.lobbySessionId, event.occurredAt);
  }

  private observeUsername(name: string, lobbySessionId: string | null, occurredAt: number): boolean {
    const normalized = normalizeLocalStatsWord(name);
    if (!normalized) return false;
    const userKey = normalized;
    const current = this.usernames.get(userKey);
    const sameSession = current?.lastLobbySessionId === lobbySessionId && lobbySessionId !== null;
    const next: StoredUsernameStats = current
      ? {
          ...current,
          name,
          timesSeen: current.timesSeen + (sameSession ? 0 : 1),
          lastSeenAt: Math.max(current.lastSeenAt, occurredAt),
          lastLobbySessionId: lobbySessionId
        }
      : {
          userKey,
          name,
          timesSeen: 1,
          firstSeenAt: occurredAt,
          lastSeenAt: occurredAt,
          lastLobbySessionId: lobbySessionId
        };
    this.usernames.set(userKey, next);
    this.dirtyUsernames.add(userKey);
    return true;
  }

  private observeMeasurement(event: TelemetryEventOf<'TEXT_INPUT_MEASURED'>): void {
    const payload = event.payload;
    const wpm = calculateLocalTypingWpm(payload.characterCount, payload.durationMs);
    const clean = payload.trustedInput
      && !payload.pasteDetected
      && !payload.autofillDetected
      && payload.durationMs >= MIN_VALID_TYPING_MS
      && payload.durationMs <= MAX_VALID_TYPING_MS
      && wpm !== null
      && wpm <= MAX_VALID_WPM;
    this.summary.submittedMessages += 1;
    this.summary.corrections += payload.correctionCount;
    if (payload.pasteDetected) this.summary.pasteSubmissions += 1;
    if (payload.autofillDetected) this.summary.autofillSubmissions += 1;
    if (payload.compositionUsed) this.summary.compositionSubmissions += 1;
    if (!payload.trustedInput) this.summary.untrustedSubmissions += 1;
    if (clean && wpm !== null) {
      this.summary.cleanTypingSamples += 1;
      this.summary.totalTypingWpm += wpm;
      this.summary.bestTypingWpm = Math.max(this.summary.bestTypingWpm ?? 0, wpm);
    }
    this.pendingMeasurements.push({
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      roundSessionId: event.context.roundSessionId,
      languageId: event.context.languageId ?? -1,
      languageName: event.context.languageName,
      normalizedMessage: localStatsWordMatchKey(payload.message),
      message: payload.message,
      wpm,
      clean
    });
    while (this.pendingMeasurements.length > 100) this.pendingMeasurements.shift();
  }

  private observeGuessSubmission(event: TelemetryEventOf<'GUESS_SUBMITTED'>): void {
    this.summary.guessAttempts += 1;
    const message = event.payload.message?.trim() ?? '';
    const normalized = localStatsWordMatchKey(message);
    let measurement: PendingMeasurement | null = null;
    for (let index = this.pendingMeasurements.length - 1; index >= 0; index -= 1) {
      const candidate = this.pendingMeasurements[index];
      if (!candidate) continue;
      if (event.occurredAt - candidate.occurredAt > 5_000) break;
      if (candidate.normalizedMessage === normalized
          && candidate.roundSessionId === event.context.roundSessionId) {
        measurement = candidate;
        this.pendingMeasurements.splice(index, 1);
        break;
      }
    }
    const languageId = event.context.languageId ?? measurement?.languageId ?? -1;
    const languageName = event.context.languageName ?? measurement?.languageName ?? null;
    if (message && this.hasOfficialWord(languageId, message)) {
      this.updateWord(languageId, languageName, message, event.occurredAt, word => {
        word.timesTyped += 1;
      });
    }
    const roundKey = event.context.roundSessionId ?? `event:${event.eventId}`;
    this.pendingCorrectByRound.set(roundKey, {
      languageId,
      languageName,
      message: message || measurement?.message || null,
      wpm: measurement?.clean === true ? measurement.wpm : null,
      guessTimeMs: null,
      occurredAt: event.occurredAt,
      wordCommitted: false
    });
  }

  private observeCorrectGuess(event: TelemetryEventOf<'CORRECT_GUESS'>): boolean {
    if (!event.actor?.isSelf && event.payload.playerId !== event.context.meId) return false;
    const roundKey = event.context.roundSessionId ?? `correct:${event.eventId}`;
    const boundary = `correct:${roundKey}:${event.payload.playerId}`;
    if (this.summary.recentBoundaryKeys.includes(boundary)) return false;
    this.summary.recentBoundaryKeys = boundedUnique(this.summary.recentBoundaryKeys, boundary);
    const pending = this.pendingCorrectByRound.get(roundKey) ?? {
      languageId: event.context.languageId ?? -1,
      languageName: event.context.languageName,
      message: null,
      wpm: null,
      guessTimeMs: null,
      occurredAt: event.occurredAt,
      wordCommitted: false
    };
    const guessTimeMs = event.payload.elapsedMs !== null && event.payload.elapsedMs >= 0
      ? event.payload.elapsedMs
      : null;
    pending.guessTimeMs = guessTimeMs;
    pending.occurredAt = event.occurredAt;
    this.summary.correctGuesses += 1;
    if (event.payload.isFirstGuesser) this.summary.firstGuesses += 1;
    if (pending.wpm !== null) {
      this.summary.guessWpmSamples += 1;
      this.summary.totalGuessWpm += pending.wpm;
      this.summary.bestGuessWpm = Math.max(this.summary.bestGuessWpm ?? 0, pending.wpm);
    }
    if (guessTimeMs !== null) {
      this.summary.guessTimeSamples += 1;
      this.summary.totalGuessTimeMs += guessTimeMs;
      this.summary.bestGuessTimeMs = Math.min(this.summary.bestGuessTimeMs ?? guessTimeMs, guessTimeMs);
    }
    const word = event.payload.word?.trim() ?? '';
    if (word) {
      this.recordGuessedWord(pending, word);
      pending.wordCommitted = true;
    }
    this.pendingCorrectByRound.set(roundKey, pending);
    return true;
  }

  private observeWordReveal(event: TelemetryEventOf<'WORD_REVEALED'>): boolean {
    const word = event.payload.word?.trim() ?? '';
    if (!word) return false;
    const roundKey = event.context.roundSessionId ?? `reveal:${event.eventId}`;
    const boundary = `reveal:${roundKey}:${localStatsWordMatchKey(word)}`;
    if (this.summary.recentBoundaryKeys.includes(boundary)) return false;
    this.summary.recentBoundaryKeys = boundedUnique(this.summary.recentBoundaryKeys, boundary);
    const languageId = event.context.languageId ?? -1;
    this.updateWord(languageId, event.context.languageName, word, event.occurredAt, item => {
      item.timesSeen += 1;
      item.firstSeenAt ??= event.occurredAt;
      item.lastSeenAt = event.occurredAt;
    });
    const pending = this.pendingCorrectByRound.get(roundKey);
    if (pending && !pending.wordCommitted) this.recordGuessedWord(pending, word);
    this.pendingCorrectByRound.delete(roundKey);
    return true;
  }

  private recordGuessedWord(pending: PendingCorrectGuess, word: string): void {
    this.updateWord(
      pending.languageId,
      pending.languageName,
      word,
      pending.occurredAt,
      item => {
        item.timesGuessed += 1;
        item.firstGuessedAt ??= pending.occurredAt;
        item.lastGuessedAt = pending.occurredAt;
        if (pending.wpm !== null) {
          item.guessWpmSamples += 1;
          item.totalGuessWpm += pending.wpm;
          item.bestWpm = Math.max(item.bestWpm ?? 0, pending.wpm);
        }
        if (pending.guessTimeMs !== null) {
          item.guessTimeSamples += 1;
          item.totalGuessTimeMs += pending.guessTimeMs;
          item.bestGuessTimeMs = Math.min(
            item.bestGuessTimeMs ?? pending.guessTimeMs,
            pending.guessTimeMs
          );
        }
      }
    );
  }

  private observeScore(event: TelemetryEventOf<'SCORE_CHANGED'>): boolean {
    if (!event.actor?.isSelf && event.payload.playerId !== event.context.meId) return false;
    const score = event.payload.totalScore;
    if (score === null || score < 0) return false;
    if (event.context.lobbyType === 0) {
      this.summary.bestPublicScore = Math.max(this.summary.bestPublicScore ?? 0, score);
    } else if (event.context.lobbyType === 1) {
      this.summary.bestPrivateScore = Math.max(this.summary.bestPrivateScore ?? 0, score);
    }
    return true;
  }

  private observeGameEnded(event: TelemetryEventOf<'GAME_ENDED'>): boolean {
    const gameId = event.context.gameSessionId;
    const boundary = `game:${gameId ?? event.eventId}`;
    if (this.summary.recentBoundaryKeys.includes(boundary)) return false;
    const scores = event.payload.finalScores ?? [];
    const self = scores.find(item => item.playerId === event.context.meId);
    if (!self) return false;
    this.summary.recentBoundaryKeys = boundedUnique(this.summary.recentBoundaryKeys, boundary);
    this.summary.gamesCompleted += 1;
    this.summary.finalScoreSamples += 1;
    this.summary.totalFinalScore += self.totalScore;
    if (event.context.lobbyType === 0) {
      this.summary.bestPublicScore = Math.max(this.summary.bestPublicScore ?? 0, self.totalScore);
    } else if (event.context.lobbyType === 1) {
      this.summary.bestPrivateScore = Math.max(this.summary.bestPrivateScore ?? 0, self.totalScore);
    }
    const highest = Math.max(...scores.map(item => item.totalScore));
    const winners = scores.filter(item => item.totalScore === highest);
    if (highest > 0 && winners.length === 1 && winners[0]?.playerId === event.context.meId) {
      this.summary.skribblWins += 1;
    }
    return true;
  }

  private updateWord(
    languageId: number,
    languageName: string | null,
    word: string,
    occurredAt: number,
    mutate: (item: StoredWordStats) => void
  ): void {
    const normalized = normalizeLocalStatsWord(word);
    if (!normalized) return;
    const wordKey = `${languageId}:${localStatsWordMatchKey(normalized)}`;
    const current = this.words.get(wordKey) ?? {
      wordKey,
      languageId,
      languageName,
      word: word.trim(),
      timesSeen: 0,
      timesTyped: 0,
      timesGuessed: 0,
      firstSeenAt: null,
      lastSeenAt: null,
      firstGuessedAt: null,
      lastGuessedAt: null,
      guessWpmSamples: 0,
      totalGuessWpm: 0,
      bestWpm: null,
      guessTimeSamples: 0,
      totalGuessTimeMs: 0,
      bestGuessTimeMs: null
    } satisfies StoredWordStats;
    if (languageName !== null) current.languageName = languageName;
    current.word = word.trim();
    mutate(current);
    this.words.set(wordKey, current);
    this.dirtyWords.add(wordKey);
    this.summary.languageNames[String(languageId)] = languageName;
    this.summary.updatedAt = Math.max(this.summary.updatedAt, occurredAt);
  }

  private wordSnapshot(item: StoredWordStats): LocalWordStatsSnapshot {
    return {
      wordKey: item.wordKey,
      languageId: item.languageId,
      languageName: item.languageName,
      word: item.word,
      timesSeen: item.timesSeen,
      timesTyped: item.timesTyped,
      timesGuessed: item.timesGuessed,
      firstSeenAt: item.firstSeenAt,
      lastSeenAt: item.lastSeenAt,
      firstGuessedAt: item.firstGuessedAt,
      lastGuessedAt: item.lastGuessedAt,
      bestWpm: item.bestWpm,
      averageWpm: average(item.totalGuessWpm, item.guessWpmSamples),
      bestGuessTimeMs: item.bestGuessTimeMs,
      averageGuessTimeMs: average(item.totalGuessTimeMs, item.guessTimeSamples)
    };
  }

  private languageSnapshot(languageId: number): LocalLanguageStatsSnapshot {
    const words = [...this.words.values()].filter(item => item.languageId === languageId);
    const officialWordCount = this.getOfficialWordCount(languageId);
    const uniqueWordsSeen = words.filter(item => item.timesSeen > 0).length;
    const uniqueWordsGuessed = words.filter(item => item.timesGuessed > 0).length;
    const uniqueWordsTyped = words.filter(item => item.timesTyped > 0).length;
    return {
      languageId,
      languageName: this.summary.languageNames[String(languageId)] ?? words[0]?.languageName ?? null,
      officialWordCount,
      seenOccurrences: words.reduce((sum, item) => sum + item.timesSeen, 0),
      uniqueWordsSeen,
      guessedOccurrences: words.reduce((sum, item) => sum + item.timesGuessed, 0),
      uniqueWordsGuessed,
      typedOccurrences: words.reduce((sum, item) => sum + item.timesTyped, 0),
      uniqueWordsTyped,
      seenCoveragePercent: officialWordCount === null ? null : percent(uniqueWordsSeen, officialWordCount),
      guessedCoveragePercent: officialWordCount === null ? null : percent(uniqueWordsGuessed, officialWordCount)
    };
  }

  private setLobbyActive(active: boolean): void {
    this.sampleActivity();
    this.lobbyActive = active;
    this.lastActivitySampleAt = this.now();
  }

  private sampleActivity(): void {
    const now = this.now();
    const elapsed = Math.max(0, now - this.lastActivitySampleAt);
    this.lastActivitySampleAt = now;
    if (!this.lobbyActive || !this.visible || elapsed === 0) return;
    // Long suspended-tab gaps are not "observed" play time.
    this.summary.observedPlayTimeMs += Math.min(elapsed, 60_000);
    this.changed(now, false);
  }

  private changed(occurredAt: number, notify = true): void {
    this.summary.updatedAt = Math.max(this.summary.updatedAt, occurredAt);
    this.scheduleFlush();
    if (notify) this.notify();
  }

  private scheduleFlush(): void {
    if (this.saveTimer !== null || !this.started) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, this.saveDebounceMs);
  }

  private notify(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(structuredClone(snapshot));
  }
}
