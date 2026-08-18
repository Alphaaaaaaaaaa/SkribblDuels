import { ChallengeEngine } from '@skribbl-duels/challenge-engine';
import {
  autodrawDetectedDefinition,
  setOfficialWordListForTesting,
  spamguessingDefinition
} from '@skribbl-duels/challenge-definitions';
import {
  fingerprintSkdCommands,
  parseSkdCommandSequences,
  TypoAutodrawTelemetryAdapter,
  type TypoSkdLoadedPayload
} from '@skribbl-duels/telemetry-core';
import { Subject } from 'rxjs';
import type { TelemetryEvent, TelemetryEventType } from '@skribbl-duels/telemetry-contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function context(roundSessionId: string, drawerId: number, lobbyType: number | null = 0) {
  return {
    lobbySessionId: 'spam-autodraw-lobby-session',
    lobbyGeneration: 1,
    lobbyId: 'SPAMAUTO1',
    lobbyType,
    languageId: 1,
    languageName: 'German',
    gameSessionId: 'spam-autodraw-game',
    roundSessionId,
    roundIndex: 0,
    roundNumber: 1,
    maxRounds: 3,
    gameStateId: 4,
    gameStateName: 'DRAWING',
    meId: 21,
    drawerId
  } as const;
}

function event<T extends TelemetryEventType>(
  type: T,
  eventId: string,
  monotonicMs: number,
  payload: Extract<TelemetryEvent, { type: T }>['payload'],
  roundSessionId: string,
  drawerId: number,
  actor: TelemetryEvent['actor'] = null,
  lobbyType: number | null = 0
): Extract<TelemetryEvent, { type: T }> {
  const category = type === 'TYPO_SKD_FILE_LOADED'
    ? 'system'
    : type === 'TYPO_SKD_PASTED'
      ? 'drawing'
      : type === 'SPAM_DETECTED'
        ? 'chat'
        : type === 'GUESS_SUBMITTED'
          ? 'guessing'
          : 'round';
  return {
    schemaVersion: 1,
    eventId,
    telemetrySequence: monotonicMs,
    type,
    category,
    occurredAt: 1700000000000 + monotonicMs,
    monotonicMs,
    actor,
    context: context(roundSessionId, drawerId, lobbyType),
    source: {
      origin: type.startsWith('TYPO_') ? 'dom-adapter' : 'decoded-packet',
      rawRecordId: null,
      changeId: null,
      direction: type.startsWith('TYPO_') ? null : type === 'GUESS_SUBMITTED' ? 'client-to-server' : 'server-to-client',
      socketEvent: type.startsWith('TYPO_') ? null : 'data',
      packetId: null
    },
    payload,
    confidence: 'confirmed',
    highVolume: false
  } as Extract<TelemetryEvent, { type: T }>;
}

const self = { playerId: 21, name: 'Alpha', isSelf: true } as const;
const roundPayload = (wordLengths: number[]) => ({
  previousStateId: 3,
  stateId: 4,
  stateName: 'DRAWING',
  time: 80,
  roundIndex: 0,
  roundNumber: 1,
  maxRounds: 3,
  drawerId: 77,
  word: null,
  wordLengths,
  initialTime: 80,
  players: []
});

setOfficialWordListForTesting(1, ['Ski', 'Hai', 'Zoo', 'Punkt', 'Nagel', 'Maler'], 'German');

const invalidSpam = new ChallengeEngine({ autoPersist: false });
invalidSpam.register(spamguessingDefinition);
invalidSpam.activate({ instanceId: 'spam', challengeId: 'spamguessing' });
invalidSpam.process(event('ROUND_STARTED', 'invalid-spam-start', 0, roundPayload([10]), 'invalid-spam-turn', 77));
for (const [index, message] of ['Ski', 'Hai', 'Zoo'].entries()) {
  invalidSpam.process(event('GUESS_SUBMITTED', `invalid-spam-${index}`, 100 + index * 300, {
    message,
    submittedAtServerTime: 80
  }, 'invalid-spam-turn', 77, self));
}
invalidSpam.process(event('SPAM_DETECTED', 'invalid-spam-detected', 1100, {}, 'invalid-spam-turn', 77, self));
assert(invalidSpam.getInstance('spam')?.status === 'active', 'Short official words must not complete Spamguessing when the target length is 10.');

const validSpam = new ChallengeEngine({ autoPersist: false });
validSpam.register(spamguessingDefinition);
validSpam.activate({ instanceId: 'spam', challengeId: 'spamguessing' });
validSpam.process(event('ROUND_STARTED', 'valid-spam-start', 2000, roundPayload([3]), 'valid-spam-turn', 77));
for (const [index, message] of ['Ski', 'Hai', 'Zoo'].entries()) {
  validSpam.process(event('GUESS_SUBMITTED', `valid-spam-${index}`, 2100 + index * 350, {
    message,
    submittedAtServerTime: 80
  }, 'valid-spam-turn', 77, self));
}
validSpam.process(event('SPAM_DETECTED', 'valid-spam-detected', 3000, {}, 'valid-spam-turn', 77, self));
assert(validSpam.getInstance('spam')?.status === 'completion-pending', 'Three official same-length guesses followed by server spam detection should complete Spamguessing.');
assert(validSpam.getInstance('spam')?.completionCandidate?.evidenceEventIds.length === 4, 'Spamguessing evidence should contain three guesses and the spam-detected event.');

