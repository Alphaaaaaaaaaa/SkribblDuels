import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';
import type {
  DraftBoard,
  DuelParticipant,
  DuelPlayerSide,
  MatchBoardFieldState,
  MatchState,
  MatchStateEvent,
  OutboundTelemetryEnvelope,
  TelemetryGatewayStats
} from './types';
import { MATCH_STATE_CONTRACT_VERSION } from './types';

type MatchListener = (event: MatchStateEvent) => void;
type StateListener = (state: MatchState) => void;
type TelemetryTransport = (envelope: OutboundTelemetryEnvelope) => void | Promise<void>;

function initialMatchState(): MatchState {
  return {
    contractVersion: MATCH_STATE_CONTRACT_VERSION,
    matchId: null,
    phase: 'idle',
    format: null,
    boardId: null,
    winTarget: 0,
    fields: [],
    participants: [],
    scores: { self: 0, opponent: 0 },
    winner: null,
    startedAt: null,
    finishedAt: null,
    freeze: { frozen: false, reason: null, frozenAt: null },
    revision: 0
  };
}

function cloneState(state: MatchState): MatchState {
  return structuredClone(state);
}

export function normalizeMatchState(value: unknown): MatchState {
  if (!value || typeof value !== 'object') return initialMatchState();
  const input = value as Partial<MatchState>;
  const validPhases = new Set(['idle', 'matchmaking', 'ready-check', 'draft', 'countdown', 'running', 'finished']);
  const validFormats = new Set(['casual', 'ranked']);
  const fields = Array.isArray(input.fields)
    ? input.fields.filter(field => field && typeof field === 'object').map((field, fieldIndex) => {
      const item = field as Partial<MatchBoardFieldState>;
      const status = new Set(['available', 'pending', 'claimed', 'lost']).has(String(item.status))
        ? item.status as MatchBoardFieldState['status']
        : 'available';
      const owner = item.owner === 'self' || item.owner === 'opponent' ? item.owner : null;
      return {
        fieldIndex: Number.isInteger(item.fieldIndex) ? Number(item.fieldIndex) : fieldIndex,
        challengeId: typeof item.challengeId === 'string' ? item.challengeId : `unknown-${fieldIndex}`,
        definitionVersion: Number.isInteger(item.definitionVersion) ? Number(item.definitionVersion) : 1,
        status,
        owner,
        pendingCandidateId: typeof item.pendingCandidateId === 'string' ? item.pendingCandidateId : null,
        claimId: typeof item.claimId === 'string' ? item.claimId : null,
        updatedAt: Number.isFinite(item.updatedAt) ? Number(item.updatedAt) : Date.now()
      };
    })
    : [];
  const participants = Array.isArray(input.participants)
    ? input.participants.filter(item => item && typeof item === 'object').flatMap(item => {
      const participant = item as Partial<DuelParticipant>;
      if (typeof participant.playerId !== 'string' || typeof participant.displayName !== 'string' ||
          (participant.side !== 'self' && participant.side !== 'opponent')) return [];
      return [{ playerId: participant.playerId, displayName: participant.displayName, side: participant.side }];
    })
    : [];
  const selfScore = fields.filter(field => field.status === 'claimed' && field.owner === 'self').length;
  const opponentScore = fields.filter(field => field.status === 'claimed' && field.owner === 'opponent').length;
  const phase = validPhases.has(String(input.phase)) ? input.phase as MatchState['phase'] : 'idle';
  const frozen = phase === 'finished' || input.freeze?.frozen === true;
  return {
    contractVersion: MATCH_STATE_CONTRACT_VERSION,
    matchId: typeof input.matchId === 'string' ? input.matchId : null,
    phase,
    format: validFormats.has(String(input.format)) ? input.format as MatchState['format'] : null,
    boardId: typeof input.boardId === 'string' ? input.boardId : null,
    winTarget: Number.isFinite(input.winTarget) ? Math.max(0, Number(input.winTarget)) : 0,
    fields,
    participants,
    scores: { self: selfScore, opponent: opponentScore },
    winner: input.winner === 'self' || input.winner === 'opponent' ? input.winner : null,
    startedAt: Number.isFinite(input.startedAt) ? Number(input.startedAt) : null,
    finishedAt: Number.isFinite(input.finishedAt) ? Number(input.finishedAt) : null,
    freeze: {
      frozen,
      reason: frozen ? (input.freeze?.reason === 'manual' ? 'manual' : 'match-ended') : null,
      frozenAt: frozen && Number.isFinite(input.freeze?.frozenAt) ? Number(input.freeze?.frozenAt) : null
    },
    revision: Number.isInteger(input.revision) ? Math.max(0, Number(input.revision)) : 0
  };
}

