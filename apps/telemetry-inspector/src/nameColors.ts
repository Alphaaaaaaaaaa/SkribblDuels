export interface DuelNameColor {
  index: number;
  colors: readonly [string] | readonly [string, string];
}

export const DEFAULT_DUEL_NAME_COLOR_INDEX = 26;

export const DUEL_NAME_COLORS: readonly DuelNameColor[] = [
  { index: 0, colors: ['#ed2b34'] },
  { index: 1, colors: ['#ff7b00'] },
  { index: 2, colors: ['#ffff1b'] },
  { index: 3, colors: ['#67db14'] },
  { index: 4, colors: ['#00f2ff'] },
  { index: 5, colors: ['#4058f6'] },
  { index: 6, colors: ['#ab04f9'] },
  { index: 7, colors: ['#ff75db'] },
  { index: 8, colors: ['#00eda2'] },
  { index: 9, colors: ['#ff7a7d'] },
  { index: 10, colors: ['#847e87'] },
  { index: 11, colors: ['#423f43'] },
  { index: 12, colors: ['#8f563b'] },
  { index: 13, colors: ['#663931'] },
  { index: 14, colors: ['#eec39a'] },
  { index: 15, colors: ['#ed2b34', '#aa1f00'] },
  { index: 16, colors: ['#ffff1b', '#fecc10'] },
  { index: 17, colors: ['#67db14', '#4f8b01'] },
  { index: 18, colors: ['#1cffff', '#45beff'] },
  { index: 19, colors: ['#4058f6', '#3f25d7'] },
  { index: 20, colors: ['#e23af2', '#ab04f9'] },
  { index: 21, colors: ['#9badb7', '#847e87'] },
  { index: 22, colors: ['#8f563b', '#663931'] },
  { index: 23, colors: ['#eec39a', '#ed9e6d'] },
  { index: 24, colors: ['#00eda2', '#09a98f'] },
  { index: 25, colors: ['#ff7a7d', '#d84c69'] },
  { index: 26, colors: ['#ffffff'] },
  { index: 27, colors: ['#ffffff', '#e8e8e8'] }
] as const;

export function normalizeDuelNameColorIndex(value: unknown): number {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < DUEL_NAME_COLORS.length
    ? index
    : DEFAULT_DUEL_NAME_COLOR_INDEX;
}

/**
 * Keeps the persisted profile color authoritative while avoiding an
 * indistinguishable Versus presentation when both players selected it.
 * Only the opponent's local rendering is shifted; no Gateway state changes.
 */
export function resolveLocalOpponentColorIndex(
  selfIndexValue: unknown,
  opponentIndexValue: unknown
): number {
  const selfIndex = normalizeDuelNameColorIndex(selfIndexValue);
  const opponentIndex = normalizeDuelNameColorIndex(opponentIndexValue);
  const bothWhite = (selfIndex === 26 || selfIndex === 27)
    && (opponentIndex === 26 || opponentIndex === 27);
  return opponentIndex === selfIndex || bothWhite
    ? (opponentIndex + 2) % DUEL_NAME_COLORS.length
    : opponentIndex;
}

export function duelNameColorAtlasPosition(indexValue: unknown): string {
  const index = normalizeDuelNameColorIndex(indexValue);
  return `${-(index % 10) * 100}% ${-Math.floor(index / 10) * 100}%`;
}

export function duelClaimColorBackground(indexValue: unknown): string {
  const definition = DUEL_NAME_COLORS[normalizeDuelNameColorIndex(indexValue)]!;
  if (definition.colors.length === 1) {
    // Muting is applied by the field filter. Keeping the actual source color
    // here lets hover restore the exact atlas color, including pure #fff.
    return definition.colors[0];
  }
  return `repeating-linear-gradient(135deg,${definition.colors[0]} 0 12px,${definition.colors[1]} 12px 24px)`;
}

export function duelClaimUsesDarkText(indexValue: unknown): boolean {
  const index = normalizeDuelNameColorIndex(indexValue);
  return index === 26 || index === 27;
}

export function splitNameGraphemes(value: string): string[] {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity: 'grapheme' }) => {
      segment(input: string): Iterable<{ segment: string }>;
    };
  }).Segmenter;
  if (!Segmenter) return Array.from(value);
  return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(value)]
    .map(item => item.segment);
}

export function appendColoredDuelName(
  target: HTMLElement,
  name: string,
  indexValue: unknown
): void {
  const definition = DUEL_NAME_COLORS[normalizeDuelNameColorIndex(indexValue)]!;
  splitNameGraphemes(name).forEach((grapheme, index) => {
    const span = document.createElement('span');
    span.className = 'scd-colored-name-grapheme';
    span.style.color = definition.colors[index % definition.colors.length]!;
    span.textContent = grapheme;
    target.appendChild(span);
  });
}