const commands = [
  [0, 4, 20, 10, 10, 20, 20],
  [0, 4, 20, 20, 20, 30, 30],
  [1, 4, 40, 40]
];
const fingerprint = fingerprintSkdCommands(commands);
assert(fingerprint === fingerprintSkdCommands(commands), 'SKD command fingerprints must be deterministic.');
assert(fingerprint !== fingerprintSkdCommands(commands.slice(0, 2)), 'Different SKD command sequences need different fingerprints.');
const collectionSequences = parseSkdCommandSequences([
  { name: 'first drawing', commands },
  { name: 'second drawing', commands: commands.slice(0, 2) }
]);
assert(collectionSequences.length === 2, 'Current Typo .skd collection exports must expose every contained drawing.');
assert(collectionSequences[0]?.length === commands.length, 'The first collection entry must preserve its complete command list.');
assert(parseSkdCommandSequences(commands).length === 1, 'Legacy bare-command .skd exports must remain supported.');

const autodraw = new ChallengeEngine({ autoPersist: false });
autodraw.register(autodrawDetectedDefinition);
autodraw.activate({ instanceId: 'autodraw', challengeId: 'autodraw-detected' });
autodraw.process(event('TYPO_SKD_FILE_LOADED', 'skd-loaded', 4000, {
  fileName: 'drawing.skd',
  fingerprint,
  commandCount: commands.length,
  loadedFromFile: true,
  method: 'file-input-fallback'
}, 'autodraw-turn', 21, self));
autodraw.process(event('TYPO_SKD_PASTED', 'skd-private-paste', 4100, {
  fileName: 'drawing.skd',
  fingerprint,
  commandCount: commands.length,
  loadedFromFile: true,
  clearBeforePaste: false,
  pasteInstant: false,
  method: 'command-match-fallback'
}, 'autodraw-turn', 21, self, 1));
assert(autodraw.getInstance('autodraw')?.status === 'active', 'Autodraw detected must not complete in a private lobby.');
autodraw.process(event('TYPO_SKD_PASTED', 'skd-public-paste', 4200, {
  fileName: 'drawing.skd',
  fingerprint,
  commandCount: commands.length,
  loadedFromFile: true,
  clearBeforePaste: false,
  pasteInstant: false,
  method: 'command-match-fallback'
}, 'autodraw-turn', 21, self, 0));
assert(autodraw.getInstance('autodraw')?.status === 'completion-pending', 'A loaded .skd sequence pasted during an own public drawing must complete Autodraw detected.');
assert(autodraw.getInstance('autodraw')?.completionCandidate?.evidenceEventIds.includes('skd-loaded'), 'Autodraw evidence should include the observed file load.');

const activatedAfterLoad = new ChallengeEngine({ autoPersist: false });
activatedAfterLoad.register(autodrawDetectedDefinition);
activatedAfterLoad.activate({ instanceId: 'autodraw', challengeId: 'autodraw-detected' });
activatedAfterLoad.process(event('TYPO_SKD_PASTED', 'skd-relay-paste', 5000, {
  fileName: 'drawing.skd',
  fingerprint,
  commandCount: commands.length,
  loadedFromFile: true,
  clearBeforePaste: true,
  pasteInstant: true,
  method: 'typo-relay'
}, 'autodraw-relay-turn', 21, self));
assert(activatedAfterLoad.getInstance('autodraw')?.status === 'completion-pending', 'A trusted Typo relay paste must work when the challenge was activated after the file-load event.');

console.log('Spamguessing and Autodraw detected runtime tests passed.');

const adapterEvents$ = new Subject<TelemetryEvent>();
const adapterEmitted: { type: TelemetryEventType; payload: unknown }[] = [];
const fakeStore = {
  events$: adapterEvents$.asObservable(),
  emitDomEvent(type: TelemetryEventType, payload: unknown) {
    adapterEmitted.push({ type, payload });
  }
};
const adapter = new TypoAutodrawTelemetryAdapter(fakeStore as never);
adapter.start();
const adapterLoaded: TypoSkdLoadedPayload = {
  fileName: 'adapter-test.skd',
  fingerprint,
  commandCount: commands.length,
  loadedFromFile: true,
  method: 'file-input-fallback'
};
(adapter as unknown as {
  registerLoaded(payload: TypoSkdLoadedPayload, commands: unknown[][], confidence: 'confirmed'): void;
}).registerLoaded(adapterLoaded, commands, 'confirmed');
adapterEvents$.next(event('DRAW_COMMAND_BATCH_SUBMITTED', 'adapter-draw-batch-1', 6000, {
  commandCount: 2,
  tools: [0],
  colors: [4],
  brushSizes: [20],
  commands: commands.slice(0, 2).map(command => ({
    kind: 'PENCIL' as const,
    tool: 0 as const,
    color: Number(command[1]),
    brushSize: Number(command[2]),
    startX: Number(command[3]),
    startY: Number(command[4]),
    endX: Number(command[5]),
    endY: Number(command[6]),
    raw: command
  }))
}, 'adapter-autodraw-turn', 21, self));
adapterEvents$.next(event('DRAW_COMMAND_BATCH_SUBMITTED', 'adapter-draw-batch-2', 6100, {
  commandCount: 1,
  tools: [1],
  colors: [4],
  brushSizes: [],
  commands: [{
    kind: 'FILL' as const,
    tool: 1 as const,
    color: Number(commands[2]?.[1]),
    startX: Number(commands[2]?.[2]),
    startY: Number(commands[2]?.[3]),
    raw: commands[2] as unknown[]
  }]
}, 'adapter-autodraw-turn', 21, self));
assert(adapterEmitted.some(entry => entry.type === 'TYPO_SKD_PASTED'), 'The fallback adapter should recognize the exact loaded .skd command sequence across multiple outgoing batches.');
adapter.stop();

console.log('Autodraw command-sequence fallback test passed.');
