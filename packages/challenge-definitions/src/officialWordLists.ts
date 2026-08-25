export type OfficialWordListState = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

export interface OfficialWordLengthMetrics {
  wordCount: number;
  minimumLength: number | null;
  maximumLength: number | null;
  shortThreshold: number | null;
  longThreshold: number | null;
  shortQualifyingRate: number;
  longQualifyingRate: number;
  shortRequiredCount: number;
  longRequiredCount: number;
  spacedWordThreshold: number | null;
}

export interface OfficialWordListStatus {
  languageId: number;
  languageName: string | null;
  state: OfficialWordListState;
  wordCount: number;
  source: string | null;
  error: string | null;
  warning: string | null;
  fromCache: boolean;
  loadedAt: number | null;
  metrics: OfficialWordLengthMetrics;
}

interface CachedWordList {
  version: 2;
  languageName: string;
  words: string[];
  source: string;
  savedAt: number;
}

interface XmlHttpResponseLike {
  status: number;
  responseText: string;
}

interface XmlHttpRequestDetailsLike {
  method: 'GET';
  url: string;
  onload(response: XmlHttpResponseLike): void;
  onerror(error: unknown): void;
  ontimeout(error: unknown): void;
}

type XmlHttpRequester = (details: XmlHttpRequestDetailsLike) => void;

declare const GM: { xmlHttpRequest?: XmlHttpRequester } | undefined;
declare const GM_xmlhttpRequest: XmlHttpRequester | undefined;

const LIST_BASE = 'https://raw.githubusercontent.com/pospos21/words/main/lists/';
const CACHE_PREFIX = 'skribblDuelsOfficialWordListV2:';
export const SKRIBBL_LANGUAGES = [
  [0, 'English'],
  [1, 'German'],
  [2, 'Bulgarian'],
  [3, 'Czech'],
  [4, 'Danish'],
  [5, 'Dutch'],
  [6, 'Finnish'],
  [7, 'French'],
  [8, 'Estonian'],
  [9, 'Greek'],
  [10, 'Hebrew'],
  [11, 'Hungarian'],
  [12, 'Italian'],
  [13, 'Japanese'],
  [14, 'Korean'],
  [15, 'Latvian'],
  [16, 'Macedonian'],
  [17, 'Norwegian'],
  [18, 'Portuguese'],
  [19, 'Polish'],
  [20, 'Romanian'],
  [21, 'Russian'],
  [22, 'Serbian'],
  [23, 'Slovakian'],
  [24, 'Spanish'],
  [25, 'Swedish'],
  [26, 'Tagalog'],
  [27, 'Turkish']
] as const;

export const SKRIBBL_LANGUAGE_NAME_BY_ID: Readonly<Record<number, string>> =
  Object.freeze(Object.fromEntries(SKRIBBL_LANGUAGES));

const lists = new Map<number, Set<string>>();
const originalWords = new Map<number, string[]>();
const statuses = new Map<number, OfficialWordListStatus>();
const pending = new Map<number, Promise<OfficialWordListStatus>>();
const statusListeners = new Set<(status: OfficialWordListStatus) => void>();

export function normalizeOfficialWord(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase();
}

export function getOfficialWordLetterLength(value: string): number {
  return Array.from(normalizeOfficialWord(value).replace(/[\s-]+/gu, '')).length;
}

export function getOfficialWordComponentCount(value: string): number {
  const normalized = normalizeOfficialWord(value);
  return normalized ? normalized.split(/\s+/u).filter(Boolean).length : 0;
}

function emptyMetrics(): OfficialWordLengthMetrics {
  return {
    wordCount: 0,
    minimumLength: null,
    maximumLength: null,
    shortThreshold: null,
    longThreshold: null,
    shortQualifyingRate: 0,
    longQualifyingRate: 0,
    shortRequiredCount: 1,
    longRequiredCount: 1,
    spacedWordThreshold: null
  };
}

function quantile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index] ?? null;
}

