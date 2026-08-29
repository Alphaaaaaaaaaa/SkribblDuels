import { createCertifiedWpmChallengeDefinition } from './certifiedWpm';

export const internetExplorerDefinition = createCertifiedWpmChallengeDefinition({
  id: 'internet-explorer',
  name: 'Internet Explorer',
  descriptionEn: 'Guess a word correctly below 20 WPM. Being First Guesser is not required; pasted or autofilled input does not count.',
  descriptionDe: 'Errate ein Wort korrekt mit weniger als 20 WPM. Du musst nicht First Guesser sein; eingefügte oder automatisch ausgefüllte Eingaben zählen nicht.',
  icon: 'internet-explorer-slow-guess',
  difficulty: 2,
  comparison: 'below',
  firstGuesserRequired: false,
  completionReason: 'internet-explorer-certified-sub-20-wpm-guess-completed',
  progressReason: 'internet-explorer-certified-sub-20-wpm-guess-counted'
}, {
  thresholdWpm: 20,
  guesses: 1
});
