import type {
  TelemetryContext,
  TelemetryEvent,
  TelemetryEventType,
  TelemetryProvider,
  Unsubscribe
} from '@skribbl-duels/telemetry-contracts';

export const CHALLENGE_ENGINE_VERSION = '0.2.0' as const;
export const CHALLENGE_ENGINE_SNAPSHOT_VERSION = 1 as const;

export type ChallengeCategory =
  | 'guessing'
  | 'drawing'
  | 'progress'
  | 'chat'
  | 'home'
  | 'lucky-fun';

export type ChallengeStatus =
  | 'inactive'
  | 'active'
  | 'completion-pending'
  | 'claimed'
  | 'lost'
  | 'expired';

export type ChallengeLifecycleBoundary =
  | 'lobby-change'
  | 'game-change'
  | 'round-change';

export interface ChallengeLocalization {
  name: string;
  description: string;
}

export interface ChallengeMetadata {
  category: ChallengeCategory;
  localization: Record<string, ChallengeLocalization>;
  /** Semantic icon key resolved by the UI asset registry (for example 'sniper-crosshair'). */
  icon?: string;
  rankedEligible: boolean;
  difficulty: number;
}

export interface ChallengeDefinitionSummary {
  id: string;
  version: number;
  metadata: ChallengeMetadata;
  defaultParameters: unknown;
}

export interface ChallengeProgress {
  current: number;
  target: number;
}

export interface ChallengeRuntimeContext {
  lobbySessionId: string | null;
  gameSessionId: string | null;
  roundSessionId: string | null;
}

export interface CompletionCandidate {
  candidateId: string;
  instanceId: string;
  challengeId: string;
  completedAt: number;
  triggerEventId: string;
  evidenceEventIds: string[];
  revision: number;
}

export interface ChallengeRuntimeSnapshot<TInternalState = unknown, TParameters = unknown> {
  instanceId: string;
  challengeId: string;
  definitionVersion: number;
  status: ChallengeStatus;
  parameters: TParameters;
  internalState: TInternalState;
  progress: ChallengeProgress;
  activatedAt: number | null;
  updatedAt: number;
  completedAt: number | null;
  claimedAt: number | null;
  lostAt: number | null;
  expiredAt: number | null;
  completionCandidate: CompletionCandidate | null;
  claimId: string | null;
  lastReason: string | null;
  lastTelemetryEventId: string | null;
  lastContext: ChallengeRuntimeContext;
  revision: number;
}

export interface ChallengeActivation<TParameters = unknown> {
  instanceId: string;
  challengeId: string;
  parameters?: TParameters;
  activatedAt?: number;
}

export interface ChallengeReducerContext<TInternalState, TParameters> {
  event: TelemetryEvent;
  runtime: Readonly<ChallengeRuntimeSnapshot<TInternalState, TParameters>>;
  parameters: Readonly<TParameters>;
  now: number;
}

export interface ChallengeReducerUpdate<TInternalState> {
  internalState?: TInternalState;
  progress?: number;
  progressDelta?: number;
  /** Allows a definition to bind its target to authoritative telemetry context (for example language metrics). */
  target?: number;
  complete?: boolean;
  reset?: boolean;
  reason?: string;
  evidenceEventIds?: string[];
}

export interface ChallengeDefinition<TInternalState = unknown, TParameters = unknown> {
  id: string;
  version: number;
  metadata: ChallengeMetadata;
  defaultParameters: TParameters;
  target(parameters: Readonly<TParameters>): number;
  createInitialState(parameters: Readonly<TParameters>): TInternalState;
  validateParameters?(parameters: unknown): parameters is TParameters;
  relevantEvents?: readonly TelemetryEventType[];
  allowedLobbyTypes?: readonly number[];
  /** Resets progress/internal state only while the instance is active; pending or resolved claims are preserved. */
  resetOn?: readonly ChallengeLifecycleBoundary[];
  reduce(
    context: ChallengeReducerContext<TInternalState, TParameters>
  ): ChallengeReducerUpdate<TInternalState> | null;
}

export type AnyChallengeDefinition = ChallengeDefinition<any, any>; // Type-erased registry entry.

