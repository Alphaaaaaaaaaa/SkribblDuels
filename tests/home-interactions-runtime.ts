import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  bloodlineDefinition,
  isThatAModDefinition
} from '@skribbl-duels/challenge-definitions';
import {
  SpecialAvatarStabilityTracker,
  specialIdFromBackgroundPosition,
  type LogoAvatarVisualSnapshot
} from '@skribbl-duels/telemetry-core';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const baseSnapshot: LogoAvatarVisualSnapshot = {
  avatarIndex: 3,
  colorBackgroundPosition: '-100% 0%',
  eyesBackgroundPosition: '0% -400%',
  mouthBackgroundPosition: '0% -200%',
  specialBackgroundPosition: '-100% -100%',
  specialVisible: true
};
const tracker = new SpecialAvatarStabilityTracker(1000);
tracker.begin(baseSnapshot, 'click-1', 0);
assert(tracker.check(baseSnapshot, 999) === null, 'Special must remain stable for a full second.');
const stable = tracker.check(baseSnapshot, 1000);
assert(stable?.avatarIndex === 3, 'Stable special should be detected after one second.');
assert(stable?.specialId === 101, 'Special background position should produce a stable id.');
tracker.begin(baseSnapshot, 'click-2', 2000);
assert(tracker.check({ ...baseSnapshot, eyesBackgroundPosition: '-100% -400%' }, 3000) === null,
  'A changed avatar must cancel the stable-special candidate.');
assert(specialIdFromBackgroundPosition('-100% -100%') === 101, 'Special id parser should be deterministic.');

const base = {
  schemaVersion: 1 as const,
  telemetrySequence: 1,
  category: 'home' as const,
  occurredAt: 1,
  monotonicMs: 1,
  actor: null,
  context: {
    lobbySessionId: null, lobbyGeneration: 0, lobbyId: null, lobbyType: null,
    languageId: null, languageName: null, gameSessionId: null, roundSessionId: null,
    roundIndex: null, roundNumber: null, maxRounds: null, gameStateId: null,
    gameStateName: 'DISCONNECTED', meId: null, drawerId: null
  },
  source: {
    origin: 'dom-adapter' as const, rawRecordId: null, changeId: null,
    direction: null, socketEvent: null, packetId: null
  },
  confidence: 'confirmed' as const,
  highVolume: false
};

const modEngine = new ChallengeEngine({ autoPersist: false });
modEngine.register(isThatAModDefinition);
modEngine.activate({ instanceId: 'mod', challengeId: 'is-that-a-mod' });
modEngine.process({
  ...base, eventId: 'click-event', type: 'LOGO_AVATAR_CLICKED',
  payload: { avatarIndex: 3, clickCount: 8, clickId: 'click-1' }
} as TelemetryEvent);
modEngine.process({
  ...base, eventId: 'special-event', type: 'SPECIAL_AVATAR_FOUND', occurredAt: 2,
  payload: {
    avatarIndex: 3, clickId: 'click-1', specialId: 101,
    specialBackgroundPosition: '-100% -100%', stableForMs: 1000
  }
} as TelemetryEvent);
assert(modEngine.getInstance('mod')?.status === 'completion-pending', 'Stable special should complete Is ThAT a MoD?.');

const bloodlineEngine = new ChallengeEngine({ autoPersist: false });
bloodlineEngine.register(bloodlineDefinition);
bloodlineEngine.activate({ instanceId: 'bloodline', challengeId: 'bloodline' });
bloodlineEngine.process({
  ...base, eventId: 'direct-credits', type: 'CREDITS_OPENED',
  payload: {
    pathname: '/credits', readyState: 'complete', linkClickObserved: false,
    navigationId: null, linkClickedAt: null, loadElapsedMs: null
  }
} as TelemetryEvent);
assert(bloodlineEngine.getInstance('bloodline')?.progress.current === 0,
  'Direct Credits navigation must not complete Bloodline.');
bloodlineEngine.process({
  ...base, eventId: 'clicked-credits', type: 'CREDITS_LINK_CLICKED', occurredAt: 3,
  payload: {
    href: 'https://skribbl.io/credits', pathname: '/credits', navigationId: 'nav-1'
  }
} as TelemetryEvent);
assert(bloodlineEngine.getInstance('bloodline')?.status === 'completion-pending',
  'The observed homepage Credits click should complete Bloodline before navigation unloads the page.');

console.log('Home interaction runtime test passed.');
