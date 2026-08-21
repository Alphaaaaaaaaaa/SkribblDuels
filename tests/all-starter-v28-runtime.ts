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
  const fixture = JSON.parse(readFileSync('fixtures/starter-challenges-with-spamguessing-autodraw-v28.fixture.json', 'utf8'));
  const engine = new ChallengeEngine({ autoPersist: false });
  assert(registerStarterChallengeDefinitions(engine).length === 43, 'All 43 definitions should register.');
  assert(activateStarterSandbox(engine).length === 43, 'All 43 sandbox instances should activate.');
  const replay = new TelemetryReplayProvider();
  replay.load(fixture);
  const detach = engine.attachProvider(replay, 'v28-fixture');
  await replay.play({ mode: 'instant' });
  detach();
  for (const definition of starterChallengeDefinitions) {
    const instanceId = starterSandboxInstanceIds[definition.id as keyof typeof starterSandboxInstanceIds];
    const runtime = engine.getInstance(instanceId);
    assert(runtime?.status === 'completion-pending', `${definition.id} did not complete; status=${runtime?.status}.`);
  }
  const noob = engine.getInstance(starterSandboxInstanceIds['noob-vs-pro-vs-hacker']);
  assert(noob?.progress.current === 7, 'Noob vs. Pro vs. Hacker should finish at 7/7.');
  assert(!(noob?.completionCandidate?.evidenceEventIds.includes('noob-pro-hacker-position-2-duplicate') ?? true), 'Duplicate position must not be evidence.');
  console.log('All 43 starter challenges completed from the v28 fixture.');
}

void main();