function calculateMetrics(words: readonly string[]): OfficialWordLengthMetrics {
  const lengths = words
    .map(getOfficialWordLetterLength)
    .filter(length => length > 0)
    .sort((a, b) => a - b);
  const shortThreshold = quantile(lengths, 0.05);
  const longThreshold = quantile(lengths, 0.9);
  const shortQualifyingRate = shortThreshold === null || lengths.length === 0
    ? 0
    : lengths.filter(length => length <= shortThreshold).length / lengths.length;
  const longQualifyingRate = longThreshold === null || lengths.length === 0
    ? 0
    : lengths.filter(length => length >= longThreshold).length / lengths.length;
  const spacedComponents = words
    .map(getOfficialWordComponentCount)
    .filter(count => count >= 2)
    .sort((a, b) => a - b);
  return {
    wordCount: words.length,
    minimumLength: lengths[0] ?? null,
    maximumLength: lengths[lengths.length - 1] ?? null,
    shortThreshold,
    longThreshold,
    shortQualifyingRate,
    longQualifyingRate,
    // Ties at the percentile boundaries differ substantially between languages.
    // Scale the number of required first guesses to the real qualifying share.
    shortRequiredCount: Math.max(2, Math.min(3, Math.ceil(shortQualifyingRate / 0.05))),
    longRequiredCount: Math.max(1, Math.min(3, Math.ceil(longQualifyingRate / 0.1))),
    // A high quantile among actual multi-word entries avoids disadvantaging
    // languages whose lists contain mostly two-part compounds.
    spacedWordThreshold: quantile(spacedComponents, 0.75)
  };
}

function statusKey(languageName: string): string {
  return `${CACHE_PREFIX}${languageName}`;
}

function sourceUrl(languageName: string): string {
  return `${LIST_BASE}${encodeURIComponent(languageName)}_List_Final.json`;
}

function notify(status: OfficialWordListStatus): void {
  statuses.set(status.languageId, status);
  for (const listener of statusListeners) listener(structuredClone(status));
}

function parseWords(value: unknown): string[] {
  const entries = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null
      ? Object.values(value as Record<string, unknown>)
      : [];

  const words: string[] = [];
  for (const entry of entries) {
    if (typeof entry === 'string') {
      words.push(entry);
      continue;
    }
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as { Word?: unknown; word?: unknown };
    const word = typeof record.Word === 'string'
      ? record.Word
      : typeof record.word === 'string'
        ? record.word
        : null;
    if (word) words.push(word);
  }
  return words;
}

function install(
  languageId: number,
  languageName: string,
  words: readonly string[],
  source: string,
  fromCache: boolean
): OfficialWordListStatus {
  const canonical = [...new Set(words.map(word => word.trim()).filter(Boolean))];
  const normalized = new Set(canonical.map(normalizeOfficialWord).filter(Boolean));
  lists.set(languageId, normalized);
  originalWords.set(languageId, canonical);
  const status: OfficialWordListStatus = {
    languageId,
    languageName,
    state: 'ready',
    wordCount: normalized.size,
    source,
    error: null,
    warning: null,
    fromCache,
    loadedAt: Date.now(),
    metrics: calculateMetrics(canonical)
  };
  notify(status);
  return status;
}

function resolveLanguageName(languageId: number, languageName?: string | null): string | null {
  const canonical = SKRIBBL_LANGUAGE_NAME_BY_ID[languageId];
  if (canonical) return canonical;
  const candidate = languageName?.trim();
  return candidate || statuses.get(languageId)?.languageName || null;
}

function gmRequester(): XmlHttpRequester | null {
  try {
    if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') return GM.xmlHttpRequest.bind(GM);
  } catch {
    // Page-context builds normally use fetch; this branch is optional for userscript managers.
  }
  try {
    if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest;
  } catch {
    // Ignore unavailable legacy API.
  }
  return null;
}

async function requestJson(url: string): Promise<unknown> {
  const request = gmRequester();
  if (request) {
    const responseText = await new Promise<string>((resolve, reject) => {
      request({
        method: 'GET',
        url,
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`HTTP ${response.status}`));
            return;
          }
          resolve(response.responseText);
        },
        onerror: reject,
        ontimeout: reject
      });
    });
    return JSON.parse(responseText);
  }

  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export function setOfficialWordListForTesting(
  languageId: number,
  words: readonly string[],
  languageName = SKRIBBL_LANGUAGE_NAME_BY_ID[languageId] ?? `Test-${languageId}`
): void {
  install(languageId, languageName, words, 'test-fixture', false);
}

export function hasOfficialWord(languageId: number | null, value: string | null): boolean {
  if (languageId === null || value === null) return false;
  return lists.get(languageId)?.has(normalizeOfficialWord(value)) ?? false;
}

