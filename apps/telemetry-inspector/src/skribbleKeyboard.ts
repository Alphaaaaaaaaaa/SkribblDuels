import type {
  GatewaySkribbleAttempt,
  GatewaySkribbleMark
} from '@skribbl-duels/gateway-contracts';

export type SkribbleKeyboardMark = GatewaySkribbleMark | 'empty';

interface KeyboardPreset {
  locale: string;
  rows: readonly (readonly string[])[];
}

const PRESETS: Readonly<Record<number, KeyboardPreset>> = {
  0: { locale: 'en', rows: [['q','w','e','r','t','y','u','i','o','p'], ['a','s','d','f','g','h','j','k','l'], ['z','x','c','v','b','n','m']] },
  1: { locale: 'de', rows: [['q','w','e','r','t','z','u','i','o','p','ü'], ['a','s','d','f','g','h','j','k','l','ö','ä'], ['y','x','c','v','b','n','m','ß']] },
  3: { locale: 'cs', rows: [['q','w','e','r','t','z','u','i','o','p'], ['a','s','d','f','g','h','j','k','l'], ['y','x','c','v','b','n','m']] },
  6: { locale: 'fi', rows: [['q','w','e','r','t','y','u','i','o','p','å'], ['a','s','d','f','g','h','j','k','l','ö','ä'], ['z','x','c','v','b','n','m']] },
  7: { locale: 'fr', rows: [['a','z','e','r','t','y','u','i','o','p'], ['q','s','d','f','g','h','j','k','l','m'], ['w','x','c','v','b','n']] },
  11: { locale: 'hu', rows: [['q','w','e','r','t','z','u','i','o','p','ő','ú'], ['a','s','d','f','g','h','j','k','l','é','á'], ['í','y','x','c','v','b','n','m','ö','ü','ó','ű']] },
  12: { locale: 'it', rows: [['q','w','e','r','t','y','u','i','o','p'], ['a','s','d','f','g','h','j','k','l'], ['z','x','c','v','b','n','m']] },
  18: { locale: 'pt', rows: [['q','w','e','r','t','y','u','i','o','p'], ['a','s','d','f','g','h','j','k','l','ç'], ['z','x','c','v','b','n','m']] },
  19: { locale: 'pl', rows: [['q','w','e','r','t','y','u','i','o','p'], ['a','s','d','f','g','h','j','k','l','ł'], ['z','x','c','v','b','n','m']] },
  22: { locale: 'sr-Latn', rows: [['q','w','e','r','t','z','u','i','o','p','š','đ'], ['a','s','d','f','g','h','j','k','l','č','ć'], ['y','x','c','v','b','n','m','ž']] },
  24: { locale: 'es', rows: [['q','w','e','r','t','y','u','i','o','p'], ['a','s','d','f','g','h','j','k','l','ñ'], ['z','x','c','v','b','n','m']] }
};

const FALLBACK_PRESET = PRESETS[0]!;

const HANGUL_LEADS = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'] as const;
const HANGUL_VOWELS = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'] as const;
const HANGUL_TAILS = ['', 'ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'] as const;

const HANGUL_ROWS = [
  ['ㅂ','ㅃ','ㅈ','ㅉ','ㄷ','ㄸ','ㄱ','ㄲ','ㅅ','ㅆ','ㅛ','ㅕ','ㅑ','ㅒ','ㅐ','ㅔ'],
  ['ㅁ','ㄴ','ㅇ','ㄹ','ㅎ','ㅗ','ㅘ','ㅙ','ㅚ','ㅓ','ㅏ','ㅣ'],
  ['ㅋ','ㅌ','ㅊ','ㅍ','ㅠ','ㅜ','ㅝ','ㅞ','ㅟ','ㅡ','ㅢ','ㅖ']
] as const;

const LEAD_INDEX = new Map<string, number>(HANGUL_LEADS.map((value, index) => [value, index]));
const VOWEL_INDEX = new Map<string, number>(HANGUL_VOWELS.map((value, index) => [value, index]));
const TAIL_INDEX = new Map<string, number>(HANGUL_TAILS.map((value, index) => [value, index]));

