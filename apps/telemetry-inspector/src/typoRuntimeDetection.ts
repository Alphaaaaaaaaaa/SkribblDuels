export interface TypoRuntimeDataset {
  readonly typo_loader?: string | undefined;
  readonly typo_loaded?: string | undefined;
  readonly typoLoader?: string | undefined;
  readonly typoLoaded?: string | undefined;
}

/**
 * Typo's loader uses underscore dataset keys, which map to
 * data-typo_loader/data-typo_loaded rather than the camel-case
 * data-typo-loader/data-typo-loaded spellings. The patched Skribbl runtime also
 * leaves typo-skribbl-loaded="true" on the replacement body. Accepting all
 * three official persistent markers keeps detection reliable even when Skribbl
 * Duels starts before Typo has replaced and initialized the body.
 */
export function isTypoRuntimeDetected(
  dataset: TypoRuntimeDataset | null | undefined,
  typoSkribblLoaded: string | null | undefined = null
): boolean {
  return dataset?.typo_loader === 'true'
    || dataset?.typo_loaded === 'true'
    || dataset?.typoLoader === 'true'
    || dataset?.typoLoaded === 'true'
    || typoSkribblLoaded === 'true';
}
