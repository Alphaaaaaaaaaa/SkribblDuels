const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const userscript = fs.readFileSync(path.join(root, 'apps/telemetry-inspector/src/userscript.ts'), 'utf8');
const product = fs.readFileSync(path.join(root, 'apps/telemetry-inspector/src/duelProductUi.ts'), 'utf8');
const gateway = fs.readFileSync(path.join(root, 'apps/gateway/src/matchmaking.ts'), 'utf8');

assert(userscript.includes("dispose('superseded-by-new-runtime')"), 'new runtime does not dispose the previous runtime');
assert(userscript.includes("'.skribbl-duels-completion'"), 'legacy completion elements are not removed');
assert(product.includes("this.abortLocalMatch('new-matchmaking-request')"), 'queue start does not reset the local match first');
assert(product.includes("this.abortLocalMatch('new-demo-match')"), 'demo start does not reset the previous local match first');
assert(product.includes("this.abortLocalMatch('gateway-match-connection-lost')"), 'gateway disconnect does not clear a prepared countdown');
assert(product.includes('this.clearMatchStartTimer()'), 'match reset does not clear the synchronized start timer');
assert(product.includes('this.options.challengeEngine.reset(reason)'), 'match reset does not clear old challenge instances');
assert(product.includes('this.activateBoardChallenges(snapshot.matchId, board, startedAt'), 'Gateway board challenges are not activated at match start');
assert(product.includes("'#scd-raw-recorder-panel'"), 'foreign telemetry panels are not isolated');
assert(product.includes("window.location.pathname !== '/'"), 'homepage-only matchmaking guard is missing');
assert(product.includes("this.gatewayClient.setReady(match.matchId, true)"), 'ready acceptance is not a one-way one-click action');
assert(!product.includes("this.gatewayClient.setReady(gatewayMatch.matchId, !self?.ready)"), 'ready acceptance still toggles and can require a second click');
assert(product.includes('createDraftProgressFields'), 'draft board is not rendered incrementally');
assert(product.includes("snapshot.state.phase === 'ready-check'"), 'match-found phase does not close the Hub for the Versus stage');
assert(product.includes("this.settingsStore.update({ panelOpen: false, panelTab: 'match' })"), 'running match still opens the Hub automatically');
assert(product.includes("if (this.currentStagePhase()) return;"), 'Hub launcher can expose the Hub during a match-start stage');
assert(gateway.includes("this.cancelAccount(peer.identity.accountId, 'superseded-by-new-matchmaking')"), 'server does not abort a superseded account match');
assert(gateway.includes("readyTimeoutMs"), 'server ready timeout is missing');
assert(gateway.includes('createChallengeOffer('), 'server does not create pair-draft offers');
assert(gateway.includes('beginFinalRandomSelection('), 'server parity final field is missing');
assert(gateway.includes('matchCountdownMs'), 'server match countdown is missing');

console.log(JSON.stringify({
  singletonRuntime: true,
  oldDomRemoved: true,
  localMatchResetBeforeStart: true,
  serverMatchSupersession: true,
  homepageOnlyQueue: true,
  oneClickReadyAcceptance: true,
  twoChallengeDraftOffers: true,
  serverRandomParityField: true,
  incrementalDraftBoard: true,
  standaloneVersusDraftCountdown: true,
  hubClosedUntilInvoked: true,
  synchronizedTimerCleanup: true,
  draftedChallengeActivation: true
}, null, 2));
