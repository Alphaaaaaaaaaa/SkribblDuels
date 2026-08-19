import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  dropDownDefinition,
  reflexesLikeACatDefinition
} from '@skribbl-duels/challenge-definitions';
import {
  normalizeTypoDropClaimDetail,
  parseTypoOwnDropClaimMessage
} from '@skribbl-duels/telemetry-core';
import type { TelemetryEventOf } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function dropEvent(
  eventId: string,
  catchTimeMs: number,
  clearedDrop: boolean
): TelemetryEventOf<'TYPO_DROP_CLAIMED'> {
  return {
    schemaVersion: 1,
    eventId,
    telemetrySequence: catchTimeMs,
    type: 'TYPO_DROP_CLAIMED',
    category: 'system',
    occurredAt: 1700000000000 + catchTimeMs,
    monotonicMs: catchTimeMs,
    actor: { playerId: 21, name: 'Alpha', isSelf: true },
    context: {
      lobbySessionId: 'drop-lobby-session',
      lobbyGeneration: 1,
      lobbyId: 'DROPTEST',
      lobbyType: 0,
      languageId: 1,
      languageName: 'German',
      gameSessionId: 'drop-game',
      roundSessionId: 'drop-turn',
      roundIndex: 0,
      roundNumber: 1,
      maxRounds: 3,
      gameStateId: 4,
      gameStateName: 'DRAWING',
      meId: 21,
      drawerId: 77
    },
    source: {
      origin: 'dom-adapter',
      rawRecordId: null,
      changeId: null,
      direction: null,
      socketEvent: null,
      packetId: null
    },
    payload: {
      own: true,
      dropId: 123456789,
      catchTimeMs,
      firstClaim: true,
      clearedDrop,
      leagueMode: false,
      leagueWeight: 0.5,
      username: 'Alpha',
      method: 'typo-relay'
    },
    confidence: 'confirmed',
    highVolume: false
  };
}

const parsedCaught = parseTypoOwnDropClaimMessage('Yeee! You caught the drop after 612ms (42%)');
assert(parsedCaught?.catchTimeMs === 612, 'The chat fallback must parse the server-confirmed catch time.');
assert(parsedCaught?.clearedDrop === false, 'A caught message must not be marked as a clearing catch.');
assert(parsedCaught?.leagueWeight === 0.42, 'The chat fallback must parse the displayed league weight.');

const parsedCleared = parseTypoOwnDropClaimMessage('You cleared the drop after 1300ms (11%)');
assert(parsedCleared?.clearedDrop === true, 'A cleared message must be marked as the final catch.');
assert(parsedCleared?.catchTimeMs === 1300, 'The cleared message must preserve milliseconds.');

const normalized = normalizeTypoDropClaimDetail({
  claim: {
    dropId: 999,
    catchTime: 700,
    firstClaim: true,
    clearedDrop: false,
    leagueMode: false,
    leagueWeight: 0.75,
    username: 'Alpha'
  },
  ownClaim: true
});
assert(normalized?.dropId === 999 && normalized.catchTimeMs === 700, 'The direct Typo relay shape must be normalized.');

const engine = new ChallengeEngine({ autoPersist: false });
engine.register(reflexesLikeACatDefinition);
engine.register(dropDownDefinition);
engine.activate({ instanceId: 'cat', challengeId: 'reflexes-like-a-cat' });
engine.activate({ instanceId: 'down', challengeId: 'drop-down' });

engine.process(dropEvent('slow-normal-drop', 501, false));
assert(engine.getInstance('cat')?.progress.current === 0, "A catch above 500 ms must not complete Drop It Like It's Hot.");
engine.process(dropEvent('fast-drop', 500, false));
assert(engine.getInstance('cat')?.status === 'completion-pending', "A server-confirmed catch at 500 ms must complete Drop It Like It's Hot.");

engine.process(dropEvent('early-final-drop', 999, true));
assert(engine.getInstance('down')?.progress.current === 0, 'A final catch below 1000 ms must not complete Final Drop.');
engine.process(dropEvent('valid-final-drop', 1000, true));
assert(engine.getInstance('down')?.status === 'completion-pending', 'A final catch at 1000 ms must complete Final Drop.');

console.log("Typo drop adapter, Drop It Like It's Hot and Final Drop runtime test passed.");