export class MatchStateStore {
  private state: MatchState;
  private listeners = new Set<MatchListener>();
  private stateListeners = new Set<StateListener>();

  public constructor(initialState?: unknown) {
    this.state = initialState === undefined ? initialMatchState() : normalizeMatchState(initialState);
  }

  public restore(value: unknown, occurredAt = Date.now()): MatchState {
    this.state = normalizeMatchState(value);
    return this.emit('MATCH_RESTORED', null, null, 'session-restored', occurredAt);
  }

  public getState(): MatchState {
    return cloneState(this.state);
  }

  public subscribe(listener: MatchListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  public startMatch(
    matchId: string,
    board: DraftBoard,
    participants: readonly DuelParticipant[],
    startedAt = Date.now()
  ): MatchState {
    this.state = {
      contractVersion: MATCH_STATE_CONTRACT_VERSION,
      matchId,
      phase: 'running',
      format: board.format,
      boardId: board.boardId,
      winTarget: board.winTarget,
      fields: board.fields.map(field => ({
        ...field,
        status: 'available',
        owner: null,
        pendingCandidateId: null,
        claimId: null,
        updatedAt: startedAt
      })),
      participants: participants.map(participant => ({ ...participant })),
      scores: { self: 0, opponent: 0 },
      winner: null,
      startedAt,
      finishedAt: null,
      freeze: { frozen: false, reason: null, frozenAt: null },
      revision: this.state.revision + 1
    };
    return this.emit('MATCH_STARTED', null, null, null, startedAt);
  }

  public markPending(
    challengeId: string,
    candidateId: string,
    side: DuelPlayerSide,
    occurredAt = Date.now()
  ): MatchState {
    if (!this.isMutable()) return this.getState();
    const index = this.state.fields.findIndex(field =>
      field.challengeId === challengeId && field.status === 'available'
    );
    if (index < 0) return this.getState();
    const fields = this.state.fields.map((field, fieldIndex): MatchBoardFieldState =>
      fieldIndex === index
        ? {
          ...field,
          status: 'pending',
          owner: side,
          pendingCandidateId: candidateId,
          updatedAt: occurredAt
        }
        : field
    );
    this.state = { ...this.state, fields, revision: this.state.revision + 1 };
    return this.emit('FIELD_PENDING', index, side, null, occurredAt);
  }

  public confirmClaim(
    challengeId: string,
    claimId: string,
    side: DuelPlayerSide,
    occurredAt = Date.now()
  ): MatchState {
    if (!this.isMutable()) return this.getState();
    const index = this.state.fields.findIndex(field =>
      field.challengeId === challengeId &&
      (field.status === 'available' || (field.status === 'pending' && field.owner === side))
    );
    if (index < 0) return this.getState();

    const fields = this.state.fields.map((field, fieldIndex): MatchBoardFieldState =>
      fieldIndex === index
        ? {
          ...field,
          status: 'claimed',
          owner: side,
          pendingCandidateId: null,
          claimId,
          updatedAt: occurredAt
        }
        : field
    );
    const scores = {
      self: fields.filter(field => field.status === 'claimed' && field.owner === 'self').length,
      opponent: fields.filter(field => field.status === 'claimed' && field.owner === 'opponent').length
    };
    this.state = { ...this.state, fields, scores, revision: this.state.revision + 1 };
    this.emit('FIELD_CLAIMED', index, side, null, occurredAt);

    if (scores[side] >= this.state.winTarget) {
      return this.finishMatch(side, 'win-target-reached', occurredAt);
    }
    return this.getState();
  }

  public rejectPending(
    challengeId: string,
    reason = 'server-rejected',
    occurredAt = Date.now()
  ): MatchState {
    if (!this.isMutable()) return this.getState();
    const index = this.state.fields.findIndex(field =>
      field.challengeId === challengeId && field.status === 'pending'
    );
    if (index < 0) return this.getState();
    const fields = this.state.fields.map((field, fieldIndex): MatchBoardFieldState =>
      fieldIndex === index
        ? {
          ...field,
          status: 'available',
          owner: null,
          pendingCandidateId: null,
          updatedAt: occurredAt
        }
        : field
    );
    this.state = { ...this.state, fields, revision: this.state.revision + 1 };
    return this.emit('FIELD_REJECTED', index, null, reason, occurredAt);
  }

  public finishMatch(
    winner: DuelPlayerSide,
    reason = 'match-ended',
    occurredAt = Date.now()
  ): MatchState {
    if (this.state.phase === 'finished') return this.getState();
    this.state = {
      ...this.state,
      phase: 'finished',
      winner,
      finishedAt: occurredAt,
      freeze: {
        frozen: true,
        reason: reason === 'manual' ? 'manual' : 'match-ended',
        frozenAt: occurredAt
      },
      revision: this.state.revision + 1
    };
    return this.emit('MATCH_FINISHED', null, winner, reason, occurredAt);
  }

  public reset(reason = 'manual-reset', occurredAt = Date.now()): MatchState {
    const nextRevision = this.state.revision + 1;
    this.state = { ...initialMatchState(), revision: nextRevision };
    return this.emit('MATCH_RESET', null, null, reason, occurredAt);
  }

  public canForwardTelemetry(): boolean {
    return this.state.phase === 'running'
      && this.state.matchId !== null
      && !this.state.freeze.frozen;
  }

  private isMutable(): boolean {
    return this.state.phase === 'running' && !this.state.freeze.frozen;
  }

  private emit(
    type: MatchStateEvent['type'],
    fieldIndex: number | null,
    side: DuelPlayerSide | null,
    reason: string | null,
    occurredAt: number
  ): MatchState {
    const state = this.getState();
    const event: MatchStateEvent = { type, occurredAt, state, fieldIndex, side, reason };
    for (const listener of this.listeners) listener(event);
    for (const listener of this.stateListeners) listener(state);
    return state;
  }
}

export class MatchTelemetryGateway {
  private transport: TelemetryTransport | null = null;
  private sequence = 0;
  private stats: TelemetryGatewayStats = {
    locallyObserved: 0,
    forwarded: 0,
    suppressedAfterFreeze: 0,
    missingTransport: 0,
    lastForwardedEventId: null,
    lastSuppressedEventId: null
  };

