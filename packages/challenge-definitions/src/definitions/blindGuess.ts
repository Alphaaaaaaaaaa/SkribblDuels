import { createTypoActiveGuessDefinition } from './typoActiveGuess';

export const blindGuessDefinition = createTypoActiveGuessDefinition({
  id: 'blind-guess',
  name: 'Blind Guess',
  descriptionEn: 'Guess the word while the Typo Blind Guess challenge is active.',
  descriptionDe: 'Errate das Wort, während die Typo-Challenge Blind Guess aktiv ist.',
  icon: 'typo-blind-guess',
  difficulty: 3
});
