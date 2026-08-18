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
assert(product.includes('const restoresPersistedMatch = snapshot.matchId === this.matchState.matchId'), 'persisted /credits match identity is not reconciled');
assert(product.includes("this.abortLocalMatch('gateway-match-superseded-local-state')"), 'only superseded persisted matches are not reset');
assert(product.includes('this.awaitingTelemetryResumeCursor'), 'telemetry resume cursor gate is missing');
assert(product.includes('this.deferredTelemetryEvents.push(structuredClone(event))'), 'telemetry events are not buffered during Gateway resume');
assert(product.includes('this.reconcileBoardChallenges(snapshot.matchId, board, startedAt)'), 'persisted challenge runtimes are not reconciled with the resumed board');
assert(product.includes('private flushPendingClaimCandidates()'), 'pending Bloodline and reconnect claims are not flushed after resume');
assert(product.includes('private flushForfeitAfterReconnect('), 'interrupted matches cannot reconnect and forfeit');
assert(product.includes('this.scheduleConclusionPresentation(event.state, event.occurredAt)'), 'match conclusions are not ordered after accepted completion messages');
assert(product.includes("'#scd-raw-recorder-panel'"), 'foreign telemetry panels are not isolated');
assert(product.includes("window.location.pathname !== '/'"), 'homepage-only matchmaking guard is missing');
assert(product.includes('newMatch.disabled = !this.matchState.format || !homepageAvailable'), 'New Match remains available inside a Skribbl lobby');
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
assert(gateway.includes('processTelemetryBatch'), 'server telemetry authority entry point is missing');
assert(gateway.includes('submitClaimCandidate'), 'server Claim authority entry point is missing');
assert(gateway.includes("match.phase = 'finished'"), 'server does not own the terminal win state');
assert(gateway.includes('public forfeitMatch('), 'server-authoritative Forfeit is missing');
assert(gateway.includes('public proposeDraw('), 'server-authoritative Draw proposal is missing');
assert(gateway.includes('public respondToDraw('), 'explicit Draw response is missing');
assert(gateway.includes('public withdrawDraw('), 'Draw withdrawal is missing');
assert(gateway.includes('public requestRematch('), 'server-authoritative Rematch request is missing');
assert(gateway.includes('private startRematch('), 'server Rematch lifecycle is missing');
assert(gateway.includes("reason: 'player-forfeit'"), 'Forfeit result reason is missing');
assert(gateway.includes("reason: 'mutual-draw'"), 'mutual Draw result reason is missing');
assert(product.includes('this.gatewayClient.forfeitMatch('), 'Match UI does not send Forfeit');
assert(product.includes('this.gatewayClient.respondToDraw('), 'Match UI does not accept or reject Draw proposals');
assert(product.includes('this.matchStore.finishDraw('), 'client does not restore authoritative Draw results');
assert(product.includes('this.telemetryGateway.setTransport'), 'match telemetry is not connected to the Gateway');
assert(product.includes('this.matchStore.finishMatch(winner, conclusion.reason, conclusion.occurredAt)'), 'client does not restore the authoritative winner');

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
  , authoritativeForfeit: true
  , mutualDrawLifecycle: true
  , persistedChallengeResume: true
  , authoritativeRematch: true
}, null, 2));
