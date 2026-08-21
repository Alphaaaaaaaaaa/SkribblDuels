import * as assert from 'node:assert/strict';
import {
  CHALLENGE_DEFINITIONS_VERSION,
  starterChallengeDefinitions
} from '@skribbl-duels/challenge-definitions';
import {
  createChallengeManifest,
  generateDraftBoard,
  MatchStateStore,
  MatchTelemetryGateway,
  normalizeProductUiSettings,
  validateDraftBoard,
  type ChallengeCapability
} from '@skribbl-duels/product-core';

const manifest = createChallengeManifest({
  definitionsVersion: CHALLENGE_DEFINITIONS_VERSION,
  definitions: starterChallengeDefinitions.map(definition => ({
    id: definition.id,
    version: definition.version,
    metadata: definition.metadata,
    defaultParameters: definition.defaultParameters
  }))
}, 'en', 1_000);

assert.equal(manifest.entries.length, 46);
const capabilities = {
  available: new Set<ChallengeCapability>([
    'skribbl-telemetry',
    'official-word-list',
    'typo',
    'typo-challenges',
    'typo-drops',
    'typo-image-lab'
  ])
};

for (let seed = 1; seed <= 250; seed += 1) {
  const result = generateDraftBoard(manifest, {
    format: 'ranked',
    seed,
    capabilities
  }, 2_000 + seed);
  assert.ok(result.board, `Draft failed for seed ${seed}: ${result.issues.map(issue => issue.message).join(', ')}`);
  const selected = new Set(result.board.fields.map(field => field.challengeId));
  assert.equal(result.board.fields.length, 25);
  assert.equal(
    selected.has('blind-guess') && selected.has('drunk-vision'),
    false,
    `Blind Guess and Drunk Vision shared seed ${seed}`
  );
  assert.equal(validateDraftBoard(result.board, manifest, capabilities).length, 0);
}

const includeBlindDeaf = generateDraftBoard(manifest, {
  format: 'ranked',
  seed: 999,
  includeIds: ['blind-guess', 'deaf-guess'],
  capabilities
});
assert.ok(includeBlindDeaf.board, 'Blind Guess + Deaf Guess should be compatible');

const includeDrunkDeaf = generateDraftBoard(manifest, {
  format: 'ranked',
  seed: 1000,
  includeIds: ['drunk-vision', 'deaf-guess'],
  capabilities
});
assert.ok(includeDrunkDeaf.board, 'Drunk Vision + Deaf Guess should be compatible');

const includeBlindDrunk = generateDraftBoard(manifest, {
  format: 'ranked',
  seed: 1001,
  includeIds: ['blind-guess', 'drunk-vision'],
  capabilities
});
assert.equal(includeBlindDrunk.board, null);
assert.ok(includeBlindDrunk.issues.some(issue => issue.code === 'conflict-key'));

const normalizedSettings = normalizeProductUiSettings({
  board: { scale: 99, opacity: 0.01, mode: 'custom', x: 123, y: 456 },
  panelOpen: true,
  panelTab: 'settings'
});
assert.equal(normalizedSettings.board.scale, 1.6);
assert.equal(normalizedSettings.board.opacity, 0.35);
assert.equal(normalizedSettings.board.mode, 'custom');
assert.equal(normalizedSettings.launcher.anchor, 'center-right');
const normalizedLauncher = normalizeProductUiSettings({ launcher: { mode: 'custom', x: 123, y: 456, size: 999 } });
assert.equal(normalizedLauncher.launcher.mode, 'custom');
assert.equal(normalizedLauncher.launcher.size, 120);
assert.equal(normalizedSettings.panelTab, 'settings');

void (async () => {
  const casual = generateDraftBoard(manifest, {
    format: 'casual',
    seed: 2000,
    capabilities
  }).board;
  assert.ok(casual);
  const match = new MatchStateStore();
  const gateway = new MatchTelemetryGateway(match);
  let forwarded = 0;
  gateway.setTransport(() => { forwarded += 1; });
  match.prepareMatchCountdown('actual-foundation-test', casual, [
    { playerId: 'self', displayName: 'Alpha', side: 'self' },
    { playerId: 'opponent', displayName: 'Player 1', side: 'opponent' }
  ], 10_000, 5_000);
  assert.equal(match.getState().phase, 'countdown');
  assert.equal(match.getState().countdownEndsAt, 10_000);
  await gateway.observe({ eventId: 'live-during-countdown' } as never);
  assert.equal(forwarded, 0);
  match.startPreparedMatch('actual-foundation-test', 10_000);
  assert.equal(match.getState().phase, 'running');
  assert.equal(match.getState().countdownEndsAt, null);
  assert.equal(match.getState().startedAt, 10_000);
  await gateway.observe({ eventId: 'live-before-end' } as never);
  for (const field of casual.fields.slice(0, casual.winTarget)) {
    match.confirmClaim(field.challengeId, `claim-${field.fieldIndex}`, 'self', 11_000 + field.fieldIndex);
  }
  assert.equal(match.getState().phase, 'finished');
  assert.equal(match.canForwardTelemetry(), false);
  await gateway.observe({ eventId: 'live-after-end' } as never);
  assert.equal(forwarded, 1);
  assert.equal(gateway.getStats().suppressedAfterFreeze, 1);

  const claimRace = new MatchStateStore();
  claimRace.startMatch('claim-race', casual, [
    { playerId: 'self', displayName: 'Alpha', side: 'self' },
    { playerId: 'opponent', displayName: 'Bravo', side: 'opponent' }
  ], 20_000);
  const racedField = casual.fields[0]!;
  claimRace.markPending(racedField.challengeId, 'self-pending', 'self', 20_100);
  claimRace.confirmClaim(racedField.challengeId, 'opponent-authoritative', 'opponent', 20_200);
  const resolvedRace = claimRace.getState().fields.find(field => field.challengeId === racedField.challengeId);
  assert.equal(resolvedRace?.status, 'claimed');
  assert.equal(resolvedRace?.owner, 'opponent');
  assert.equal(resolvedRace?.pendingCandidateId, null);

  console.log('Product Foundation passed with the actual 46-challenge manifest and 250 Ranked draft seeds.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
