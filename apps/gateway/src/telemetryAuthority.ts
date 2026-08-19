import { randomUUID } from 'node:crypto';
import {
  ChallengeEngine,
  type ChallengeEngineSnapshot,
  type CompletionCandidate
} from '@skribbl-duels/challenge-engine';
import {
  registerStarterChallengeDefinitions
} from '@skribbl-duels/challenge-definitions';
import type {
  GatewayClaimCandidateMessage,
  GatewayDraftBoardSnapshot,
  GatewayTelemetryBatchMessage
} from '@skribbl-duels/gateway-contracts';

export type TelemetryAuthorityDecision =
  | { ok: true; lastSequence: number }
  | { ok: false; code: string; message: string; lastSequence: number };

export type ClaimValidationDecision =
  | { ok: true; instanceId: string; candidate: CompletionCandidate }
  | { ok: false; code: string; message: string };

export interface GatewayTelemetryAuthoritySnapshot {
  snapshotVersion: 1;
  accountId: string;
  startedAt: number;
  eventClock: number;
  lastSequence: number;
  engine: ChallengeEngineSnapshot;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(left);
  return expected.size === left.length && right.every(value => expected.has(value));
}

export class GatewayPlayerTelemetryAuthority {
  private readonly engine: ChallengeEngine;
  private readonly instanceIds = new Map<string, string>();
  private eventClock: number;
  private lastSequence = 0;

  public constructor(
    private readonly accountId: string,
    board: GatewayDraftBoardSnapshot,
    private readonly startedAt: number,
    snapshot?: GatewayTelemetryAuthoritySnapshot
  ) {
    this.eventClock = startedAt;
    this.engine = new ChallengeEngine({
      now: () => this.eventClock,
      createId: () => randomUUID(),
      autoPersist: false,
      maxProcessedEventIds: 4_000
    });
    registerStarterChallengeDefinitions(this.engine);
    for (const field of board.fields) {
      const instanceId = `gateway-${accountId}-field-${field.fieldIndex}`;
      this.instanceIds.set(field.challengeId, instanceId);
      this.engine.activate({
        instanceId,
        challengeId: field.challengeId,
        activatedAt: startedAt
      });
    }
    if (snapshot) {
      if (snapshot.snapshotVersion !== 1
          || snapshot.accountId !== accountId
          || snapshot.startedAt !== startedAt) {
        throw new Error('Durable telemetry authority snapshot does not match the participant or match start.');
      }
      this.eventClock = Math.max(startedAt, snapshot.eventClock);
      this.lastSequence = snapshot.lastSequence;
      this.engine.importSnapshot(snapshot.engine);
    }
  }

  public getLastSequence(): number {
    return this.lastSequence;
  }

  public exportSnapshot(): GatewayTelemetryAuthoritySnapshot {
    return {
      snapshotVersion: 1,
      accountId: this.accountId,
      startedAt: this.startedAt,
      eventClock: this.eventClock,
      lastSequence: this.lastSequence,
      engine: this.engine.exportSnapshot()
    };
  }

  public processBatch(
    message: GatewayTelemetryBatchMessage,
    receivedAt: number
  ): TelemetryAuthorityDecision {
    if (message.lastSequence <= this.lastSequence) {
      return { ok: true, lastSequence: this.lastSequence };
    }
    if (message.firstSequence <= this.lastSequence) {
      return {
        ok: false,
        code: 'TELEMETRY_SEQUENCE_OVERLAP',
        message: `Telemetry overlaps accepted sequence ${this.lastSequence}.`,
        lastSequence: this.lastSequence
      };
    }
    if (message.firstSequence !== this.lastSequence + 1) {
      return {
        ok: false,
        code: 'TELEMETRY_SEQUENCE_GAP',
        message: `Telemetry sequence ${this.lastSequence + 1} was expected.`,
        lastSequence: this.lastSequence
      };
    }
    const eventIds = new Set<string>();
    for (const envelope of message.envelopes) {
      if (eventIds.has(envelope.event.eventId)) {
        return {
          ok: false,
          code: 'TELEMETRY_EVENT_DUPLICATED',
          message: 'A telemetry event ID occurs more than once in the batch.',
          lastSequence: this.lastSequence
        };
      }
      eventIds.add(envelope.event.eventId);
      if (envelope.event.occurredAt < this.startedAt - 5_000
          || envelope.event.occurredAt > receivedAt + 10_000) {
        return {
          ok: false,
          code: 'TELEMETRY_TIME_INVALID',
          message: 'Telemetry occurred outside the active match time window.',
          lastSequence: this.lastSequence
        };
      }
    }

    for (const envelope of message.envelopes) {
      this.eventClock = Math.max(this.eventClock, envelope.event.occurredAt);
      this.engine.process(envelope.event);
    }
    this.lastSequence = message.lastSequence;
    return { ok: true, lastSequence: this.lastSequence };
  }

  public validateClaim(message: GatewayClaimCandidateMessage): ClaimValidationDecision {
    if (message.throughSequence > this.lastSequence) {
      return {
        ok: false,
        code: 'CLAIM_TELEMETRY_NOT_CAUGHT_UP',
        message: `Telemetry is only confirmed through sequence ${this.lastSequence}.`
      };
    }
    const instanceId = this.instanceIds.get(message.challengeId);
    if (!instanceId) {
      return {
        ok: false,
        code: 'CLAIM_CHALLENGE_NOT_ON_BOARD',
        message: 'The requested challenge is not present on the authoritative board.'
      };
    }
    const runtime = this.engine.getInstance(instanceId);
    if (!runtime || runtime.definitionVersion !== message.definitionVersion) {
      return {
        ok: false,
        code: 'CLAIM_DEFINITION_MISMATCH',
        message: 'The claim definition does not match the authoritative board version.'
      };
    }
    const candidate = runtime.completionCandidate;
    if (runtime.status !== 'completion-pending' || !candidate) {
      return {
        ok: false,
        code: 'CLAIM_NOT_VALIDATED',
        message: 'The authoritative challenge engine has no matching completion candidate.'
      };
    }
    if (!sameStrings(candidate.evidenceEventIds, message.evidenceEventIds)) {
      return {
        ok: false,
        code: 'CLAIM_EVIDENCE_MISMATCH',
        message: 'The submitted evidence does not match the authoritative completion candidate.'
      };
    }
    return { ok: true, instanceId, candidate };
  }

  public acceptClaim(instanceId: string, claimId: string, occurredAt: number): void {
    this.eventClock = Math.max(this.eventClock, occurredAt);
    this.engine.resolveCompletion(instanceId, {
      outcome: 'claimed',
      claimId,
      reason: 'gateway-authoritative-claim',
      resolvedAt: occurredAt
    });
  }

  public closeChallenge(challengeId: string): void {
    const instanceId = this.instanceIds.get(challengeId);
    if (instanceId) this.engine.deactivate(instanceId, 'gateway-field-already-claimed');
  }

  public destroy(): void {
    this.engine.destroy();
    this.instanceIds.clear();
  }
}
