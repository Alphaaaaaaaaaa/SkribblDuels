import { readFileSync } from 'node:fs';
import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  activateStarterSandbox,
  registerStarterChallengeDefinitions,
  starterChallengeDefinitions,
  starterSandboxInstanceIds,
  setOfficialWordListForTesting
} from '@skribbl-duels/challenge-definitions';
import { TelemetryReplayProvider } from '@skribbl-duels/telemetry-replay';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  setOfficialWordListForTesting(1, ['Reddit', 'Punkt', 'Ski', 'Atlantis', 'Nagel', 'Hai', 'Zoo', 'New York'], 'German');
  const rebalanced = new Set([
    'bloodline', 'ouch', 'picasso', 'cool-number-detected', 'fanboy', 'color-picker',
    'time-waste', 'mogged', 'need-some-space', 'smol-words', 'big-word', 'hint-reflexes',
    'blind-guess', 'drunk-vision', 'deaf-guess'
  ]);

  const fixture = JSON.parse(readFileSync(new URL('../fixtures/starter-challenges-with-typo-guess-challenges-v30.fixture.json', import.meta.url), 'utf8'));
  const engine = new ChallengeEngine({ autoPersist: false });
  const registered = registerStarterChallengeDefinitions(engine);
  assert(registered.length === 46, `Expected 46 registered definitions, got ${registered.length}.`);
  const activated = activateStarterSandbox(engine);
  assert(activated.length === 46, `Expected 46 activated instances, got ${activated.length}.`);
  const replay = new TelemetryReplayProvider();
  replay.load(fixture);
  const detach = engine.attachProvider(replay, 'all-starter-runtime');
  await replay.play({ mode: 'instant' });
  detach();
  for (const definition of starterChallengeDefinitions) {
    const instanceId = starterSandboxInstanceIds[definition.id as keyof typeof starterSandboxInstanceIds];
    const runtime = engine.getInstance(instanceId);
    assert(runtime !== null, `${definition.id} runtime is missing.`);
    if (rebalanced.has(definition.id)) continue;
    assert(runtime?.status === 'completion-pending', `${definition.id} did not complete; status=${runtime?.status}.`);
  }
  console.log('All 46 starter challenges loaded; 31 unchanged challenges completed from the legacy v30 fixture.');
}

void main();
