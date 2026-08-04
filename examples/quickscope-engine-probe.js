// Paste into the browser console while the v0.7.0 inspector is running.
// Load the included Quickscope fixture, switch the engine to replay, then play it.

const engine = window.skribblDuelsChallengeEngine;
const replay = window.skribblDuelsReplay;

if (!engine || !replay) {
  throw new Error('Skribbl Duels v0.7.0 inspector is not initialized.');
}

const challengeId = 'dev-quickscope-probe';
const instanceId = 'dev-field-quickscope';

if (!engine.getDefinitionIds().includes(challengeId)) {
  engine.register({
    id: challengeId,
    version: 1,
    metadata: {
      category: 'guessing',
      localization: {
        en: {
          name: 'Quickscope probe',
          description: 'Complete on a self guess within five seconds.'
        }
      },
      rankedEligible: false,
      difficulty: 1
    },
    defaultParameters: {
      seconds: 5,
      amount: 1
    },
    target(parameters) {
      return parameters.amount;
    },
    createInitialState() {
      return { qualifyingGuesses: 0 };
    },
    relevantEvents: ['CORRECT_GUESS'],
    allowedLobbyTypes: [0],
    resetOn: ['lobby-change'],
    reduce({ event, runtime, parameters }) {
      if (event.type !== 'CORRECT_GUESS') return null;
      if (!event.actor?.isSelf) return null;
      if (event.payload.elapsedMs === null) return null;
      if (event.payload.elapsedMs > parameters.seconds * 1000) return null;

      const qualifyingGuesses = runtime.internalState.qualifyingGuesses + 1;
      return {
        internalState: { qualifyingGuesses },
        progress: qualifyingGuesses,
        reason: 'quickscope-probe-match',
        evidenceEventIds: [event.eventId]
      };
    }
  });
}

if (!engine.getInstance(instanceId)) {
  engine.activate({
    instanceId,
    challengeId
  });
}

engine.useReplay();
console.log('Quickscope probe ready.', engine.getInstance(instanceId));
console.log('Load the fixture and press Play ×10, or call await skribblDuelsReplay.play({ mode: \'instant\' }).');