  public constructor(private readonly matchStore: MatchStateStore) {}

  public setTransport(transport: TelemetryTransport | null): void {
    this.transport = transport;
  }

  public resetSession(): void {
    this.sequence = 0;
    this.stats = {
      locallyObserved: 0,
      forwarded: 0,
      suppressedAfterFreeze: 0,
      missingTransport: 0,
      lastForwardedEventId: null,
      lastSuppressedEventId: null
    };
  }

  public async observe(event: TelemetryEvent): Promise<OutboundTelemetryEnvelope | null> {
    this.stats.locallyObserved += 1;
    const state = this.matchStore.getState();
    if (!this.matchStore.canForwardTelemetry() || state.matchId === null) {
      if (state.freeze.frozen) {
        this.stats.suppressedAfterFreeze += 1;
        this.stats.lastSuppressedEventId = event.eventId;
      }
      return null;
    }

    const envelope: OutboundTelemetryEnvelope = {
      contractVersion: 1,
      matchId: state.matchId,
      sequence: ++this.sequence,
      sentAt: Date.now(),
      event
    };

    if (!this.transport) {
      this.stats.missingTransport += 1;
      return envelope;
    }

    await this.transport(envelope);
    this.stats.forwarded += 1;
    this.stats.lastForwardedEventId = event.eventId;
    return envelope;
  }

  public getStats(): TelemetryGatewayStats {
    return { ...this.stats };
  }
}
