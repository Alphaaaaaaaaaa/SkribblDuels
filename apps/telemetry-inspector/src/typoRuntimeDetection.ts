export interface TypoRuntimeDataset {
  readonly typoLoader?: string | undefined;
  readonly typoLoaded?: string | undefined;
}

/**
 * Typo's loader marks the replacement Skribbl body with data-typo_loader and
 * its interceptor later adds data-typo_loaded. Either marker is owned by Typo
 * and is therefore safer than guessing from optional UI elements.
 */
export function isTypoRuntimeDetected(dataset: TypoRuntimeDataset | null | undefined): boolean {
  return dataset?.typoLoader === 'true' || dataset?.typoLoaded === 'true';
}
