import { createTypoActiveGuessDefinition } from './typoActiveGuess';

export const deafGuessDefinition = createTypoActiveGuessDefinition({
  id: 'deaf-guess',
  name: 'Deaf Guess',
  descriptionEn: 'Be the first guesser while the Typo Deaf Guess challenge is active.',
  descriptionDe: 'Errate das Wort als Erster, während die Typo-Challenge Deaf Guess aktiv ist.',
  icon: 'typo-deaf-guess',
  difficulty: 3
});
