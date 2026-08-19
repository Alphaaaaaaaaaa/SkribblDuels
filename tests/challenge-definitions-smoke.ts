import { readFileSync } from 'node:fs';
const fixtureJson = JSON.parse(readFileSync('fixtures/starter-challenges-with-typo-guess-challenges-v30.fixture.json', 'utf8'));
import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  activateStarterSandbox,
  omgHackerDefinition,
  fanboyDefinition,
  inAndOutDefinition,
  picassoDefinition,
  copyAndPasteDefinition,
  caughtIn4kDefinition,
  ownerOfTheLobbyDefinition,
  myFavoriteColorIsRedDefinition,
  myEyesAreBleedingDefinition,
  throughThickAndThinDefinition,
  colorPickerDefinition,
  needSomeSpaceDefinition,
  alliterationDefinition,
  isThatAModDefinition,
  bloodlineDefinition,
  timeWasteDefinition,
  ultimateComebackDefinition,
  ouchDefinition,
  quickscopeDefinition,
  registerStarterChallengeDefinitions,
  sniperDefinition,
  starterChallengeDefinitions,
  starterSandboxInstanceIds,
  setOfficialWordListForTesting,
  smolWordsDefinition,
  bigWordDefinition
} from '@skribbl-duels/challenge-definitions';
import {
  TelemetryReplayProvider,
  validateTelemetryFixture
} from '@skribbl-duels/telemetry-replay';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

