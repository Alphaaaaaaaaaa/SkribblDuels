import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import type {
  TelemetryEventOf
} from '@skribbl-duels/telemetry-contracts';
import { isFinitePositiveNumber, isPositiveInteger, localization } from '../shared';

const MIN_CERTIFIED_TYPING_MS = 250;
const MAX_CERTIFIED_TYPING_MS = 300_000;
const MAX_CERTIFIED_WPM = 609;
const MEASUREMENT_CORRELATION_MS = 5_000;
const CORRECT_GUESS_CORRELATION_MS = 5_000;
const MAX_PENDING_MEASUREMENTS = 64;
const MAX_RESOLVED_BOUNDARIES = 128;

export interface CertifiedWpmParameters {
  thresholdWpm: number;
  guesses: number;
}

interface CertifiedWpmMeasurement {
  attemptId: string;
  eventId: string;
  occurredAt: number;
  lobbySessionId: string | null;
  roundSessionId: string | null;
  messageKey: string;
  wpm: number | null;
  certified: boolean;
}

interface CertifiedWpmSubmission {
  attemptId: string | null;
  measurementEventId: string | null;
  submissionEventId: string;
  submittedAt: number;
  lobbySessionId: string | null;
  roundSessionId: string | null;
  roundKey: string | null;
  messageKey: string;
  wpm: number | null;
  certified: boolean;
}

export interface CertifiedWpmState {
  pendingMeasurements: CertifiedWpmMeasurement[];
  pendingSubmission: CertifiedWpmSubmission | null;
  qualifyingAttemptIds: string[];
  resolvedAttemptIds: string[];
  resolvedRoundKeys: string[];
  evidenceEventIds: string[];
}

export interface CertifiedWpmChallengeConfig {
  id: 'internet-explorer' | 'wpmaster' | 'type-racer';
  name: string;
  descriptionEn: string;
  descriptionDe: string;
  icon: string;
  difficulty: number;
  comparison: 'below' | 'at-least';
  firstGuesserRequired: boolean;
  completionReason: string;
  progressReason: string;
}

function initialState(): CertifiedWpmState {
  return {
    pendingMeasurements: [],
    pendingSubmission: null,
    qualifyingAttemptIds: [],
    resolvedAttemptIds: [],
    resolvedRoundKeys: [],
    evidenceEventIds: []
  };
}

export function certifiedWpmMessageKey(value: string): string {
  return value
    .normalize('NFKD')
    .trim()
    .toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/\s+/gu, '')
    .replace(/ß/gu, 'ss');
}

