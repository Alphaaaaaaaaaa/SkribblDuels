import { readFileSync } from 'node:fs';
import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  activateStarterSandbox,
  registerStarterChallengeDefinitions,
  setOfficialWordListForTesting,
  starterChallengeDefinitions,
  starterSandboxInstanceIds
} from '@skribbl-duels/challenge-definitions';
import { TelemetryReplayProvider } from '@skribbl-duels/telemetry-replay';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  setOfficialWordListForTesting(1, ['Reddit', 'Punkt', 'Ski', 'Atlantis', 'Nagel', 'Hai', 'Zoo'], 'German');
  const fixture = JSON.parse(readFileSync('fixtures/starter-challenges-with-typo-guess-challenges-v29.fixture.json', 'utf8'));
  const engine = new ChallengeEngine({ autoPersist: false });
  assert(registerStarterChallengeDefinitions(engine).length === 47, 'All 47 definitions should register.');
  assert(activateStarterSandbox(engine).length === 47, 'All 47 sandbox instances should activate.');
  const replay = new TelemetryReplayProvider();
  replay.load(fixture);
  const detach = engine.attachProvider(replay, 'v29-fixture');
  await replay.play({ mode: 'instant' });
  detach();
  for (const definition of starterChallengeDefinitions) {
    if (definition.id === 'transcended') continue;
    const instanceId = starterSandboxInstanceIds[definition.id as keyof typeof starterSandboxInstanceIds];
    const runtime = engine.getInstance(instanceId);
    assert(runtime?.status === 'completion-pending', `${definition.id} did not complete; status=${runtime?.status}.`);
  }
  console.log('The 46 legacy starter challenges completed from the v29 fixture; Transcended is covered separately.');
}

void main();