const COMBINED_VOWELS = new Map<string, string>([
  ['ㅗㅏ', 'ㅘ'], ['ㅗㅐ', 'ㅙ'], ['ㅗㅣ', 'ㅚ'],
  ['ㅜㅓ', 'ㅝ'], ['ㅜㅔ', 'ㅞ'], ['ㅜㅣ', 'ㅟ'], ['ㅡㅣ', 'ㅢ']
]);
const SPLIT_VOWELS = new Map<string, readonly [string, string]>(
  [...COMBINED_VOWELS.entries()].map(([parts, combined]) => [combined, [parts[0]!, parts[1]!]])
);
const COMBINED_TAILS = new Map<string, string>([
  ['ㄱㄱ', 'ㄲ'], ['ㄱㅅ', 'ㄳ'], ['ㄴㅈ', 'ㄵ'], ['ㄴㅎ', 'ㄶ'],
  ['ㄹㄱ', 'ㄺ'], ['ㄹㅁ', 'ㄻ'], ['ㄹㅂ', 'ㄼ'], ['ㄹㅅ', 'ㄽ'],
  ['ㄹㅌ', 'ㄾ'], ['ㄹㅍ', 'ㄿ'], ['ㄹㅎ', 'ㅀ'], ['ㅂㅅ', 'ㅄ'], ['ㅅㅅ', 'ㅆ']
]);
const SPLIT_TAILS = new Map<string, readonly [string, string]>(
  [...COMBINED_TAILS.entries()].map(([parts, combined]) => [combined, [parts[0]!, parts[1]!]])
);

function preset(languageId: number): KeyboardPreset {
  return languageId === 14
    ? { locale: 'ko', rows: HANGUL_ROWS }
    : PRESETS[languageId] ?? FALLBACK_PRESET;
}

function normalizedCharacters(value: string, locale: string): string[] {
  return Array.from(value.normalize('NFKC').toLocaleLowerCase(locale));
}

function decomposeHangul(character: string): string[] {
  const code = character.codePointAt(0);
  if (code === undefined || code < 0xac00 || code > 0xd7a3) return [character];
  const offset = code - 0xac00;
  const lead = Math.floor(offset / 588);
  const vowel = Math.floor((offset % 588) / 28);
  const tail = offset % 28;
  const vowelValue = HANGUL_VOWELS[vowel]!;
  const tailValue = tail > 0 ? HANGUL_TAILS[tail]! : null;
  const vowelParts = SPLIT_VOWELS.get(vowelValue);
  const tailParts = tailValue ? SPLIT_TAILS.get(tailValue) : null;
  return [
    HANGUL_LEADS[lead]!,
    vowelValue,
    ...(vowelParts ?? []),
    ...(tailValue ? [tailValue] : []),
    ...(tailParts ?? [])
  ];
}

function feedbackUnits(character: string, languageId: number, locale: string): string[] {
  const normalized = normalizedCharacters(character, locale);
  return languageId === 14
    ? normalized.flatMap(decomposeHangul)
    : normalized;
}

function chunk(values: readonly string[], size: number): string[][] {
  const rows: string[][] = [];
  for (let index = 0; index < values.length; index += size) rows.push(values.slice(index, index + size));
  return rows;
}

export function createSkribbleKeyboardRows(languageId: number, words: readonly string[]): string[][] {
  const selected = preset(languageId);
  const baseRows = selected.rows.map(row => [...row]);
  const base = new Set(baseRows.flat());
  const counts = new Map<string, number>();

  for (const word of words) {
    for (const character of normalizedCharacters(word, selected.locale)) {
      const units = languageId === 14 ? decomposeHangul(character) : [character];
      for (const unit of units) {
        if (/\s/u.test(unit) || base.has(unit)) continue;
        counts.set(unit, (counts.get(unit) ?? 0) + 1);
      }
    }
  }

  const extras = [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], selected.locale))
    .map(([character]) => character);
  return [...baseRows, ...chunk(extras, languageId === 14 ? 12 : 14)];
}