async function main(): Promise<void> {
setOfficialWordListForTesting(1, ['Reddit', 'Punkt', 'Ski', 'Atlantis', 'Nagel', 'Hai', 'Zoo', 'New York'], 'German');

const rebalancedChallengeIds = new Set([
  'bloodline', 'ouch', 'picasso', 'cool-number-detected', 'fanboy', 'color-picker',
  'time-waste', 'mogged', 'need-some-space', 'smol-words', 'big-word', 'hint-reflexes'
]);

const validation = validateTelemetryFixture(fixtureJson);
assert(validation.valid && validation.fixture, 'Starter fixture must be valid.');
const fixture = validation.fixture;

const engine = new ChallengeEngine({ autoPersist: false });
const registered = registerStarterChallengeDefinitions(engine);
assertEqual(registered.length, starterChallengeDefinitions.length, 'All starter definitions should register.');
assertEqual(engine.getDefinitionIds().length, 46, 'Forty-six official starter definitions should exist.');

const activated = activateStarterSandbox(engine);
assertEqual(activated.length, 46, 'Forty-six starter sandbox instances should activate.');

const replay = new TelemetryReplayProvider();
replay.load(fixture);
const detach = engine.attachProvider(replay, 'starter-fixture');
await replay.play({ mode: 'instant' });
detach();

for (const definition of starterChallengeDefinitions) {
  if (rebalancedChallengeIds.has(definition.id)) continue;
  const instanceId = starterSandboxInstanceIds[definition.id as keyof typeof starterSandboxInstanceIds];
  const runtime = engine.getInstance(instanceId);
  assert(runtime, `Runtime ${instanceId} must exist.`);
  assertEqual(runtime.status, 'completion-pending', `${definition.id} should be pending completion.`);
  assert(runtime.completionCandidate, `${definition.id} should have evidence.`);
}

const quickscope = engine.getInstance(starterSandboxInstanceIds.quickscope);
assertEqual(
  quickscope?.completionCandidate?.triggerEventId,
  'starter-quickscope',
  'Quickscope should retain the qualifying guess as its trigger.'
);
assert(
  quickscope?.completionCandidate?.evidenceEventIds.includes('starter-round-1'),
  'Quickscope evidence should include the observed fresh round start.'
);

const ouch = engine.getInstance(starterSandboxInstanceIds.ouch);
assertEqual(
  ouch?.status,
  'active',
  'The former 449 ms fixture must no longer complete the 200 ms Ouch challenge.'
);

const sniper = engine.getInstance(starterSandboxInstanceIds.sniper);
assertEqual(sniper?.progress.current, 3, 'Sniper should count three clean rounds.');
assertEqual(
  (sniper?.internalState as { qualifyingEvents?: number }).qualifyingEvents,
  3,
  'Sniper internal progress should equal three qualifying rounds.'
);
assert(
  !(sniper?.completionCandidate?.evidenceEventIds.includes('starter-late-guess') ?? true),
  'The dirty second round must not be Sniper completion evidence.'
);
for (const evidenceId of [
  'starter-round-3',
  'starter-ouch-self',
  'starter-round-4',
  'starter-sniper-round-4-correct',
  'starter-round-5',
  'starter-sniper-round-5-correct'
]) {
  assert(
    sniper?.completionCandidate?.evidenceEventIds.includes(evidenceId),
    `Sniper evidence should include ${evidenceId}.`
  );
}

const tldr = engine.getInstance(starterSandboxInstanceIds.tldr);
assertEqual(
  (tldr?.internalState as { longestMessageLength?: number }).longestMessageLength,
  68,
  'TL;DR should count visible Unicode characters after trimming.'
);

const omgHacker = engine.getInstance(starterSandboxInstanceIds['omg-hacker']);
assertEqual(omgHacker?.progress.current, 5, 'OMG Hacker should count five consecutive first guesses.');
assertEqual(
  (omgHacker?.internalState as { qualifyingEvents?: number }).qualifyingEvents,
  5,
  'OMG Hacker internal progress should equal five first-guesser turns.'
);
for (let index = 1; index <= 5; index += 1) {
  assert(
    omgHacker?.completionCandidate?.evidenceEventIds.includes(`omg-hacker-turn-${index}-first`),
    `OMG Hacker evidence should include first guess ${index}.`
  );
}


const fanboy = engine.getInstance(starterSandboxInstanceIds.fanboy);
assertEqual(fanboy?.status, 'active', 'Fanboy must not complete without a fully observed game and GAME_ENDED boundary.');


const inAndOut = engine.getInstance(starterSandboxInstanceIds['in-and-out']);
assertEqual(inAndOut?.progress.current, 3, 'In and out should count three completed join/leave pairs.');
assertEqual(
  (inAndOut?.internalState as { completedPlayerIds?: number[] }).completedPlayerIds?.length,
  3,
  'In and out should retain three distinct completed players.'
);
assert(
  !(inAndOut?.completionCandidate?.evidenceEventIds.includes('in-out-unseen-leave') ?? true),
  'A player leaving without an observed join must not count for In and out.'
);
assert(
  !(inAndOut?.completionCandidate?.evidenceEventIds.includes('in-out-player-391-join-duplicate') ?? true),
  'A duplicate join must not become In and out evidence.'
);
for (const playerId of [391, 392, 393]) {
  for (const suffix of ['join', 'leave']) {
    const evidenceId = `in-out-player-${playerId}-${suffix}`;
    assert(
      inAndOut?.completionCandidate?.evidenceEventIds.includes(evidenceId),
      `In and out evidence should include ${evidenceId}.`
    );
  }
}

const picasso = engine.getInstance(starterSandboxInstanceIds.picasso);
assertEqual(picasso?.status, 'active', 'Picasso now requires four simultaneous unique likes.');



const copyAndPaste = engine.getInstance(starterSandboxInstanceIds['copy-and-paste']);
assertEqual(copyAndPaste?.progress.current, 3, 'Copy + Paste should count three distinct guessers within the first ten seconds after the drawing starts.');
assert(
  copyAndPaste?.completionCandidate?.evidenceEventIds.includes('copy-paste-own-round-start'),
  'Copy + Paste evidence should include the observed drawing-turn start.'
);
for (const eventId of ['copy-paste-guess-1', 'copy-paste-guess-2', 'copy-paste-guess-3']) {
  assert(
    copyAndPaste?.completionCandidate?.evidenceEventIds.includes(eventId),
    `Copy + Paste evidence should include ${eventId}.`
  );
}

const caughtIn4k = engine.getInstance(starterSandboxInstanceIds['caught-in-4k']);
assertEqual(caughtIn4k?.progress.current, 1, 'Caught in 4k should complete when the local player wins at exactly 4000 or higher.');
assertEqual(
  (caughtIn4k?.internalState as { latestSelfScore?: number }).latestSelfScore,
  4000,
  'Caught in 4k should retain the final self score.'
);
assert(
  caughtIn4k?.completionCandidate?.evidenceEventIds.includes('caught-in-4k-game-ended'),
  'Caught in 4k evidence should include GAME_ENDED.'
);


const ownerOfTheLobby = engine.getInstance(starterSandboxInstanceIds['owner-of-the-lobby']);
assertEqual(ownerOfTheLobby?.progress.current, 1, 'Owner of the Lobby should complete after own private lobby creation.');
for (const eventId of ['owner-private-create-request', 'owner-private-hydrated']) {
  assert(
    ownerOfTheLobby?.completionCandidate?.evidenceEventIds.includes(eventId),
    `Owner of the Lobby evidence should include ${eventId}.`
  );
}

const favoriteRed = engine.getInstance(starterSandboxInstanceIds['my-favorite-color-is-red']);
assertEqual(favoriteRed?.progress.current, 1, 'My favorite color is Red should complete after red randomization, login and public hydration.');
for (const eventId of ['red-avatar-randomized', 'red-avatar-login-confirmed', 'red-public-lobby-hydrated']) {
  assert(
    favoriteRed?.completionCandidate?.evidenceEventIds.includes(eventId),
    `My favorite color is Red evidence should include ${eventId}.`
  );
}





const throughThickAndThin = engine.getInstance(starterSandboxInstanceIds['through-thick-and-thin']);
assertEqual(throughThickAndThin?.progress.current, 5, 'Through Thick and Thin should count all five official brush sizes.');
assertEqual(
  (throughThickAndThin?.internalState as { usedBrushSizes?: number[] }).usedBrushSizes?.join(','),
  '4,10,20,32,40',
  'Through Thick and Thin should retain the five official brush sizes in ascending order.'
);
for (const eventId of [
  'drawing-brush-xs-red',
  'drawing-brush-s-dark-red',
  'drawing-brush-m-orange-yellow',
  'drawing-brush-l-green',
  'drawing-brush-xl-blue'
]) {
  assert(
    throughThickAndThin?.completionCandidate?.evidenceEventIds.includes(eventId),
    `Through Thick and Thin evidence should include ${eventId}.`
  );
}

const colorPicker = engine.getInstance(starterSandboxInstanceIds['color-picker']);
assertEqual(colorPicker?.status, 'active', 'Color Picker now requires all 26 palette colors and every eligible guesser.');


const needSomeSpace = engine.getInstance(starterSandboxInstanceIds['need-some-space']);
assertEqual(needSomeSpace?.progress.current, 1, 'Need some space? should complete for a correctly guessed multi-word term.');
assert(
  needSomeSpace?.completionCandidate?.evidenceEventIds.includes('need-some-space-correct'),
  'Need some space? evidence should include the qualifying multi-word guess.'
);

const alliteration = engine.getInstance(starterSandboxInstanceIds.alliteration);
assertEqual(alliteration?.progress.current, 1, 'Alliteration should complete when Alpha correctly guesses Atlantis.');
assert(
  alliteration?.completionCandidate?.evidenceEventIds.includes('starter-late-guess'),
  'Alliteration evidence should include the qualifying same-initial guess.'
);


const isThatAMod = engine.getInstance(starterSandboxInstanceIds['is-that-a-mod']);
assertEqual(isThatAMod?.progress.current, 1, 'Is ThAT a MoD? should complete after a clicked special avatar remains stable.');
for (const eventId of ['home-logo-avatar-click', 'home-special-avatar-stable']) {
  assert(
    isThatAMod?.completionCandidate?.evidenceEventIds.includes(eventId),
    `Is ThAT a MoD? evidence should include ${eventId}.`
  );
}

const bloodline = engine.getInstance(starterSandboxInstanceIds.bloodline);
assertEqual(bloodline?.progress.current, 1, 'Bloodline should complete after a homepage Credits click finishes loading.');
assert(
  bloodline?.completionCandidate?.evidenceEventIds.includes('bloodline-credits-opened'),
  'Bloodline evidence should include the fully loaded Credits page event.'
);

const myEyes = engine.getInstance(starterSandboxInstanceIds['my-eyes-are-bleeding']);
assertEqual(myEyes?.progress.current, 1, 'My eyes are bleeding should complete after another player uses a configured insult keyword.');
assertEqual(
  (myEyes?.internalState as { matchedKeyword?: string }).matchedKeyword,
  'idiot',
  'My eyes are bleeding should retain the matched normalized keyword.'
);
assert(
  myEyes?.completionCandidate?.evidenceEventIds.includes('my-eyes-insult-message'),
  'My eyes are bleeding evidence should include the qualifying chat message.'
);

// Copy + Paste regression: all three correct guesses must occur within ten seconds of ROUND_STARTED.
const copyRegression = new ChallengeEngine({ autoPersist: false });
copyRegression.register(copyAndPasteDefinition);
copyRegression.activate({ instanceId: 'copy-regression', challengeId: 'copy-and-paste' });
const copyStart = fixture.events.find(entry => entry.event.eventId === 'copy-paste-own-round-start')?.event;
const copyGuess1 = fixture.events.find(entry => entry.event.eventId === 'copy-paste-guess-1')?.event;
const copyGuess2 = fixture.events.find(entry => entry.event.eventId === 'copy-paste-guess-2')?.event;
const copyGuess3 = fixture.events.find(entry => entry.event.eventId === 'copy-paste-guess-3')?.event;
assert(copyStart && copyGuess1 && copyGuess2 && copyGuess3, 'Copy + Paste fixture events must exist.');
copyRegression.process(structuredClone(copyStart));
copyRegression.process(structuredClone(copyGuess1));
copyRegression.process(structuredClone(copyGuess2));
const lateThirdGuess = structuredClone(copyGuess3) as TelemetryEvent;
lateThirdGuess.eventId = 'copy-paste-late-third';
if (lateThirdGuess.type !== 'CORRECT_GUESS') throw new Error('Expected CORRECT_GUESS.');
lateThirdGuess.payload.elapsedMs = 16001;
copyRegression.process(lateThirdGuess);
assertEqual(copyRegression.getInstance('copy-regression')?.progress.current, 2, 'A third guess after ten seconds from ROUND_STARTED must not complete Copy + Paste.');
const copyRegressionValid = new ChallengeEngine({ autoPersist: false });
copyRegressionValid.register(copyAndPasteDefinition);
copyRegressionValid.activate({ instanceId: 'copy-regression-valid', challengeId: 'copy-and-paste' });
copyRegressionValid.process(structuredClone(copyStart));
copyRegressionValid.process(structuredClone(copyGuess1));
copyRegressionValid.process(structuredClone(copyGuess2));
copyRegressionValid.process(structuredClone(copyGuess3));
assertEqual(copyRegressionValid.getInstance('copy-regression-valid')?.status, 'completion-pending', 'Three distinct guessers within the first nine seconds should complete Copy + Paste.');


const copyLateCluster = new ChallengeEngine({ autoPersist: false });
copyLateCluster.register(copyAndPasteDefinition);
copyLateCluster.activate({ instanceId: 'copy-late-cluster', challengeId: 'copy-and-paste' });
copyLateCluster.process(structuredClone(copyStart));
for (const [source, elapsedMs, eventId] of [
  [copyGuess1, 12000, 'copy-late-cluster-1'],
  [copyGuess2, 16000, 'copy-late-cluster-2'],
  [copyGuess3, 20000, 'copy-late-cluster-3']
] as const) {
  const event = structuredClone(source) as TelemetryEvent;
  event.eventId = eventId;
  if (event.type !== 'CORRECT_GUESS') throw new Error('Expected CORRECT_GUESS.');
  event.payload.elapsedMs = elapsedMs;
  copyLateCluster.process(event);
}
assertEqual(
  copyLateCluster.getInstance('copy-late-cluster')?.progress.current,
  0,
  'Guesses close to each other but all later than ten seconds after ROUND_STARTED must not count.'
);

// Caught in 4k regression: reaching exactly 4000 before GAME_ENDED is insufficient, but GAME_ENDED at 4000 completes.
const caughtRegression = new ChallengeEngine({ autoPersist: false });
caughtRegression.register(caughtIn4kDefinition);
caughtRegression.activate({ instanceId: 'caught-regression', challengeId: 'caught-in-4k' });
const caughtScore = fixture.events.find(entry => entry.event.eventId === 'caught-in-4k-self-score')?.event;
const caughtEnd = fixture.events.find(entry => entry.event.eventId === 'caught-in-4k-game-ended')?.event;
assert(caughtScore && caughtEnd, 'Caught in 4k fixture events must exist.');
caughtRegression.process(structuredClone(caughtScore));
assertEqual(caughtRegression.getInstance('caught-regression')?.status, 'active', 'A score of exactly 4000 must not complete before GAME_ENDED.');
caughtRegression.process(structuredClone(caughtEnd));
assertEqual(caughtRegression.getInstance('caught-regression')?.status, 'completion-pending', 'GAME_ENDED with the winning score at exactly 4000 should complete Caught in 4k.');

const caughtSecondPlace = new ChallengeEngine({ autoPersist: false });
caughtSecondPlace.register(caughtIn4kDefinition);
caughtSecondPlace.activate({ instanceId: 'caught-second-place', challengeId: 'caught-in-4k' });
caughtSecondPlace.process(structuredClone(caughtScore));
const secondPlaceEnd = structuredClone(caughtEnd) as TelemetryEvent;
secondPlaceEnd.eventId = 'caught-in-4k-second-place-end';
if (secondPlaceEnd.type !== 'GAME_ENDED') throw new Error('Expected GAME_ENDED.');
secondPlaceEnd.payload.finalScores = [
  { playerId: 21, totalScore: 4000, roundScore: 100 },
  { playerId: 17, totalScore: 4700, roundScore: 500 }
];
caughtSecondPlace.process(secondPlaceEnd);
assertEqual(
  caughtSecondPlace.getInstance('caught-second-place')?.status,
  'active',
  'Second place with 4000 or more must not complete Caught in 4k.'
);

// Fanboy regression: isolated likes cannot complete without a fully observed game.
const fanboyRegression = new ChallengeEngine({ autoPersist: false });
fanboyRegression.register(fanboyDefinition);
fanboyRegression.activate({ instanceId: 'fanboy-regression', challengeId: 'fanboy' });
const fanboyLike1 = fixture.events.find(entry => entry.event.eventId === 'fanboy-like-turn-1')?.event;
const fanboyDuplicate = fixture.events.find(entry => entry.event.eventId === 'fanboy-like-turn-1-duplicate')?.event;
const fanboyLike2 = fixture.events.find(entry => entry.event.eventId === 'fanboy-like-turn-2')?.event;
const fanboyLike3 = fixture.events.find(entry => entry.event.eventId === 'fanboy-like-turn-3')?.event;
assert(fanboyLike1 && fanboyDuplicate && fanboyLike2 && fanboyLike3, 'Fanboy fixture events must exist.');
fanboyRegression.process(structuredClone(fanboyLike1));
fanboyRegression.process(structuredClone(fanboyDuplicate));
assertEqual(
  fanboyRegression.getInstance('fanboy-regression')?.progress.current,
  0,
  'Likes without GAME_STARTING and ROUND_STARTED context must not count.'
);
const selfDrawingLike = structuredClone(fanboyLike2) as TelemetryEvent;
selfDrawingLike.eventId = 'fanboy-self-drawing-like';
selfDrawingLike.context.drawerId = selfDrawingLike.context.meId;
fanboyRegression.process(selfDrawingLike);
assertEqual(
  fanboyRegression.getInstance('fanboy-regression')?.progress.current,
  0,
  "A like during the user's own drawing turn must not count."
);
fanboyRegression.process(structuredClone(fanboyLike2));
fanboyRegression.process(structuredClone(fanboyLike3));
assertEqual(
  fanboyRegression.getInstance('fanboy-regression')?.status,
  'active',
  'Three isolated likes must not complete the complete-game Fanboy challenge.'
);


// In and out regression: only a player whose join was observed may complete a pair.
const inAndOutRegression = new ChallengeEngine({ autoPersist: false });
inAndOutRegression.register(inAndOutDefinition);
inAndOutRegression.activate({ instanceId: 'in-and-out-regression', challengeId: 'in-and-out' });
const inOutJoin391 = fixture.events.find(entry => entry.event.eventId === 'in-out-player-391-join')?.event;
const inOutLeave391 = fixture.events.find(entry => entry.event.eventId === 'in-out-player-391-leave')?.event;
const inOutUnseenLeave = fixture.events.find(entry => entry.event.eventId === 'in-out-unseen-leave')?.event;
assert(inOutJoin391 && inOutLeave391 && inOutUnseenLeave, 'In and out fixture events must exist.');
inAndOutRegression.process(structuredClone(inOutUnseenLeave));
assertEqual(
  inAndOutRegression.getInstance('in-and-out-regression')?.progress.current,
  0,
  'An unpaired leave must not count.'
);
inAndOutRegression.process(structuredClone(inOutJoin391));
inAndOutRegression.process(structuredClone(inOutLeave391));
assertEqual(
  inAndOutRegression.getInstance('in-and-out-regression')?.progress.current,
  1,
  'An observed join followed by that player leaving should count once.'
);

// Picasso regression: likes are unique and current, not cumulative.
const picassoRegression = new ChallengeEngine({ autoPersist: false });
picassoRegression.register(picassoDefinition);
picassoRegression.activate({ instanceId: 'picasso-regression', challengeId: 'picasso' });
for (const eventId of [
  'picasso-own-round-start',
  'picasso-like-401',
  'picasso-like-401-duplicate',
  'picasso-like-402',
  'picasso-dislike-401',
  'picasso-like-403'
]) {
  const sourceEvent = fixture.events.find(entry => entry.event.eventId === eventId)?.event;
  assert(sourceEvent, `Picasso event ${eventId} must exist.`);
  picassoRegression.process(structuredClone(sourceEvent));
}
assertEqual(
  picassoRegression.getInstance('picasso-regression')?.progress.current,
  2,
  'After one like is removed, Picasso should have only two current likes.'
);
const picassoLike404 = fixture.events.find(entry => entry.event.eventId === 'picasso-like-404')?.event;
assert(picassoLike404, 'Final Picasso like must exist.');
picassoRegression.process(structuredClone(picassoLike404));
assertEqual(
  picassoRegression.getInstance('picasso-regression')?.status,
  'active',
  'Three current unique likes must remain below the new Picasso target of four.'
);



// Need some space? regression: hyphens alone do not count, but a literal internal space does.
const needSpaceRegression = new ChallengeEngine({ autoPersist: false });
needSpaceRegression.register(needSomeSpaceDefinition);
needSpaceRegression.activate({ instanceId: 'need-space-regression', challengeId: 'need-some-space' });
const needSpaceSource = fixture.events.find(entry => entry.event.eventId === 'need-some-space-correct')?.event;
assert(needSpaceSource, 'Need some space? fixture event must exist.');
const hyphenOnly = structuredClone(needSpaceSource) as TelemetryEvent;
hyphenOnly.eventId = 'need-space-hyphen-only';
if (hyphenOnly.type !== 'CORRECT_GUESS') throw new Error('Expected CORRECT_GUESS.');
hyphenOnly.payload.word = 'New-York';
needSpaceRegression.process(hyphenOnly);
assertEqual(needSpaceRegression.getInstance('need-space-regression')?.progress.current, 0, 'A hyphen without a literal space must not count.');
needSpaceRegression.process(structuredClone(needSpaceSource));
assertEqual(needSpaceRegression.getInstance('need-space-regression')?.status, 'completion-pending', 'A correctly guessed word with an internal space should count.');

// Alliteration regression: comparison is case-insensitive and accent-insensitive, but different initials fail.
const alliterationRegression = new ChallengeEngine({ autoPersist: false });
alliterationRegression.register(alliterationDefinition);
alliterationRegression.activate({ instanceId: 'alliteration-regression', challengeId: 'alliteration' });
const alliterationSource = fixture.events.find(entry => entry.event.eventId === 'starter-late-guess')?.event;
assert(alliterationSource, 'Alliteration fixture event must exist.');
const wrongInitial = structuredClone(alliterationSource) as TelemetryEvent;
wrongInitial.eventId = 'alliteration-wrong-initial';
if (wrongInitial.type !== 'CORRECT_GUESS') throw new Error('Expected CORRECT_GUESS.');
wrongInitial.payload.word = 'Banane';
alliterationRegression.process(wrongInitial);
assertEqual(alliterationRegression.getInstance('alliteration-regression')?.progress.current, 0, 'Different initials must not count.');
const accentMatch = structuredClone(alliterationSource) as TelemetryEvent;
accentMatch.eventId = 'alliteration-accent-match';
if (accentMatch.type !== 'CORRECT_GUESS') throw new Error('Expected CORRECT_GUESS.');
accentMatch.actor = { playerId: 21, name: 'Älpha', isSelf: true };
accentMatch.payload.word = 'Apfel';
alliterationRegression.process(accentMatch);
assertEqual(alliterationRegression.getInstance('alliteration-regression')?.status, 'completion-pending', 'Ä and A should match after normalization.');


// Regression: joining a round already in progress must not allow Quickscope.
const quickscopeRegression = new ChallengeEngine({ autoPersist: false });
quickscopeRegression.register(quickscopeDefinition);
quickscopeRegression.activate({ instanceId: 'quickscope-regression', challengeId: 'quickscope' });

const quickscopeGuess = fixture.events.find(entry => entry.event.eventId === 'starter-quickscope')?.event;
const roundStart = fixture.events.find(entry => entry.event.eventId === 'starter-round-1')?.event;
assert(quickscopeGuess && roundStart, 'Regression fixture events must exist.');

const midRoundGuess = structuredClone(quickscopeGuess) as TelemetryEvent;
midRoundGuess.eventId = 'quickscope-mid-round-join-guess';
midRoundGuess.context.roundSessionId = 'already-running-round';
quickscopeRegression.process(midRoundGuess);
assertEqual(
  quickscopeRegression.getInstance('quickscope-regression')?.status,
  'active',
  'A qualifying time must not count without an observed ROUND_STARTED event.'
);

const freshRoundStart = structuredClone(roundStart) as TelemetryEvent;
freshRoundStart.eventId = 'quickscope-fresh-round-start';
freshRoundStart.context.roundSessionId = 'fresh-round';
quickscopeRegression.process(freshRoundStart);

const freshRoundGuess = structuredClone(quickscopeGuess) as TelemetryEvent;
freshRoundGuess.eventId = 'quickscope-fresh-round-guess';
freshRoundGuess.context.roundSessionId = 'fresh-round';
quickscopeRegression.process(freshRoundGuess);
assertEqual(
  quickscopeRegression.getInstance('quickscope-regression')?.status,
  'completion-pending',
  'Quickscope should complete after the fresh round start was observed.'
);

// Regression: Ouch cannot complete if the client missed the first guesser.
const ouchRegression = new ChallengeEngine({ autoPersist: false });
ouchRegression.register(ouchDefinition);
ouchRegression.activate({ instanceId: 'ouch-regression', challengeId: 'ouch' });
const round3 = fixture.events.find(entry => entry.event.eventId === 'starter-round-3')?.event;
const selfOuchGuess = fixture.events.find(entry => entry.event.eventId === 'starter-ouch-self')?.event;
const firstGuess = fixture.events.find(entry => entry.event.eventId === 'starter-ouch-first')?.event;
assert(round3 && selfOuchGuess && firstGuess, 'Ouch fixture events must exist.');
ouchRegression.process(structuredClone(round3));
ouchRegression.process(structuredClone(selfOuchGuess));
assertEqual(
  ouchRegression.getInstance('ouch-regression')?.status,
  'active',
  'Ouch must not complete without observing the first-guesser baseline.'
);
ouchRegression.process(structuredClone(firstGuess));
const secondSelfGuess = structuredClone(selfOuchGuess) as TelemetryEvent;
secondSelfGuess.eventId = 'ouch-regression-self-after-baseline';
secondSelfGuess.occurredAt = firstGuess.occurredAt + 200;
secondSelfGuess.monotonicMs = firstGuess.monotonicMs + 200;
if (secondSelfGuess.type !== 'CORRECT_GUESS' || firstGuess.type !== 'FIRST_GUESS') throw new Error('Expected Ouch guess events.');
secondSelfGuess.payload.elapsedMs = (firstGuess.payload.elapsedMs ?? 0) + 200;
ouchRegression.process(secondSelfGuess);
assertEqual(
  ouchRegression.getInstance('ouch-regression')?.status,
  'completion-pending',
  'Ouch should complete exactly 200 ms after the observed first guesser.'
);

// Sniper regression: any dirty round erases the entire clean-round streak.
const sniperRegression = new ChallengeEngine({ autoPersist: false });
sniperRegression.register(sniperDefinition);
sniperRegression.activate({ instanceId: 'sniper-regression', challengeId: 'sniper' });

const round2 = fixture.events.find(entry => entry.event.eventId === 'starter-round-2')?.event;
const dirtyCorrect = fixture.events.find(entry => entry.event.eventId === 'starter-late-guess')?.event;
const round4 = fixture.events.find(entry => entry.event.eventId === 'starter-round-4')?.event;
const cleanRound4Correct = fixture.events.find(
  entry => entry.event.eventId === 'starter-sniper-round-4-correct'
)?.event;
const round5 = fixture.events.find(entry => entry.event.eventId === 'starter-round-5')?.event;
const cleanRound5Correct = fixture.events.find(
  entry => entry.event.eventId === 'starter-sniper-round-5-correct'
)?.event;
assert(
  round2 && dirtyCorrect && round4 && cleanRound4Correct && round5 && cleanRound5Correct,
  'Sniper fixture events must exist.'
);

sniperRegression.process(structuredClone(roundStart));
sniperRegression.process(structuredClone(quickscopeGuess));
assertEqual(
  sniperRegression.getInstance('sniper-regression')?.progress.current,
  1,
  'The first clean round should count for Sniper.'
);

const explicitWrongGuess = {
  ...structuredClone(dirtyCorrect),
  eventId: 'sniper-explicit-wrong-guess',
  type: 'WRONG_GUESS',
  payload: {
    playerId: 21,
    message: 'falscheswort',
    wrongGuessCountThisRound: 1
  }
} as TelemetryEvent;

sniperRegression.process(structuredClone(round2));
sniperRegression.process(explicitWrongGuess);
assertEqual(
  sniperRegression.getInstance('sniper-regression')?.progress.current,
  0,
  'An explicit wrong guess must immediately erase all Sniper progress.'
);
sniperRegression.process(structuredClone(dirtyCorrect));
assertEqual(
  sniperRegression.getInstance('sniper-regression')?.progress.current,
  0,
  'The later correct guess from the dirty round must not restart Sniper progress.'
);

sniperRegression.process(structuredClone(round3));
sniperRegression.process(structuredClone(selfOuchGuess));
assertEqual(
  sniperRegression.getInstance('sniper-regression')?.progress.current,
  1,
  'The first clean round after the reset should restart Sniper at one.'
);

sniperRegression.process(structuredClone(round4));
sniperRegression.process(structuredClone(cleanRound4Correct));
assertEqual(
  sniperRegression.getInstance('sniper-regression')?.progress.current,
  2,
  'The second clean round after the reset should reach two.'
);

sniperRegression.process(structuredClone(round5));
sniperRegression.process(structuredClone(cleanRound5Correct));
assertEqual(
  sniperRegression.getInstance('sniper-regression')?.status,
  'completion-pending',
  'Sniper should complete only after three new clean rounds following the reset.'
);

// Sniper must not count a correct guess from a round whose start was missed.
const sniperMidRoundRegression = new ChallengeEngine({ autoPersist: false });
sniperMidRoundRegression.register(sniperDefinition);
sniperMidRoundRegression.activate({ instanceId: 'sniper-mid-round', challengeId: 'sniper' });
const midRoundCleanGuess = structuredClone(cleanRound4Correct) as TelemetryEvent;
midRoundCleanGuess.eventId = 'sniper-mid-round-clean-guess';
midRoundCleanGuess.context.roundSessionId = 'missed-round-start';
sniperMidRoundRegression.process(midRoundCleanGuess);
assertEqual(
  sniperMidRoundRegression.getInstance('sniper-mid-round')?.progress.current,
  0,
  'Sniper must ignore rounds whose ROUND_STARTED event was not observed.'
);



// Live regression: multiple drawing turns within the same visible server round
// must still count as three different Sniper turns, and placement is irrelevant.
const sameServerRoundSniper = new ChallengeEngine({ autoPersist: false });
sameServerRoundSniper.register(sniperDefinition);
sameServerRoundSniper.activate({ instanceId: 'sniper-same-server-round', challengeId: 'sniper' });

for (const [index, drawerId, position] of [
  [1, 164, 1],
  [2, 147, 4],
  [3, 118, 2]
] as const) {
  const start = structuredClone(roundStart) as TelemetryEvent;
  start.eventId = `sniper-live-turn-${index}-start`;
  start.context.roundIndex = 2;
  start.context.roundNumber = 3;
  start.context.roundSessionId = `sniper-live-turn-${index}`;
  start.context.drawerId = drawerId;
  (start.payload as { drawerId: number | null }).drawerId = drawerId;

  const correct = structuredClone(quickscopeGuess) as TelemetryEvent;
  correct.eventId = `sniper-live-turn-${index}-correct`;
  correct.context.roundIndex = 2;
  correct.context.roundNumber = 3;
  correct.context.roundSessionId = `sniper-live-turn-${index}`;
  correct.context.drawerId = drawerId;
  (correct.payload as { position: number | null }).position = position;
  (correct.payload as { isFirstGuesser: boolean }).isFirstGuesser = position === 1;
  (correct.payload as { wrongGuessesBeforeCorrect: number }).wrongGuessesBeforeCorrect = 0;

  sameServerRoundSniper.process(start);
  sameServerRoundSniper.process(correct);
}
assertEqual(
  sameServerRoundSniper.getInstance('sniper-same-server-round')?.status,
  'completion-pending',
  'Sniper must count three separate drawer turns even while roundNumber stays 3, regardless of guess placement.'
);

// Messages after a successful guess are normal chat and cannot erase progress.
const postSuccessChatSniper = new ChallengeEngine({ autoPersist: false });
postSuccessChatSniper.register(sniperDefinition);
postSuccessChatSniper.activate({ instanceId: 'sniper-post-success-chat', challengeId: 'sniper' });
postSuccessChatSniper.process(structuredClone(roundStart));
postSuccessChatSniper.process(structuredClone(quickscopeGuess));
const postSuccessWrongLikeEvent = {
  ...structuredClone(quickscopeGuess),
  eventId: 'sniper-post-success-chat-event',
  type: 'WRONG_GUESS',
  payload: {
    playerId: 21,
    message: 'normal chat after solving',
    wrongGuessCountThisRound: 1
  }
} as TelemetryEvent;
postSuccessChatSniper.process(postSuccessWrongLikeEvent);
assertEqual(
  postSuccessChatSniper.getInstance('sniper-post-success-chat')?.progress.current,
  1,
  'A message after the correct guess must not erase Sniper progress.'
);

// Own drawing turns are skipped rather than treated as missed guessing turns.
const skippedTurnSniper = new ChallengeEngine({ autoPersist: false });
skippedTurnSniper.register(sniperDefinition);
skippedTurnSniper.activate({ instanceId: 'sniper-skipped-turns', challengeId: 'sniper' });
skippedTurnSniper.process(structuredClone(roundStart));
skippedTurnSniper.process(structuredClone(quickscopeGuess));

const selfDrawingStart = structuredClone(round2) as TelemetryEvent;
selfDrawingStart.eventId = 'sniper-self-drawing-start';
selfDrawingStart.context.roundSessionId = 'sniper-self-drawing-turn';
selfDrawingStart.context.drawerId = selfDrawingStart.context.meId;
(selfDrawingStart.payload as { drawerId: number | null }).drawerId = selfDrawingStart.context.meId;
skippedTurnSniper.process(selfDrawingStart);

const selfDrawingEnd = {
  ...structuredClone(selfDrawingStart),
  eventId: 'sniper-self-drawing-end',
  type: 'ROUND_ENDED',
  payload: {
    previousStateId: 4,
    stateId: 5,
    stateName: 'ROUND_RESULTS',
    time: 3,
    roundIndex: 2,
    roundNumber: 3,
    maxRounds: 3,
    reason: 1,
    reasonName: 'TIME_UP',
    word: 'Test',
    scores: []
  }
} as TelemetryEvent;
skippedTurnSniper.process(selfDrawingEnd);
assertEqual(
  skippedTurnSniper.getInstance('sniper-skipped-turns')?.progress.current,
  1,
  'The local player drawing must leave existing Sniper progress untouched.'
);

// A turn interrupted because the active drawer left or was kicked is skipped.
const interruptedStart = structuredClone(round3) as TelemetryEvent;
interruptedStart.eventId = 'sniper-interrupted-start';
interruptedStart.context.roundSessionId = 'sniper-interrupted-turn';
interruptedStart.context.drawerId = 77;
(interruptedStart.payload as { drawerId: number | null }).drawerId = 77;
skippedTurnSniper.process(interruptedStart);
const drawerLeft = {
  ...structuredClone(interruptedStart),
  eventId: 'sniper-drawer-left',
  type: 'PLAYER_LEFT',
  actor: { playerId: 77, name: 'Drawer', isSelf: false },
  payload: {
    playerId: 77,
    player: null,
    reason: 1,
    reasonName: 'KICKED',
    wasDrawer: true
  }
} as TelemetryEvent;
skippedTurnSniper.process(drawerLeft);
const interruptedEnd = {
  ...structuredClone(selfDrawingEnd),
  eventId: 'sniper-interrupted-end',
  context: { ...structuredClone(interruptedStart.context) },
  payload: {
    ...structuredClone(selfDrawingEnd.payload),
    reason: 2,
    reasonName: 'DRAWER_LEFT'
  }
} as TelemetryEvent;
skippedTurnSniper.process(interruptedEnd);
assertEqual(
  skippedTurnSniper.getInstance('sniper-skipped-turns')?.progress.current,
  1,
  'A drawer-left/kick interruption must not erase Sniper progress.'
);

// A normal eligible turn that ends without a correct first attempt breaks the streak.
const unansweredSniper = new ChallengeEngine({ autoPersist: false });
unansweredSniper.register(sniperDefinition);
unansweredSniper.activate({ instanceId: 'sniper-unanswered', challengeId: 'sniper' });
unansweredSniper.process(structuredClone(roundStart));
unansweredSniper.process(structuredClone(quickscopeGuess));
const unansweredStart = structuredClone(round3) as TelemetryEvent;
unansweredStart.eventId = 'sniper-unanswered-start';
unansweredStart.context.roundSessionId = 'sniper-unanswered-turn';
unansweredStart.context.drawerId = 55;
(unansweredStart.payload as { drawerId: number | null }).drawerId = 55;
unansweredSniper.process(unansweredStart);
const unansweredEnd = {
  ...structuredClone(selfDrawingEnd),
  eventId: 'sniper-unanswered-end',
  context: { ...structuredClone(unansweredStart.context) }
} as TelemetryEvent;
unansweredSniper.process(unansweredEnd);
assertEqual(
  unansweredSniper.getInstance('sniper-unanswered')?.progress.current,
  0,
  'A normal guessing turn that ends unanswered must break the consecutive Sniper streak.'
);


// OMG Hacker regression: only consecutive first-correct placement matters.
const omgRegression = new ChallengeEngine({ autoPersist: false });
omgRegression.register(omgHackerDefinition);
omgRegression.activate({ instanceId: 'omg-hacker-regression', challengeId: 'omg-hacker' });

const firstGuessTemplate = fixture.events.find(
  entry => entry.event.eventId === 'omg-hacker-turn-1-first'
)?.event;
assert(firstGuessTemplate, 'OMG Hacker first-guess fixture event must exist.');

function processOmgTurn(
  engineInstance: ChallengeEngine,
  turnNumber: number,
  firstGuesserIsSelf: boolean,
  options: { selfDrawing?: boolean; interrupted?: boolean; endWithoutGuess?: boolean } = {}
): void {
  const turnId = `omg-regression-turn-${turnNumber}`;
  const start = structuredClone(roundStart) as TelemetryEvent;
  start.eventId = `${turnId}-start`;
  start.context.roundSessionId = turnId;
  start.context.drawerId = options.selfDrawing ? start.context.meId : 700 + turnNumber;
  (start.payload as { drawerId: number | null }).drawerId = start.context.drawerId;
  engineInstance.process(start);

  if (options.selfDrawing) return;

  if (options.interrupted) {
    const drawerLeft = {
      ...structuredClone(firstGuessTemplate),
      eventId: `${turnId}-drawer-left`,
      type: 'PLAYER_LEFT',
      actor: null,
      context: { ...structuredClone(start.context) },
      payload: {
        playerId: start.context.drawerId,
        player: null,
        reason: 1,
        reasonName: 'KICKED',
        wasDrawer: true
      }
    } as TelemetryEvent;
    engineInstance.process(drawerLeft);
    return;
  }

  if (options.endWithoutGuess) {
    const ended = {
      ...structuredClone(firstGuessTemplate),
      eventId: `${turnId}-ended`,
      type: 'ROUND_ENDED',
      actor: null,
      context: { ...structuredClone(start.context) },
      payload: {
        previousStateId: 4,
        stateId: 5,
        stateName: 'ROUND_RESULTS',
        time: 3,
        roundIndex: start.context.roundIndex,
        roundNumber: start.context.roundNumber,
        maxRounds: start.context.maxRounds,
        reason: 0,
        reasonName: 'TIME_UP',
        word: 'Test',
        scores: []
      }
    } as TelemetryEvent;
    engineInstance.process(ended);
    return;
  }

  const first = structuredClone(firstGuessTemplate) as Extract<TelemetryEvent, { type: 'FIRST_GUESS' }>;
  first.eventId = `${turnId}-first`;
  first.context = { ...structuredClone(start.context) };
  first.actor = firstGuesserIsSelf
    ? { playerId: 21, name: 'Alpha', isSelf: true }
    : { playerId: 22, name: 'Opponent', isSelf: false };
  first.payload.playerId = firstGuesserIsSelf ? 21 : 22;
  first.payload.position = 1;
  first.payload.isFirstGuesser = true;
  // Earlier wrong attempts do not disqualify OMG Hacker.
  first.payload.wrongGuessesBeforeCorrect = firstGuesserIsSelf ? 2 : 0;
  engineInstance.process(first);
}

processOmgTurn(omgRegression, 1, true);
processOmgTurn(omgRegression, 2, true);
assertEqual(
  omgRegression.getInstance('omg-hacker-regression')?.progress.current,
  2,
  'Two consecutive self first guesses should produce 2/5.'
);
processOmgTurn(omgRegression, 3, false);
assertEqual(
  omgRegression.getInstance('omg-hacker-regression')?.progress.current,
  0,
  'Another player becoming first guesser must erase the whole OMG Hacker streak.'
);

processOmgTurn(omgRegression, 4, true);
processOmgTurn(omgRegression, 5, false, { selfDrawing: true });
processOmgTurn(omgRegression, 6, false, { interrupted: true });
assertEqual(
  omgRegression.getInstance('omg-hacker-regression')?.progress.current,
  1,
  'Self drawing and interrupted drawer turns must preserve the current streak.'
);

for (let turn = 7; turn <= 10; turn += 1) {
  processOmgTurn(omgRegression, turn, true);
}
assertEqual(
  omgRegression.getInstance('omg-hacker-regression')?.status,
  'completion-pending',
  'Five eligible self first guesses, with neutral skipped turns between them, should complete OMG Hacker.'
);

const missedOmg = new ChallengeEngine({ autoPersist: false });
missedOmg.register(omgHackerDefinition);
missedOmg.activate({ instanceId: 'omg-hacker-missed', challengeId: 'omg-hacker' });
processOmgTurn(missedOmg, 1, true);
processOmgTurn(missedOmg, 2, false, { endWithoutGuess: true });
assertEqual(
  missedOmg.getInstance('omg-hacker-missed')?.progress.current,
  0,
  'A normally ended eligible turn without a self first guess must reset OMG Hacker.'
);



// Owner regression: joining another private lobby without a create request must not count.
const ownerRegression = new ChallengeEngine({ autoPersist: false });
ownerRegression.register(ownerOfTheLobbyDefinition);
ownerRegression.activate({ instanceId: 'owner-regression', challengeId: 'owner-of-the-lobby' });
const ownerReady = fixture.events.find(entry => entry.event.eventId === 'owner-private-hydrated')?.event;
assert(ownerReady, 'Owner private-lobby hydration event must exist.');
ownerRegression.process(structuredClone(ownerReady));
assertEqual(ownerRegression.getInstance('owner-regression')?.progress.current, 0, 'Private-lobby ready without own create request must not count.');


const ownerWrongOwner = new ChallengeEngine({ autoPersist: false });
ownerWrongOwner.register(ownerOfTheLobbyDefinition);
ownerWrongOwner.activate({ instanceId: 'owner-wrong-owner', challengeId: 'owner-of-the-lobby' });
const ownerCreate = fixture.events.find(entry => entry.event.eventId === 'owner-private-create-request')?.event;
assert(ownerCreate, 'Owner create request must exist.');
ownerWrongOwner.process(structuredClone(ownerCreate));
const foreignOwnerHydration = structuredClone(ownerReady) as TelemetryEvent;
foreignOwnerHydration.eventId = 'owner-private-foreign-owner';
if (foreignOwnerHydration.type !== 'LOBBY_HYDRATED') throw new Error('Expected LOBBY_HYDRATED.');
foreignOwnerHydration.payload.ownerId = 99;
ownerWrongOwner.process(foreignOwnerHydration);
assertEqual(ownerWrongOwner.getInstance('owner-wrong-owner')?.progress.current, 0, 'A private lobby owned by someone else must not count.');

const myEyesRegression = new ChallengeEngine({ autoPersist: false });
myEyesRegression.register(myEyesAreBleedingDefinition);
myEyesRegression.activate({ instanceId: 'my-eyes-regression', challengeId: 'my-eyes-are-bleeding' });
const insultEvent = fixture.events.find(entry => entry.event.eventId === 'my-eyes-insult-message')?.event;
assert(insultEvent, 'My eyes insult event must exist.');
const harmlessMessage = structuredClone(insultEvent) as TelemetryEvent;
harmlessMessage.eventId = 'my-eyes-harmless-message';
if (harmlessMessage.type !== 'CHAT_MESSAGE_RECEIVED') throw new Error('Expected CHAT_MESSAGE_RECEIVED.');
harmlessMessage.payload.message = 'das ist eine normale Nachricht';
myEyesRegression.process(harmlessMessage);
assertEqual(myEyesRegression.getInstance('my-eyes-regression')?.progress.current, 0, 'A harmless message must not count.');
const selfInsult = structuredClone(insultEvent) as TelemetryEvent;
selfInsult.eventId = 'my-eyes-self-message';
if (selfInsult.type !== 'CHAT_MESSAGE_RECEIVED') throw new Error('Expected CHAT_MESSAGE_RECEIVED.');
selfInsult.actor = { playerId: 21, name: 'Alpha', isSelf: true };
selfInsult.payload.playerId = 21;
myEyesRegression.process(selfInsult);
assertEqual(myEyesRegression.getInstance('my-eyes-regression')?.progress.current, 0, 'The local player insulting someone must not count.');
myEyesRegression.process(structuredClone(insultEvent));
assertEqual(myEyesRegression.getInstance('my-eyes-regression')?.status, 'completion-pending', 'Another player using an insult keyword should complete My eyes are bleeding.');

// Red-avatar regression: an already-red login without observed randomization must not count.
const redRegression = new ChallengeEngine({ autoPersist: false });
redRegression.register(myFavoriteColorIsRedDefinition);
redRegression.activate({ instanceId: 'red-regression', challengeId: 'my-favorite-color-is-red' });
const redLogin = fixture.events.find(entry => entry.event.eventId === 'red-avatar-login-confirmed')?.event;
const redHydrated = fixture.events.find(entry => entry.event.eventId === 'red-public-lobby-hydrated')?.event;
assert(redLogin && redHydrated, 'Red-avatar login and hydration events must exist.');
redRegression.process(structuredClone(redLogin));
redRegression.process(structuredClone(redHydrated));
assertEqual(redRegression.getInstance('red-regression')?.progress.current, 0, 'A red login without observed randomization must not count.');



// Drawing challenge regressions: only outgoing commands during the local player's own drawing turn count.
const drawingRoundStart = fixture.events.find(entry => entry.event.eventId === 'drawing-challenges-own-round-start')?.event;
const brushXs = fixture.events.find(entry => entry.event.eventId === 'drawing-brush-xs-red')?.event;
const brushS = fixture.events.find(entry => entry.event.eventId === 'drawing-brush-s-dark-red')?.event;
const brushM = fixture.events.find(entry => entry.event.eventId === 'drawing-brush-m-orange-yellow')?.event;
const brushL = fixture.events.find(entry => entry.event.eventId === 'drawing-brush-l-green')?.event;
const brushXl = fixture.events.find(entry => entry.event.eventId === 'drawing-brush-xl-blue')?.event;
assert(drawingRoundStart && brushXs && brushS && brushM && brushL && brushXl, 'Drawing challenge fixture events must exist.');

const thickRegression = new ChallengeEngine({ autoPersist: false });
thickRegression.register(throughThickAndThinDefinition);
thickRegression.activate({ instanceId: 'thick-regression', challengeId: 'through-thick-and-thin' });
thickRegression.process(structuredClone(drawingRoundStart));
for (const event of [brushXs, brushS, brushM, brushL]) thickRegression.process(structuredClone(event));
assertEqual(thickRegression.getInstance('thick-regression')?.progress.current, 4, 'Four distinct brush sizes should produce 4/5.');
const duplicateMedium = structuredClone(brushM) as TelemetryEvent;
duplicateMedium.eventId = 'drawing-duplicate-medium';
thickRegression.process(duplicateMedium);
assertEqual(thickRegression.getInstance('thick-regression')?.progress.current, 4, 'A repeated brush size must not add progress.');
thickRegression.process(structuredClone(brushXl));
assertEqual(thickRegression.getInstance('thick-regression')?.status, 'completion-pending', 'The fifth official brush size should complete Through Thick and Thin.');

const thickForeign = new ChallengeEngine({ autoPersist: false });
thickForeign.register(throughThickAndThinDefinition);
thickForeign.activate({ instanceId: 'thick-foreign', challengeId: 'through-thick-and-thin' });
const foreignStart = structuredClone(drawingRoundStart) as TelemetryEvent;
foreignStart.eventId = 'drawing-foreign-start';
foreignStart.context.drawerId = 99;
if (foreignStart.type !== 'ROUND_STARTED') throw new Error('Expected ROUND_STARTED.');
foreignStart.payload.drawerId = 99;
thickForeign.process(foreignStart);
for (const source of [brushXs, brushS, brushM, brushL, brushXl]) {
  const event = structuredClone(source) as TelemetryEvent;
  event.eventId = `${source.eventId}-foreign`;
  event.context.drawerId = 99;
  thickForeign.process(event);
}
assertEqual(thickForeign.getInstance('thick-foreign')?.progress.current, 0, 'Commands during another player\'s drawing must not count.');

const colorRegression = new ChallengeEngine({ autoPersist: false });
colorRegression.register(colorPickerDefinition);
colorRegression.activate({ instanceId: 'color-regression', challengeId: 'color-picker' });
colorRegression.process(structuredClone(drawingRoundStart));
colorRegression.process(structuredClone(brushXs));
colorRegression.process(structuredClone(brushS));
assert(
  (colorRegression.getInstance('color-regression')?.progress.current ?? 0) >= 2,
  'Distinct palette IDs must count independently.'
);
const whiteOnly = structuredClone(brushXs) as TelemetryEvent;
whiteOnly.eventId = 'drawing-white-only';
if (whiteOnly.type !== 'DRAW_COMMAND_BATCH_SUBMITTED') throw new Error('Expected draw batch.');
whiteOnly.payload = {
  commandCount: 1,
  tools: [0],
  colors: [0],
  brushSizes: [4],
  commands: [{ kind: 'PENCIL', tool: 0, color: 0, brushSize: 4, startX: 0, startY: 0, endX: 1, endY: 1, raw: [0, 0, 4, 0, 0, 1, 1] }]
};
colorRegression.process(whiteOnly);
assert(
  (colorRegression.getInstance('color-regression')?.internalState as { usedColorIds?: number[] }).usedColorIds?.includes(0),
  'White is one of the 26 required palette colors.'
);
for (const source of [brushM, brushL, brushXl]) colorRegression.process(structuredClone(source));
assertEqual(colorRegression.getInstance('color-regression')?.status, 'active', 'A partial palette must not complete Color Picker.');



const mogged = engine.getInstance(starterSandboxInstanceIds.mogged);
assertEqual(mogged?.status, 'active', 'Mogged must reject a qualifying self guess that was not the first guess.');


const smolWords = engine.getInstance(starterSandboxInstanceIds['smol-words']);
assertEqual(smolWords?.status, 'active', 'One short word must remain below the language-derived Smol words target.');

const bigWord = engine.getInstance(starterSandboxInstanceIds['big-word']);
assertEqual(bigWord?.status, 'active', 'A non-first guess must not complete Big word.');


const paparazzid = engine.getInstance(starterSandboxInstanceIds.paparazzid);
assert(
  paparazzid?.completionCandidate?.evidenceEventIds.includes('paparazzid-mention'),
  "Paparazzi'd evidence should include the foreign chat mention."
);

const asClose = engine.getInstance(starterSandboxInstanceIds['as-close-as-it-gets']);
for (const evidenceId of ['as-close-close-guess', 'as-close-next-guess-submitted', 'as-close-correct']) {
  assert(
    asClose?.completionCandidate?.evidenceEventIds.includes(evidenceId),
    `As close as it gets evidence should include ${evidenceId}.`
  );
}



const noobVsProVsHacker = engine.getInstance(starterSandboxInstanceIds['noob-vs-pro-vs-hacker']);
assertEqual(noobVsProVsHacker?.progress.current, 7, 'Noob vs. Pro vs. Hacker should collect all seven unique positions despite an interleaved duplicate.');
assert(
  noobVsProVsHacker?.completionCandidate?.evidenceEventIds.includes('noob-pro-hacker-position-7'),
  'Noob vs. Pro vs. Hacker evidence should include the final unique position.'
);
assert(
  !(noobVsProVsHacker?.completionCandidate?.evidenceEventIds.includes('noob-pro-hacker-position-2-duplicate') ?? true),
  'A repeated guessing position must not replace or add completion evidence.'
);

const dropItLikeItsHot = engine.getInstance(starterSandboxInstanceIds['reflexes-like-a-cat']);
assertEqual(dropItLikeItsHot?.status, 'completion-pending', "A Typo drop caught within 500 ms should complete Drop It Like It's Hot.");
assert(
  dropItLikeItsHot?.completionCandidate?.evidenceEventIds.includes('typo-drop-fast-catch'),
  "Drop It Like It's Hot evidence should include the fast server-confirmed drop catch."
);

const finalDrop = engine.getInstance(starterSandboxInstanceIds['drop-down']);
assertEqual(finalDrop?.status, 'completion-pending', 'A final Typo drop caught at or after 1000 ms should complete Final Drop.');
assert(
  finalDrop?.completionCandidate?.evidenceEventIds.includes('typo-drop-final-catch'),
  'Final Drop evidence should include the final clearing catch.'
);


const deserved = engine.getInstance(starterSandboxInstanceIds.deserved);
assertEqual(deserved?.status, 'completion-pending', 'Deserved should complete after reaching strict first without a prior self First Guess in its observed game state.');
assert(deserved?.completionCandidate !== null, 'Deserved should retain completion evidence.');

const backToBack = engine.getInstance(starterSandboxInstanceIds['back-to-back']);
assertEqual(backToBack?.progress.current, 2, 'Back to back should count two consecutive fully observed wins.');
assert(
  backToBack?.completionCandidate?.evidenceEventIds.includes('back-to-back-game-1-win') &&
  backToBack?.completionCandidate?.evidenceEventIds.includes('back-to-back-game-2-win'),
  'Back to back evidence should include both complete game wins.'
);

const instaLike = engine.getInstance(starterSandboxInstanceIds.instalike);
assertEqual(instaLike?.status, 'completion-pending', 'A like at exactly 250 ms should complete InstaLike.');
assert(
  instaLike?.completionCandidate?.evidenceEventIds.includes('instalike-exact-250ms'),
  'InstaLike evidence should include the exact-boundary like.'
);

const bullet = engine.getInstance(starterSandboxInstanceIds['bullet-skribbl-io']);
assertEqual(bullet?.progress.current, 5, 'Bullet skribbl.io should collect five distinct fast guessing turns.');
assert(bullet?.completionCandidate !== null, 'Bullet skribbl.io should retain completion evidence.');

console.log('Challenge definitions smoke test passed.');


const timeWaste = engine.getInstance(starterSandboxInstanceIds['time-waste']);
assertEqual(timeWaste?.progress.current, 1, 'Time Waste should complete after at least 50 continuous white seconds by another drawer.');
assert(
  timeWaste?.completionCandidate?.evidenceEventIds.includes('time-waste-too-short'),
  'The former 59-second negative metric should qualify under the new 50-second threshold.'
);
assert(
  !(timeWaste?.completionCandidate?.evidenceEventIds.includes('time-waste-foreign-white-60s') ?? false),
  'Later canvas metrics must not replace the first valid completion evidence.'
);

const ultimateComeback = engine.getInstance(starterSandboxInstanceIds['ultimate-comeback']);
assertEqual(ultimateComeback?.progress.current, 1, 'Ultimate Comeback should complete after an eligible baseline target was overtaken and the player later became strict #1.');
assertEqual(
  (ultimateComeback?.internalState as { completedTargetId?: number }).completedTargetId,
  61,
  'Ultimate Comeback should remember the original 1250+ baseline target that was overtaken.'
);
assertEqual(
  (ultimateComeback?.internalState as { completedLeaderId?: number }).completedLeaderId,
  62,
  'The final displaced leader may be a non-baseline player.'
);
for (const evidenceId of ['ultimate-comeback-hydrated', 'ultimate-comeback-target-overtake', 'ultimate-comeback-self-first']) {
  assert(
    ultimateComeback?.completionCandidate?.evidenceEventIds.includes(evidenceId),
    `Ultimate Comeback evidence should include ${evidenceId}.`
  );
}

}

void main();
