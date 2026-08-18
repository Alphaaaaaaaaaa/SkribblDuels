import { createTypoActiveGuessDefinition } from './typoActiveGuess';

export const blindGuessDefinition = createTypoActiveGuessDefinition({
  id: 'blind-guess',
  name: 'Blind Guess',
  descriptionEn: 'Be the first guesser while the Typo Blind Guess challenge is active.',
  descriptionDe: 'Errate das Wort als Erster, während die Typo-Challenge Blind Guess aktiv ist.',
  icon: 'typo-blind-guess',
  difficulty: 3
});
