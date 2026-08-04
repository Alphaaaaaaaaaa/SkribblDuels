import { createTypoActiveGuessDefinition } from './typoActiveGuess';

export const deafGuessDefinition = createTypoActiveGuessDefinition({
  id: 'deaf-guess',
  name: 'Deaf Guess',
  descriptionEn: 'Guess the word while the Typo Deaf Guess challenge is active.',
  descriptionDe: 'Errate das Wort, während die Typo-Challenge Deaf Guess aktiv ist.',
  icon: 'typo-deaf-guess',
  difficulty: 3
});
