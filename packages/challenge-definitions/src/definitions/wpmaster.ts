import { createCertifiedWpmChallengeDefinition } from './certifiedWpm';

export const wpMasterDefinition = createCertifiedWpmChallengeDefinition({
  id: 'wpmaster',
  name: 'WPMaster',
  descriptionEn: 'Be the First Guesser at 150+ WPM ten times. Progress carries across lobbies; pasted or autofilled input does not count.',
  descriptionDe: 'Sei zehnmal First Guesser mit mindestens 150 WPM. Fortschritt bleibt lobbyübergreifend erhalten; eingefügte oder automatisch ausgefüllte Eingaben zählen nicht.',
  icon: 'wpmaster-fast-first-guesses',
  difficulty: 5,
  comparison: 'at-least',
  firstGuesserRequired: true,
  completionReason: 'wpmaster-ten-certified-first-guesses-completed',
  progressReason: 'wpmaster-certified-first-guess-counted'
}, {
  thresholdWpm: 150,
  guesses: 10
});
