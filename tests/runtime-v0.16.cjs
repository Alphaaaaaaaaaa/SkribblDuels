const fs = require('node:fs');
const path = require('node:path');
const { ChallengeEngine } = require('@skribbl-duels/challenge-engine');
const {
  activateStarterSandbox,
  registerStarterChallengeDefinitions,
  starterChallengeDefinitions,
  starterSandboxInstanceIds,
  ownerOfTheLobbyDefinition,
  myFavoriteColorIsRedDefinition,
  myEyesAreBleedingDefinition
} = require('@skribbl-duels/challenge-definitions');
const { TelemetryReplayProvider } = require('@skribbl-duels/telemetry-replay');
const { AvatarTelemetryAdapter } = require('@skribbl-duels/telemetry-core');
function assert(condition, message) { if (!condition) throw new Error(message); }
(async () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/starter-challenges-with-drawing-v13.fixture.json'), 'utf8'));
  const engine = new ChallengeEngine({ autoPersist: false });
  assert(registerStarterChallengeDefinitions(engine).length === 17, 'Expected 17 registered definitions.');
  assert(activateStarterSandbox(engine).length === 17, 'Expected 17 activated instances.');
  const replay = new TelemetryReplayProvider();
  replay.load(fixture);
  const detach = engine.attachProvider(replay, 'runtime-v0.17');
  await replay.play({ mode: 'instant' });
  detach();
  for (const definition of starterChallengeDefinitions) {
    const runtime = engine.getInstance(starterSandboxInstanceIds[definition.id]);
    assert(runtime && runtime.status === 'completion-pending', `${definition.id} did not complete (${runtime && runtime.status}).`);
  }
  const owner = engine.getInstance(starterSandboxInstanceIds['owner-of-the-lobby']);
  assert(owner.completionCandidate.evidenceEventIds.includes('owner-private-hydrated'), 'Owner must use LOBBY_HYDRATED evidence.');
  const red = engine.getInstance(starterSandboxInstanceIds['my-favorite-color-is-red']);
  assert(red.completionCandidate.evidenceEventIds.includes('red-avatar-randomized'), 'Red must include verified randomization evidence.');
  const eyes = engine.getInstance(starterSandboxInstanceIds['my-eyes-are-bleeding']);
  assert(eyes.internalState.matchedKeyword === 'idiot', 'My eyes should normalize and match idiot.');

  // Exact private-lobby live shape from the user must complete only after own create request.
  const ownerEngine = new ChallengeEngine({ autoPersist: false });
  ownerEngine.register(ownerOfTheLobbyDefinition);
  ownerEngine.activate({ instanceId: 'owner-live', challengeId: 'owner-of-the-lobby' });
  const create = fixture.events.find(entry => entry.event.eventId === 'owner-private-create-request').event;
  const hydrated = fixture.events.find(entry => entry.event.eventId === 'owner-private-hydrated').event;
  ownerEngine.process(structuredClone(create));
  ownerEngine.process(structuredClone(hydrated));
  assert(ownerEngine.getInstance('owner-live').status === 'completion-pending', 'Live LOBBY_HYDRATED shape must complete Owner.');

  // Red challenge must not accept login/hydration without verified randomization.
  const redEngine = new ChallengeEngine({ autoPersist: false });
  redEngine.register(myFavoriteColorIsRedDefinition);
  redEngine.activate({ instanceId: 'red-live', challengeId: 'my-favorite-color-is-red' });
  redEngine.process(structuredClone(fixture.events.find(entry => entry.event.eventId === 'red-avatar-login-confirmed').event));
  redEngine.process(structuredClone(fixture.events.find(entry => entry.event.eventId === 'red-public-lobby-hydrated').event));
  assert(redEngine.getInstance('red-live').progress.current === 0, 'Red login without randomization must not count.');

  // Adapter: click-correlated randomization counts, manual +1 does not.
  let stored = '[14,50,49,4]';
  const emitted = [];
  global.localStorage = { getItem: key => key === 'ava' ? stored : null };
  const adapter = new AvatarTelemetryAdapter({ emitDomEvent: (type, payload) => emitted.push({ type, payload }) }, { pollIntervalMs: 5 });
  adapter.start();
  adapter.notifyRandomizeClick();
  stored = '[0,38,41,-1]';
  await new Promise(resolve => setTimeout(resolve, 20));
  stored = '[0,39,41,-1]';
  await new Promise(resolve => setTimeout(resolve, 20));
  adapter.stop();
  assert(emitted.length === 1 && emitted[0].payload.method === 'randomize-button', 'Manual +1 must not emit a second randomization.');

  // My eyes ignores self and harmless messages.
  const eyesEngine = new ChallengeEngine({ autoPersist: false });
  eyesEngine.register(myEyesAreBleedingDefinition);
  eyesEngine.activate({ instanceId: 'eyes-live', challengeId: 'my-eyes-are-bleeding' });
  const insult = structuredClone(fixture.events.find(entry => entry.event.eventId === 'my-eyes-insult-message').event);
  const harmless = structuredClone(insult); harmless.eventId = 'harmless'; harmless.payload.message = 'gutes bild';
  eyesEngine.process(harmless);
  const self = structuredClone(insult); self.eventId = 'self'; self.actor.isSelf = true;
  eyesEngine.process(self);
  assert(eyesEngine.getInstance('eyes-live').progress.current === 0, 'Harmless/self chat must not count.');
  eyesEngine.process(insult);
  assert(eyesEngine.getInstance('eyes-live').status === 'completion-pending', 'Other-player insult must complete My eyes.');
  console.log('v0.17 runtime regression test passed (17 challenges).');
})().catch(error => { console.error(error); process.exitCode = 1; });