export type ChallengeEngineEventType =
  | 'DEFINITION_REGISTERED'
  | 'CHALLENGE_ACTIVATED'
  | 'CHALLENGE_DEACTIVATED'
  | 'CHALLENGE_PROGRESS_UPDATED'
  | 'CHALLENGE_RESET'
  | 'CHALLENGE_COMPLETION_CANDIDATE'
  | 'CHALLENGE_CLAIMED'
  | 'CHALLENGE_LOST'
  | 'CHALLENGE_REOPENED'
  | 'CHALLENGE_EXPIRED'
  | 'CHALLENGE_RESTORED'
  | 'CHALLENGE_ERROR'
  | 'PROVIDER_ATTACHED'
  | 'ENGINE_RESET';

export interface ChallengeEngineEvent {
  engineSequence: number;
  type: ChallengeEngineEventType;
  occurredAt: number;
  instanceId: string | null;
  challengeId: string | null;
  telemetryEventId: string | null;
  reason: string | null;
  runtime: ChallengeRuntimeSnapshot | null;
  details: Record<string, unknown>;
}

export interface ChallengeEngineStats {
  registeredDefinitions: number;
  instances: number;
  inactive: number;
  active: number;
  completionPending: number;
  claimed: number;
  lost: number;
  expired: number;
  processedTelemetryEvents: number;
  duplicateTelemetryEvents: number;
  reducerErrors: number;
  completionCandidates: number;
  lastEngineEvent: ChallengeEngineEvent | null;
}

export interface ChallengeEngineSnapshot {
  snapshotVersion: typeof CHALLENGE_ENGINE_SNAPSHOT_VERSION;
  engineVersion: typeof CHALLENGE_ENGINE_VERSION;
  savedAt: number;
  instances: ChallengeRuntimeSnapshot[];
  recentProcessedEventIds: string[];
}

export interface ChallengePersistenceAdapter {
  load(): Promise<ChallengeEngineSnapshot | null>;
  save(snapshot: ChallengeEngineSnapshot): Promise<void>;
  clear(): Promise<void>;
}

export interface ChallengeEngineOptions {
  persistence?: ChallengePersistenceAdapter;
  autoPersist?: boolean;
  persistDebounceMs?: number;
  maxProcessedEventIds?: number;
  now?: () => number;
  createId?: () => string;
}

export interface CompletionResolution {
  outcome: 'claimed' | 'lost' | 'reopen';
  claimId?: string;
  reason?: string;
  resolvedAt?: number;
}

export interface ChallengeProviderAttachment {
  provider: TelemetryProvider;
  sourceName: string;
  unsubscribe: Unsubscribe;
}

export interface ChallengeEnginePublicApi {
  readonly version: typeof CHALLENGE_ENGINE_VERSION;
  register<TInternalState, TParameters>(
    definition: ChallengeDefinition<TInternalState, TParameters>
  ): void;
  activate<TParameters = unknown>(activation: ChallengeActivation<TParameters>): ChallengeRuntimeSnapshot;
  deactivate(instanceId: string, reason?: string): boolean;
  process(event: TelemetryEvent): ChallengeEngineEvent[];
  processMany(events: readonly TelemetryEvent[]): ChallengeEngineEvent[];
  resolveCompletion(instanceId: string, resolution: CompletionResolution): ChallengeRuntimeSnapshot;
  expire(instanceId: string, reason?: string): ChallengeRuntimeSnapshot;
  reset(reason?: string): void;
  getDefinitionIds(): string[];
  getDefinitions(): ChallengeDefinitionSummary[];
  getInstance(instanceId: string): ChallengeRuntimeSnapshot | null;
  getInstances(): ChallengeRuntimeSnapshot[];
  getStats(): ChallengeEngineStats;
  exportSnapshot(): ChallengeEngineSnapshot;
  importSnapshot(snapshot: ChallengeEngineSnapshot): ChallengeEngineSnapshot;
  restore(): Promise<ChallengeEngineSnapshot | null>;
  clearPersistence(): Promise<void>;
  attachProvider(provider: TelemetryProvider, sourceName?: string): Unsubscribe;
  subscribe(listener: (event: ChallengeEngineEvent) => void): Unsubscribe;
  subscribeState(listener: (instances: ChallengeRuntimeSnapshot[]) => void): Unsubscribe;
}

export function runtimeContextFromTelemetry(context: TelemetryContext): ChallengeRuntimeContext {
  return {
    lobbySessionId: context.lobbySessionId,
    gameSessionId: context.gameSessionId,
    roundSessionId: context.roundSessionId
  };
}