export function calculateCertifiedWpm(characterCount: number, durationMs: number): number | null {
  if (!Number.isFinite(characterCount) || characterCount <= 0
      || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  return Math.round((((characterCount / 5) / (durationMs / 60_000)) + Number.EPSILON) * 100) / 100;
}

function typingCharacterCount(value: string): number {
  return Array.from(value.trim().normalize('NFKC')).length;
}

function boundaryKey(event: TelemetryEventOf<'CORRECT_GUESS'>): string | null {
  const roundSessionId = event.context.roundSessionId;
  if (roundSessionId === null) return null;
  return `${event.context.lobbySessionId ?? 'unknown-lobby'}:${roundSessionId}`;
}

function boundedUnique(values: readonly string[], value: string): string[] {
  const next = values.filter(item => item !== value);
  next.push(value);
  return next.slice(-MAX_RESOLVED_BOUNDARIES);
}

function measurementFrom(
  event: TelemetryEventOf<'TEXT_INPUT_MEASURED'>,
  state: CertifiedWpmState
): CertifiedWpmMeasurement {
  const payload = event.payload;
  const messageKey = certifiedWpmMessageKey(payload.message);
  const wpm = calculateCertifiedWpm(payload.characterCount, payload.durationMs);
  const duplicateAttempt = state.pendingMeasurements.some(item => item.attemptId === payload.attemptId)
    || state.pendingSubmission?.attemptId === payload.attemptId
    || state.resolvedAttemptIds.includes(payload.attemptId)
    || state.qualifyingAttemptIds.includes(payload.attemptId);
  const submittedClockDelta = Math.abs(payload.submittedAt - event.occurredAt);
  const durationClockDelta = Math.abs((payload.submittedAt - payload.startedAt) - payload.durationMs);
  const certified = event.actor?.isSelf === true
    && event.actor.playerId !== null
    && event.actor.playerId === event.context.meId
    && event.source.origin === 'dom-adapter'
    && event.confidence === 'confirmed'
    && event.context.lobbySessionId !== null
    && event.context.roundSessionId !== null
    && event.context.gameStateId === 4
    && event.context.meId !== null
    && event.context.drawerId !== event.context.meId
    && payload.eligibleGuess === true
    && payload.attemptId.trim().length > 0
    && payload.attemptId.length <= 160
    && !duplicateAttempt
    && messageKey.length > 0
    && payload.characterCount === typingCharacterCount(payload.message)
    && Number.isInteger(payload.correctionCount)
    && payload.correctionCount >= 0
    && payload.trustedInput === true
    && payload.pasteDetected === false
    && payload.autofillDetected === false
    && payload.durationMs >= MIN_CERTIFIED_TYPING_MS
    && payload.durationMs <= MAX_CERTIFIED_TYPING_MS
    && submittedClockDelta <= 1_000
    && durationClockDelta <= 1_000
    && wpm !== null
    && wpm <= MAX_CERTIFIED_WPM;

  return {
    attemptId: payload.attemptId,
    eventId: event.eventId,
    occurredAt: event.occurredAt,
    lobbySessionId: event.context.lobbySessionId,
    roundSessionId: event.context.roundSessionId,
    messageKey,
    wpm,
    certified
  };
}

function submittedEvidence(
  event: TelemetryEventOf<'GUESS_SUBMITTED'>,
  state: CertifiedWpmState
): CertifiedWpmSubmission {
  const messageKey = certifiedWpmMessageKey(event.payload.message ?? '');
  let measurement: CertifiedWpmMeasurement | null = null;
  for (let index = state.pendingMeasurements.length - 1; index >= 0; index -= 1) {
    const candidate = state.pendingMeasurements[index];
    if (!candidate) continue;
    const ageMs = event.occurredAt - candidate.occurredAt;
    if (ageMs > MEASUREMENT_CORRELATION_MS) break;
    if (ageMs < 0) continue;
    if (candidate.messageKey === messageKey
        && candidate.lobbySessionId === event.context.lobbySessionId
        && candidate.roundSessionId === event.context.roundSessionId) {
      measurement = candidate;
      break;
    }
  }

  const validSubmission = event.actor?.isSelf === true
    && event.actor.playerId !== null
    && event.actor.playerId === event.context.meId
    && event.source.origin === 'decoded-packet'
    && event.source.direction === 'client-to-server'
    && event.confidence === 'derived'
    && event.context.lobbySessionId !== null
    && event.context.roundSessionId !== null
    && event.context.gameStateId === 4
    && messageKey.length > 0;
  const roundKey = event.context.roundSessionId === null
    ? null
    : `${event.context.lobbySessionId ?? 'unknown-lobby'}:${event.context.roundSessionId}`;

  return {
    attemptId: measurement?.attemptId ?? null,
    measurementEventId: measurement?.eventId ?? null,
    submissionEventId: event.eventId,
    submittedAt: event.occurredAt,
    lobbySessionId: event.context.lobbySessionId,
    roundSessionId: event.context.roundSessionId,
    roundKey,
    messageKey,
    wpm: measurement?.wpm ?? null,
    certified: validSubmission && measurement?.certified === true
  };
}

function thresholdMatches(wpm: number, comparison: CertifiedWpmChallengeConfig['comparison'], threshold: number): boolean {
  return comparison === 'below' ? wpm < threshold : wpm >= threshold;
}

/**
 * Creates a gateway-replayable WPM challenge from a three-event evidence
 * chain: trusted DOM timing -> decoded outgoing guess -> confirmed correct
 * guess. A later uncertified submission replaces older timing evidence so a
 * pasted/autofilled answer can never inherit a prior clean measurement.
 */
export function createCertifiedWpmChallengeDefinition(
  config: CertifiedWpmChallengeConfig,
  defaultParameters: CertifiedWpmParameters
): ChallengeDefinition<CertifiedWpmState, CertifiedWpmParameters> {
  return {
    id: config.id,
    version: 1,
    metadata: {
      category: 'guessing',
      localization: localization(
        config.name,
        config.descriptionEn,
        config.name,
        config.descriptionDe
      ),
      icon: config.icon,
      rankedEligible: false,
      difficulty: config.difficulty
    },
    defaultParameters,
    target: parameters => parameters.guesses,
    createInitialState: initialState,
    validateParameters(value): value is CertifiedWpmParameters {
      if (typeof value !== 'object' || value === null) return false;
      const parameters = value as Partial<CertifiedWpmParameters>;
      return isFinitePositiveNumber(parameters.thresholdWpm)
        && parameters.thresholdWpm <= MAX_CERTIFIED_WPM
        && isPositiveInteger(parameters.guesses);
    },
    relevantEvents: [
      'TEXT_INPUT_MEASURED',
      'GUESS_SUBMITTED',
      'CORRECT_GUESS'
    ],
    allowedLobbyTypes: [0],
    reduce({ event, runtime, parameters }) {
      const state = runtime.internalState;

      if (event.type === 'TEXT_INPUT_MEASURED') {
        const measurement = measurementFrom(event, state);
        const recent = state.pendingMeasurements.filter(candidate => {
          const ageMs = event.occurredAt - candidate.occurredAt;
          return ageMs >= 0 && ageMs <= MEASUREMENT_CORRELATION_MS;
        });
        return {
          internalState: {
            ...state,
            pendingMeasurements: [...recent, measurement].slice(-MAX_PENDING_MEASUREMENTS)
          },
          reason: measurement.certified
            ? `${config.id}-typing-evidence-observed`
            : `${config.id}-typing-evidence-rejected`
        };
      }

      if (event.type === 'GUESS_SUBMITTED') {
        const pendingSubmission = submittedEvidence(event, state);
        return {
          internalState: {
            ...state,
            pendingMeasurements: [],
            pendingSubmission
          },
          reason: pendingSubmission.certified
            ? `${config.id}-submission-correlated`
            : `${config.id}-submission-not-certified`
        };
      }

      if (event.type !== 'CORRECT_GUESS') return null;
      if (!event.actor?.isSelf || event.payload.playerId !== event.context.meId) return null;
      if (event.source.origin !== 'lobby-change' || event.confidence !== 'confirmed') return null;

      const roundKey = boundaryKey(event);
      if (roundKey === null || state.resolvedRoundKeys.includes(roundKey)) return null;
      const pending = state.pendingSubmission;
      const responseDelayMs = pending === null ? null : event.occurredAt - pending.submittedAt;
      const sameBoundary = pending !== null
        && pending.roundKey === roundKey
        && pending.lobbySessionId === event.context.lobbySessionId
        && pending.roundSessionId === event.context.roundSessionId;
      const revealedWordKey = certifiedWpmMessageKey(event.payload.word ?? '');
      const revealedWordMatches = !event.payload.includesWord
        || revealedWordKey.length === 0
        || revealedWordKey === pending?.messageKey;
      const firstGuesserMatches = !config.firstGuesserRequired
        || (event.payload.position === 1 && event.payload.isFirstGuesser === true);
      const attemptId = pending?.attemptId ?? null;
      const attemptUnused = attemptId !== null
        && !state.resolvedAttemptIds.includes(attemptId)
        && !state.qualifyingAttemptIds.includes(attemptId);
      const certified = pending?.certified === true
        && pending.wpm !== null
        && sameBoundary
        && responseDelayMs !== null
        && responseDelayMs >= 0
        && responseDelayMs <= CORRECT_GUESS_CORRELATION_MS
        && revealedWordMatches
        && firstGuesserMatches
        && attemptUnused;
      const resolvedRoundKeys = boundedUnique(state.resolvedRoundKeys, roundKey);
      const resolvedAttemptIds = attemptId === null
        ? state.resolvedAttemptIds
        : boundedUnique(state.resolvedAttemptIds, attemptId);

      if (!certified || pending === null || pending.wpm === null || attemptId === null) {
        return {
          internalState: {
            ...state,
            pendingMeasurements: [],
            pendingSubmission: null,
            resolvedAttemptIds,
            resolvedRoundKeys
          },
          reason: `${config.id}-correct-guess-not-certified`
        };
      }

      if (!thresholdMatches(pending.wpm, config.comparison, parameters.thresholdWpm)) {
        return {
          internalState: {
            ...state,
            pendingMeasurements: [],
            pendingSubmission: null,
            resolvedAttemptIds,
            resolvedRoundKeys
          },
          reason: `${config.id}-wpm-threshold-not-met`
        };
      }

      const qualifyingAttemptIds = [...state.qualifyingAttemptIds, attemptId];
      const evidenceEventIds = [
        ...state.evidenceEventIds,
        pending.measurementEventId as string,
        pending.submissionEventId,
        event.eventId
      ];
      const nextCount = qualifyingAttemptIds.length;
      return {
        internalState: {
          ...state,
          pendingMeasurements: [],
          pendingSubmission: null,
          qualifyingAttemptIds,
          resolvedAttemptIds,
          resolvedRoundKeys,
          evidenceEventIds
        },
        progress: nextCount,
        complete: nextCount >= parameters.guesses,
        reason: nextCount >= parameters.guesses
          ? config.completionReason
          : config.progressReason,
        evidenceEventIds
      };
    }
  };
}
