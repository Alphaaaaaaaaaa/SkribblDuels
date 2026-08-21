import { readFileSync } from 'node:fs';
import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  blindGuessDefinition,
  deafGuessDefinition,
  drunkVisionDefinition
} from '@skribbl-duels/challenge-definitions';
import { TelemetryReplayProvider } from '@skribbl-duels/telemetry-replay';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const fixture = JSON.parse(readFileSync('fixtures/typo-live-regression-pasta-zweig-goldfisch-v1.fixture.json', 'utf8'));
  const engine = new ChallengeEngine({ autoPersist: false });
  for (const definition of [deafGuessDefinition, drunkVisionDefinition, blindGuessDefinition]) {
    engine.register(definition);
    engine.activate({ instanceId: definition.id, challengeId: definition.id });
  }
  const replay = new TelemetryReplayProvider();
  replay.load(fixture);
  const detach = engine.attachProvider(replay, 'typo-live-regression');
  await replay.play({ mode: 'instant' });
  detach();
  assert(engine.getInstance('deaf-guess')?.status === 'completion-pending', 'Deaf Guess should complete for Pasta without a prior state-change event.');
  assert(engine.getInstance('drunk-vision')?.status === 'completion-pending', 'Drunk Vision should complete for Zweig.');
  assert(engine.getInstance('blind-guess')?.status === 'completion-pending', 'Blind Guess should complete for Goldfisch after the fixed canvas snapshot.');
  console.log('Pasta/Zweig/Goldfisch live telemetry regression passed.');
}

void main();