export function getSkribbleKeyboardMark(
  attempts: readonly GatewaySkribbleAttempt[],
  key: string,
  languageId: number
): SkribbleKeyboardMark {
  const locale = preset(languageId).locale;
  let best = 0;
  const rank: Readonly<Record<GatewaySkribbleMark, number>> = {
    incorrect: 1,
    semicorrect: 2,
    correct: 3
  };
  for (const attempt of attempts) {
    const characters = normalizedCharacters(attempt.guess, locale);
    characters.forEach((character, index) => {
      if (!feedbackUnits(character, languageId, locale).includes(key)) return;
      best = Math.max(best, rank[attempt.marks[index] ?? 'incorrect']);
    });
  }
  return best === 3 ? 'correct' : best === 2 ? 'semicorrect' : best === 1 ? 'incorrect' : 'empty';
}

interface HangulSyllable {
  lead: number;
  vowel: number;
  tail: number;
}

function parseHangulSyllable(character: string): HangulSyllable | null {
  const code = character.codePointAt(0);
  if (code === undefined || code < 0xac00 || code > 0xd7a3) return null;
  const offset = code - 0xac00;
  return {
    lead: Math.floor(offset / 588),
    vowel: Math.floor((offset % 588) / 28),
    tail: offset % 28
  };
}

function composeHangul(lead: number, vowel: number, tail = 0): string {
  return String.fromCodePoint(0xac00 + ((lead * 21) + vowel) * 28 + tail);
}

function replaceLast(value: string, replacement: string): string {
  const characters = Array.from(value);
  characters.splice(-1, 1, replacement);
  return characters.join('');
}

function appendKoreanJamo(value: string, jamo: string): string {
  const characters = Array.from(value);
  const last = characters.at(-1);
  if (!last) return jamo;
  const syllable = parseHangulSyllable(last);
  const vowelIndex = VOWEL_INDEX.get(jamo);

  if (vowelIndex !== undefined) {
    const standaloneLead = LEAD_INDEX.get(last);
    if (standaloneLead !== undefined) return replaceLast(value, composeHangul(standaloneLead, vowelIndex));
    if (!syllable) return value + jamo;
    if (syllable.tail === 0) {
      const combined = COMBINED_VOWELS.get(`${HANGUL_VOWELS[syllable.vowel]}${jamo}`);
      const combinedIndex = combined ? VOWEL_INDEX.get(combined) : undefined;
      return combinedIndex === undefined
        ? value + jamo
        : replaceLast(value, composeHangul(syllable.lead, combinedIndex));
    }

    const tail = HANGUL_TAILS[syllable.tail]!;
    const split = SPLIT_TAILS.get(tail);
    const remainingTail = split?.[0] ?? '';
    const movingLead = split?.[1] ?? tail;
    const nextLead = LEAD_INDEX.get(movingLead);
    if (nextLead === undefined) return value + jamo;
    return replaceLast(value, composeHangul(
      syllable.lead,
      syllable.vowel,
      TAIL_INDEX.get(remainingTail) ?? 0
    )) + composeHangul(nextLead, vowelIndex);
  }

  if (syllable) {
    if (syllable.tail === 0) {
      const tailIndex = TAIL_INDEX.get(jamo);
      return tailIndex === undefined ? value + jamo : replaceLast(value, composeHangul(syllable.lead, syllable.vowel, tailIndex));
    }
    const combined = COMBINED_TAILS.get(`${HANGUL_TAILS[syllable.tail]}${jamo}`);
    const combinedIndex = combined ? TAIL_INDEX.get(combined) : undefined;
    if (combinedIndex !== undefined) return replaceLast(value, composeHangul(syllable.lead, syllable.vowel, combinedIndex));
  }
  return value + jamo;
}

export function appendSkribbleKeyboardValue(
  current: string,
  value: string,
  languageId: number,
  maximumLength: number
): string {
  const next = languageId === 14 && (LEAD_INDEX.has(value) || VOWEL_INDEX.has(value) || TAIL_INDEX.has(value))
    ? appendKoreanJamo(current, value)
    : current + value;
  return Array.from(next).length <= maximumLength ? next : current;
}

export function removeLastSkribbleCharacter(value: string): string {
  return Array.from(value).slice(0, -1).join('');
}

export const SKRIBBLE_KEYBOARD_PRESETS_FOR_TESTING = PRESETS;
