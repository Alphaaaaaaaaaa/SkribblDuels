import { createCertifiedWpmChallengeDefinition } from './certifiedWpm';

export const typeRacerDefinition = createCertifiedWpmChallengeDefinition({
  id: 'type-racer',
  name: 'TypeRacer',
  descriptionEn: 'Be the First Guesser once at 250+ WPM. Pasted or autofilled input does not count.',
  descriptionDe: 'Sei einmal First Guesser mit mindestens 250 WPM. Eingefügte oder automatisch ausgefüllte Eingaben zählen nicht.',
  icon: 'type-racer-fastest-first-guess',
  difficulty: 5,
  comparison: 'at-least',
  firstGuesserRequired: true,
  completionReason: 'type-racer-certified-250-wpm-first-guess-completed',
  progressReason: 'type-racer-certified-first-guess-counted'
}, {
  thresholdWpm: 250,
  guesses: 1
});