export function getOfficialWords(languageId: number): readonly string[] {
  return [...(originalWords.get(languageId) ?? [])];
}

export function getOfficialWordLengthMetrics(languageId: number): OfficialWordLengthMetrics {
  return structuredClone(statuses.get(languageId)?.metrics ?? emptyMetrics());
}

export function isOfficialWordListReady(languageId: number | null): boolean {
  return languageId !== null && statuses.get(languageId)?.state === 'ready';
}

export function getOfficialWordListStatus(
  languageId: number,
  languageName?: string | null
): OfficialWordListStatus {
  const existing = statuses.get(languageId);
  if (existing) return structuredClone(existing);
  const resolvedName = resolveLanguageName(languageId, languageName);
  return {
    languageId,
    languageName: resolvedName,
    state: resolvedName ? 'idle' : 'unsupported',
    wordCount: 0,
    source: resolvedName ? sourceUrl(resolvedName) : null,
    error: null,
    warning: resolvedName
      ? null
      : 'No selectable Skribbl language name is available for this lobby. Word-list challenges must be disabled.',
    fromCache: false,
    loadedAt: null,
    metrics: emptyMetrics()
  };
}

export function subscribeOfficialWordListStatus(
  listener: (status: OfficialWordListStatus) => void
): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export async function loadOfficialWordList(
  languageId: number,
  languageName?: string | null,
  force = false
): Promise<OfficialWordListStatus> {
  const resolvedName = resolveLanguageName(languageId, languageName);
  if (!resolvedName) {
    const unsupported: OfficialWordListStatus = {
      languageId,
      languageName: null,
      state: 'unsupported',
      wordCount: 0,
      source: null,
      error: null,
      warning: 'This lobby language is not selectable or has no known name. Mogged, Smol words and Big word are unavailable.',
      fromCache: false,
      loadedAt: null,
      metrics: emptyMetrics()
    };
    notify(unsupported);
    return structuredClone(unsupported);
  }

  const current = statuses.get(languageId);
  if (!force && current?.state === 'ready' && current.languageName === resolvedName) {
    return structuredClone(current);
  }
  const existing = pending.get(languageId);
  if (existing) return existing;

  const url = sourceUrl(resolvedName);
  const task = (async () => {
    notify({
      languageId,
      languageName: resolvedName,
      state: 'loading',
      wordCount: 0,
      source: url,
      error: null,
      warning: null,
      fromCache: false,
      loadedAt: null,
      metrics: emptyMetrics()
    });

    if (!force) {
      try {
        const cached = localStorage.getItem(statusKey(resolvedName));
        if (cached) {
          const parsed = JSON.parse(cached) as Partial<CachedWordList>;
          if (parsed.version === 2 && parsed.languageName === resolvedName && Array.isArray(parsed.words)) {
            const cachedWords = parsed.words.filter((word): word is string => typeof word === 'string');
            if (cachedWords.length > 0) {
              return install(languageId, resolvedName, cachedWords, parsed.source ?? url, true);
            }
          }
        }
      } catch {
        // Ignore unavailable or malformed local cache.
      }
    }

    try {
      const words = parseWords(await requestJson(url));
      if (words.length === 0) throw new Error('The downloaded language file contained no Word entries.');
      const status = install(languageId, resolvedName, words, url, false);
      try {
        const cached: CachedWordList = {
          version: 2,
          languageName: resolvedName,
          words,
          source: url,
          savedAt: Date.now()
        };
        localStorage.setItem(statusKey(resolvedName), JSON.stringify(cached));
      } catch {
        // The loaded in-memory list remains usable if storage is unavailable.
      }
      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed: OfficialWordListStatus = {
        languageId,
        languageName: resolvedName,
        state: message.includes('HTTP 404') ? 'unsupported' : 'error',
        wordCount: 0,
        source: url,
        error: message,
        warning: message.includes('HTTP 404')
          ? `No official word-list file is available for ${resolvedName}. Word-list challenges must not be placed on the board.`
          : `The ${resolvedName} word list could not be loaded. Word-list challenges are temporarily unavailable.`,
        fromCache: false,
        loadedAt: null,
        metrics: emptyMetrics()
      };
      notify(failed);
      return failed;
    }
  })().finally(() => pending.delete(languageId));

  pending.set(languageId, task);
  return task;
}
