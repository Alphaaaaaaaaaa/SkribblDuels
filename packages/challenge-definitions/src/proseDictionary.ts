import {
  PROSE_DICTIONARY_BLOOMS,
  PROSE_DICTIONARY_VERSION,
  type ProseDictionaryBloomData
} from './proseDictionaryData';

export { PROSE_DICTIONARY_VERSION };

interface DecodedBloom {
  bitCount: number;
  hashCount: number;
  bytes: Uint8Array;
}

interface DecodedDictionary {
  data: ProseDictionaryBloomData;
  exact: DecodedBloom;
  deletions: DecodedBloom;
}

const decodedDictionaries = new Map<number, DecodedDictionary>();

export function normalizeProseWord(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[’‘]/gu, "'")
    .replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, '');
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeBloom(
  bloom: ProseDictionaryBloomData['exact'] | ProseDictionaryBloomData['deletions']
): DecodedBloom {
  return {
    bitCount: bloom.bitCount,
    hashCount: bloom.hashCount,
    bytes: decodeBase64(bloom.base64)
  };
}

function getDictionary(languageId: number): DecodedDictionary | null {
  const cached = decodedDictionaries.get(languageId);
  if (cached) return cached;
  const data = PROSE_DICTIONARY_BLOOMS[languageId];
  if (!data) return null;
  const decoded = {
    data,
    exact: decodeBloom(data.exact),
    deletions: decodeBloom(data.deletions)
  };
  decodedDictionaries.set(languageId, decoded);
  return decoded;
}

function hash32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function bloomHas(bloom: DecodedBloom, value: string): boolean {
  const first = hash32(value, 0x811c9dc5);
  const second = hash32(value, 0x9e3779b9) | 1;
  for (let index = 0; index < bloom.hashCount; index += 1) {
    const bit = ((first + Math.imul(index, second)) >>> 0) % bloom.bitCount;
    const byte = bloom.bytes[bit >>> 3];
    if (byte === undefined || (byte & (1 << (bit & 7))) === 0) return false;
  }
  return true;
}

function deletionVariants(value: string): string[] {
  const characters = Array.from(value);
  if (characters.length < 5) return [];
  const variants = new Set<string>();
  for (let index = 0; index < characters.length; index += 1) {
    variants.add([...characters.slice(0, index), ...characters.slice(index + 1)].join(''));
  }
  return [...variants];
}

function transpositionVariants(value: string): string[] {
  const characters = Array.from(value);
  if (characters.length < 5) return [];
  const variants: string[] = [];
  for (let index = 0; index + 1 < characters.length; index += 1) {
    if (characters[index] === characters[index + 1]) continue;
    const swapped = [...characters];
    const current = swapped[index];
    const next = swapped[index + 1];
    if (current === undefined || next === undefined) continue;
    swapped[index] = next;
    swapped[index + 1] = current;
    variants.push(swapped.join(''));
  }
  return variants;
}

export function getProseDictionaryLocale(languageId: number | null): string | null {
  if (languageId === null) return null;
  return PROSE_DICTIONARY_BLOOMS[languageId]?.locale ?? null;
}

/**
 * Matches a common word exactly or within one edit for words of five or more
 * Unicode code points. Bloom filters deliberately trade a tiny false-positive
 * rate for a compact, fully offline 28-language userscript asset.
 */
export function isRecognizedProseWord(
  languageId: number | null,
  value: string,
  allowOneEdit = true
): boolean {
  if (languageId === null) return false;
  const dictionary = getDictionary(languageId);
  if (!dictionary) return false;
  const normalized = normalizeProseWord(value);
  if (!normalized || !/\p{L}/u.test(normalized)) return false;
  if (bloomHas(dictionary.exact, normalized)) return true;
  if (!allowOneEdit || Array.from(normalized).length < 5) return false;

  const deletions = deletionVariants(normalized);
  if (deletions.some(candidate => bloomHas(dictionary.exact, candidate))) return true;
  if (bloomHas(dictionary.deletions, normalized)) return true;
  if (deletions.some(candidate => bloomHas(dictionary.deletions, candidate))) return true;
  return transpositionVariants(normalized).some(candidate => bloomHas(dictionary.exact, candidate));
}

export function getProseDictionarySummary(): ReadonlyArray<{
  languageId: number;
  languageName: string;
  locale: string;
  wordCount: number;
  source: string;
}> {
  return Object.values(PROSE_DICTIONARY_BLOOMS).map(data => ({
    languageId: data.languageId,
    languageName: data.languageName,
    locale: data.locale,
    wordCount: data.exact.itemCount,
    source: data.source
  }));
}
