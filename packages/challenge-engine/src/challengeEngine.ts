import {
  BehaviorSubject,
  Subject,
  type Observable
} from 'rxjs';
import type {
  TelemetryEvent,
  TelemetryProvider,
  Unsubscribe
} from '@skribbl-duels/telemetry-contracts';
import {
  CHALLENGE_ENGINE_SNAPSHOT_VERSION,
  CHALLENGE_ENGINE_VERSION,
  runtimeContextFromTelemetry,
  type AnyChallengeDefinition,
  type ChallengeActivation,
  type ChallengeDefinition,
  type ChallengeDefinitionSummary,
  type ChallengeEngineEvent,
  type ChallengeEngineOptions,
  type ChallengeEngineSnapshot,
  type ChallengeEngineStats,
  type ChallengeLifecycleBoundary,
  type ChallengeReducerUpdate,
  type ChallengeRuntimeContext,
  type ChallengeRuntimeSnapshot,
  type CompletionResolution
} from './types';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function defaultCreateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function emptyContext(): ChallengeRuntimeContext {
  return {
    lobbySessionId: null,
    gameSessionId: null,
    roundSessionId: null
  };
}

function statusCounts(instances: Iterable<ChallengeRuntimeSnapshot>): Pick<
  ChallengeEngineStats,
  'instances' | 'inactive' | 'active' | 'completionPending' | 'claimed' | 'lost' | 'expired'
> {
  const counts = {
    instances: 0,
    inactive: 0,
    active: 0,
    completionPending: 0,
    claimed: 0,
    lost: 0,
    expired: 0
  };

  for (const runtime of instances) {
    counts.instances += 1;
    if (runtime.status === 'inactive') counts.inactive += 1;
    else if (runtime.status === 'active') counts.active += 1;
    else if (runtime.status === 'completion-pending') counts.completionPending += 1;
    else if (runtime.status === 'claimed') counts.claimed += 1;
    else if (runtime.status === 'lost') counts.lost += 1;
    else if (runtime.status === 'expired') counts.expired += 1;
  }

  return counts;
}

function boundaryChanged(
  boundary: ChallengeLifecycleBoundary,
  previous: ChallengeRuntimeContext,
  next: ChallengeRuntimeContext
): boolean {
  if (boundary === 'lobby-change') {
    return previous.lobbySessionId !== null &&
      previous.lobbySessionId !== next.lobbySessionId;
  }
  if (boundary === 'game-change') {
    return previous.gameSessionId !== null &&
      previous.gameSessionId !== next.gameSessionId;
  }
  return previous.roundSessionId !== null &&
    previous.roundSessionId !== next.roundSessionId;
}

export class ChallengeEngine {
  private readonly definitions = new Map<string, AnyChallengeDefinition>();
  private readonly instances = new Map<string, ChallengeRuntimeSnapshot>();
  private readonly processedEventIds = new Set<string>();
  private readonly processedEventOrder: string[] = [];
  private readonly eventSubject = new Subject<ChallengeEngineEvent>();
  private readonly stateSubject = new BehaviorSubject<ChallengeRuntimeSnapshot[]>([]);
  private readonly statsSubject = new BehaviorSubject<ChallengeEngineStats>({
    registeredDefinitions: 0,
    instances: 0,
    inactive: 0,
    active: 0,
    completionPending: 0,
    claimed: 0,
    lost: 0,
    expired: 0,
    processedTelemetryEvents: 0,
    duplicateTelemetryEvents: 0,
    reducerErrors: 0,
    completionCandidates: 0,
    lastEngineEvent: null
  });
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly maxProcessedEventIds: number;
  private readonly autoPersist: boolean;
  private readonly persistDebounceMs: number;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private engineSequence = 0;

  public readonly events$: Observable<ChallengeEngineEvent> = this.eventSubject.asObservable();
  public readonly state$: Observable<ChallengeRuntimeSnapshot[]> = this.stateSubject.asObservable();
  public readonly stats$: Observable<ChallengeEngineStats> = this.statsSubject.asObservable();

  public constructor(private readonly options: ChallengeEngineOptions = {}) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? defaultCreateId;
    this.maxProcessedEventIds = options.maxProcessedEventIds ?? 2000;
    this.autoPersist = options.autoPersist ?? Boolean(options.persistence);
    this.persistDebounceMs = options.persistDebounceMs ?? 150;
  }

  public register<TInternalState, TParameters>(
    definition: ChallengeDefinition<TInternalState, TParameters>
  ): void {
    if (!definition.id.trim()) throw new Error('Challenge definition id cannot be empty.');
    if (!Number.isInteger(definition.version) || definition.version <= 0) {
      throw new RangeError(`Challenge ${definition.id} must have a positive integer version.`);
    }
    if (this.definitions.has(definition.id)) {
      throw new Error(`Challenge definition ${definition.id} is already registered.`);
    }

    const target = definition.target(definition.defaultParameters);
    this.assertProgressValue(target, `default target for ${definition.id}`);
    this.definitions.set(definition.id, definition as AnyChallengeDefinition);
    this.emitEngineEvent('DEFINITION_REGISTERED', null, null, null, {
      definitionVersion: definition.version,
      category: definition.metadata.category
    });
    this.publishState();
  }

  public activate<TParameters = unknown>(
    activation: ChallengeActivation<TParameters>
  ): ChallengeRuntimeSnapshot {
    if (this.instances.has(activation.instanceId)) {
      throw new Error(`Challenge instance ${activation.instanceId} already exists.`);
    }

    const definition = this.requireDefinition(activation.challengeId);
    const parameters = activation.parameters === undefined
      ? clone(definition.defaultParameters)
      : clone(activation.parameters);

    if (definition.validateParameters && !definition.validateParameters(parameters)) {
      throw new TypeError(`Invalid parameters for challenge ${definition.id}.`);
    }

    const target = definition.target(parameters as any);
    this.assertProgressValue(target, `target for ${definition.id}`);
    if (target <= 0) throw new RangeError(`Challenge ${definition.id} target must be greater than zero.`);

    const now = activation.activatedAt ?? this.now();
    const runtime: ChallengeRuntimeSnapshot = {
      instanceId: activation.instanceId,
      challengeId: activation.challengeId,
      definitionVersion: definition.version,
      status: 'active',
      parameters,
      internalState: clone(definition.createInitialState(parameters as any)),
      progress: { current: 0, target },
      activatedAt: now,
      updatedAt: now,
      completedAt: null,
      claimedAt: null,
      lostAt: null,
      expiredAt: null,
      completionCandidate: null,
      claimId: null,
      lastReason: 'activated',
      lastTelemetryEventId: null,
      lastContext: emptyContext(),
      revision: 1
    };

    this.instances.set(runtime.instanceId, runtime);
    this.emitEngineEvent('CHALLENGE_ACTIVATED', runtime, null, 'activated');
    this.publishState();
    return clone(runtime);
  }

  public deactivate(instanceId: string, reason = 'deactivated'): boolean {
    const runtime = this.instances.get(instanceId);
    if (!runtime) return false;
    this.instances.delete(instanceId);
    this.emitEngineEvent('CHALLENGE_DEACTIVATED', runtime, null, reason);
    this.publishState();
    return true;
  }

  public process(event: TelemetryEvent): ChallengeEngineEvent[] {
    if (this.processedEventIds.has(event.eventId)) {
      this.patchStats({ duplicateTelemetryEvents: this.statsSubject.value.duplicateTelemetryEvents + 1 });
      return [];
    }
    this.rememberEventId(event.eventId);
    this.patchStats({ processedTelemetryEvents: this.statsSubject.value.processedTelemetryEvents + 1 });

    const emitted: ChallengeEngineEvent[] = [];
    for (const runtime of Array.from(this.instances.values())) {
      if (runtime.status !== 'active') continue;
      const definition = this.requireDefinition(runtime.challengeId);

      const lifecycleReset = this.findLifecycleReset(definition, runtime, event);
      if (lifecycleReset) {
        emitted.push(this.resetRuntime(runtime, definition, event, lifecycleReset));
      }

      const current = this.instances.get(runtime.instanceId);
      if (!current || current.status !== 'active') continue;

      if (definition.relevantEvents && !definition.relevantEvents.includes(event.type)) {
        this.updateLastContext(current, event);
        continue;
      }

      if (definition.allowedLobbyTypes &&
          (event.context.lobbyType === null || !definition.allowedLobbyTypes.includes(event.context.lobbyType))) {
        this.updateLastContext(current, event);
        continue;
      }

      try {
        const update = definition.reduce({
          event,
          runtime: clone(current),
          parameters: clone(current.parameters) as any,
          now: this.now()
        });
        if (update) emitted.push(...this.applyReducerUpdate(current, definition, event, update));
        else this.updateLastContext(current, event);
      } catch (error) {
        this.patchStats({ reducerErrors: this.statsSubject.value.reducerErrors + 1 });
        emitted.push(this.emitEngineEvent(
          'CHALLENGE_ERROR',
          current,
          event.eventId,
          error instanceof Error ? error.message : String(error),
          { error: error instanceof Error ? error.stack ?? error.message : String(error) }
        ));
      }
    }

    if (emitted.length > 0) this.publishState();
    return emitted.map(clone);
  }

  public processMany(events: readonly TelemetryEvent[]): ChallengeEngineEvent[] {
    const output: ChallengeEngineEvent[] = [];
    for (const event of events) output.push(...this.process(event));
    return output;
  }

  public resolveCompletion(
    instanceId: string,
    resolution: CompletionResolution
  ): ChallengeRuntimeSnapshot {
    const runtime = this.requireInstance(instanceId);
    if (runtime.status !== 'completion-pending') {
      throw new Error(`Challenge ${instanceId} is not awaiting completion resolution.`);
    }

    const now = resolution.resolvedAt ?? this.now();
    runtime.updatedAt = now;
    runtime.revision += 1;
    runtime.lastReason = resolution.reason ?? resolution.outcome;

    if (resolution.outcome === 'claimed') {
      runtime.status = 'claimed';
      runtime.claimedAt = now;
      runtime.claimId = resolution.claimId ?? this.createId();
      this.emitEngineEvent('CHALLENGE_CLAIMED', runtime, null, runtime.lastReason, {
        claimId: runtime.claimId
      });
    } else if (resolution.outcome === 'lost') {
      runtime.status = 'lost';
      runtime.lostAt = now;
      this.emitEngineEvent('CHALLENGE_LOST', runtime, null, runtime.lastReason);
    } else {
      runtime.status = 'active';
      runtime.completedAt = null;
      runtime.completionCandidate = null;
      this.emitEngineEvent('CHALLENGE_REOPENED', runtime, null, runtime.lastReason);
    }

    this.publishState();
    return clone(runtime);
  }

  public expire(instanceId: string, reason = 'expired'): ChallengeRuntimeSnapshot {
    const runtime = this.requireInstance(instanceId);
    const now = this.now();
    runtime.status = 'expired';
    runtime.expiredAt = now;
    runtime.updatedAt = now;
    runtime.lastReason = reason;
    runtime.revision += 1;
    this.emitEngineEvent('CHALLENGE_EXPIRED', runtime, null, reason);
    this.publishState();
    return clone(runtime);
  }

  public reset(reason = 'engine-reset'): void {
    this.instances.clear();
    this.processedEventIds.clear();
    this.processedEventOrder.length = 0;
    this.emitEngineEvent('ENGINE_RESET', null, null, reason);
    this.publishState();
  }

  public getDefinitionIds(): string[] {
    return Array.from(this.definitions.keys()).sort();
  }

  public getDefinitions(): ChallengeDefinitionSummary[] {
    return Array.from(this.definitions.values())
      .map(definition => ({
        id: definition.id,
        version: definition.version,
        metadata: clone(definition.metadata),
        defaultParameters: clone(definition.defaultParameters)
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  public getInstance(instanceId: string): ChallengeRuntimeSnapshot | null {
    const runtime = this.instances.get(instanceId);
    return runtime ? clone(runtime) : null;
  }

  public getInstances(): ChallengeRuntimeSnapshot[] {
    return Array.from(this.instances.values()).map(clone);
  }

  public getStats(): ChallengeEngineStats {
    return clone(this.statsSubject.value);
  }

  public exportSnapshot(): ChallengeEngineSnapshot {
    return {
      snapshotVersion: CHALLENGE_ENGINE_SNAPSHOT_VERSION,
      engineVersion: CHALLENGE_ENGINE_VERSION,
      savedAt: this.now(),
      instances: this.getInstances(),
      recentProcessedEventIds: [...this.processedEventOrder]
    };
  }

  public async restore(): Promise<ChallengeEngineSnapshot | null> {
    const snapshot = await this.options.persistence?.load() ?? null;
    if (!snapshot) return null;
    if (snapshot.snapshotVersion !== CHALLENGE_ENGINE_SNAPSHOT_VERSION) {
      throw new Error(`Unsupported challenge snapshot version ${snapshot.snapshotVersion}.`);
    }

    this.instances.clear();
    for (const stored of snapshot.instances) {
      const definition = this.definitions.get(stored.challengeId);
      if (!definition) continue;
      if (definition.version !== stored.definitionVersion) continue;
      this.instances.set(stored.instanceId, clone(stored));
      this.emitEngineEvent('CHALLENGE_RESTORED', stored, null, 'restored');
    }

    this.processedEventIds.clear();
    this.processedEventOrder.length = 0;
    for (const eventId of snapshot.recentProcessedEventIds.slice(-this.maxProcessedEventIds)) {
      this.processedEventIds.add(eventId);
      this.processedEventOrder.push(eventId);
    }
    this.publishState();
    return clone(snapshot);
  }

  public async clearPersistence(): Promise<void> {
    await this.options.persistence?.clear();
  }

  public attachProvider(provider: TelemetryProvider, sourceName = provider.descriptor.providerName): Unsubscribe {
    const unsubscribe = provider.subscribe(event => this.process(event));
    this.emitEngineEvent('PROVIDER_ATTACHED', null, null, 'provider-attached', {
      sourceName,
      providerVersion: provider.descriptor.providerVersion,
      contractVersion: provider.descriptor.contractVersion
    });
    return unsubscribe;
  }

  public subscribe(listener: (event: ChallengeEngineEvent) => void): Unsubscribe {
    const subscription = this.events$.subscribe(event => listener(clone(event)));
    return () => subscription.unsubscribe();
  }

  public subscribeState(listener: (instances: ChallengeRuntimeSnapshot[]) => void): Unsubscribe {
    const subscription = this.state$.subscribe(instances => listener(clone(instances)));
    return () => subscription.unsubscribe();
  }

  private applyReducerUpdate(
    runtime: ChallengeRuntimeSnapshot,
    definition: AnyChallengeDefinition,
    event: TelemetryEvent,
    update: ChallengeReducerUpdate<unknown>
  ): ChallengeEngineEvent[] {
    if (update.reset) {
      return [this.resetRuntime(runtime, definition, event, update.reason ?? 'definition-reset')];
    }
    if (update.progress !== undefined && update.progressDelta !== undefined) {
      throw new Error(`Challenge ${definition.id} reducer cannot set progress and progressDelta together.`);
    }

    const previousProgress = runtime.progress.current;
    if (update.internalState !== undefined) runtime.internalState = clone(update.internalState);
    if (update.progress !== undefined) runtime.progress.current = update.progress;
    if (update.progressDelta !== undefined) runtime.progress.current += update.progressDelta;
    runtime.progress.current = Math.max(0, Math.min(runtime.progress.target, runtime.progress.current));
    runtime.updatedAt = this.now();
    runtime.lastReason = update.reason ?? null;
    runtime.lastTelemetryEventId = event.eventId;
    runtime.lastContext = runtimeContextFromTelemetry(event.context);
    runtime.revision += 1;

    const output: ChallengeEngineEvent[] = [];
    if (runtime.progress.current !== previousProgress || update.internalState !== undefined) {
      output.push(this.emitEngineEvent(
        'CHALLENGE_PROGRESS_UPDATED',
        runtime,
        event.eventId,
        update.reason ?? 'progress-updated',
        { previousProgress, currentProgress: runtime.progress.current }
      ));
    }

    const completed = update.complete === true || runtime.progress.current >= runtime.progress.target;
    if (completed && runtime.status === 'active') {
      const evidenceEventIds = Array.from(new Set([
        ...(update.evidenceEventIds ?? []),
        event.eventId
      ]));
      runtime.status = 'completion-pending';
      runtime.completedAt = this.now();
      runtime.completionCandidate = {
        candidateId: this.createId(),
        instanceId: runtime.instanceId,
        challengeId: runtime.challengeId,
        completedAt: runtime.completedAt,
        triggerEventId: event.eventId,
        evidenceEventIds,
        revision: runtime.revision
      };
      this.patchStats({ completionCandidates: this.statsSubject.value.completionCandidates + 1 });
      output.push(this.emitEngineEvent(
        'CHALLENGE_COMPLETION_CANDIDATE',
        runtime,
        event.eventId,
        update.reason ?? 'target-reached',
        { candidate: clone(runtime.completionCandidate) }
      ));
    }

    return output;
  }

  private resetRuntime(
    runtime: ChallengeRuntimeSnapshot,
    definition: AnyChallengeDefinition,
    event: TelemetryEvent,
    reason: string
  ): ChallengeEngineEvent {
    const previousProgress = clone(runtime.progress);
    runtime.internalState = clone(definition.createInitialState(runtime.parameters as any));
    runtime.progress.current = 0;
    runtime.status = 'active';
    runtime.completedAt = null;
    runtime.claimedAt = null;
    runtime.lostAt = null;
    runtime.expiredAt = null;
    runtime.completionCandidate = null;
    runtime.claimId = null;
    runtime.updatedAt = this.now();
    runtime.lastReason = reason;
    runtime.lastTelemetryEventId = event.eventId;
    runtime.lastContext = runtimeContextFromTelemetry(event.context);
    runtime.revision += 1;
    return this.emitEngineEvent('CHALLENGE_RESET', runtime, event.eventId, reason, { previousProgress });
  }

  private findLifecycleReset(
    definition: AnyChallengeDefinition,
    runtime: ChallengeRuntimeSnapshot,
    event: TelemetryEvent
  ): string | null {
    const next = runtimeContextFromTelemetry(event.context);
    for (const boundary of definition.resetOn ?? []) {
      if (boundaryChanged(boundary, runtime.lastContext, next)) return boundary;
    }
    return null;
  }

  private updateLastContext(runtime: ChallengeRuntimeSnapshot, event: TelemetryEvent): void {
    runtime.lastContext = runtimeContextFromTelemetry(event.context);
    runtime.lastTelemetryEventId = event.eventId;
  }

  private rememberEventId(eventId: string): void {
    this.processedEventIds.add(eventId);
    this.processedEventOrder.push(eventId);
    while (this.processedEventOrder.length > this.maxProcessedEventIds) {
      const removed = this.processedEventOrder.shift();
      if (removed) this.processedEventIds.delete(removed);
    }
  }

  private requireDefinition(challengeId: string): AnyChallengeDefinition {
    const definition = this.definitions.get(challengeId);
    if (!definition) throw new Error(`Challenge definition ${challengeId} is not registered.`);
    return definition;
  }

  private requireInstance(instanceId: string): ChallengeRuntimeSnapshot {
    const runtime = this.instances.get(instanceId);
    if (!runtime) throw new Error(`Challenge instance ${instanceId} does not exist.`);
    return runtime;
  }

  private assertProgressValue(value: number, label: string): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${label} must be a finite non-negative number.`);
    }
  }

  private emitEngineEvent(
    type: ChallengeEngineEvent['type'],
    runtime: ChallengeRuntimeSnapshot | null,
    telemetryEventId: string | null,
    reason: string | null,
    details: Record<string, unknown> = {}
  ): ChallengeEngineEvent {
    const event: ChallengeEngineEvent = {
      engineSequence: ++this.engineSequence,
      type,
      occurredAt: this.now(),
      instanceId: runtime?.instanceId ?? null,
      challengeId: runtime?.challengeId ?? null,
      telemetryEventId,
      reason,
      runtime: runtime ? clone(runtime) : null,
      details: clone(details)
    };
    this.eventSubject.next(event);
    this.patchStats({ lastEngineEvent: event });
    return event;
  }

  private patchStats(patch: Partial<ChallengeEngineStats>): void {
    this.statsSubject.next({ ...this.statsSubject.value, ...clone(patch) });
  }

  private publishState(): void {
    const instances = this.getInstances();
    const counts = statusCounts(instances);
    this.stateSubject.next(instances);
    this.statsSubject.next({
      ...this.statsSubject.value,
      registeredDefinitions: this.definitions.size,
      ...counts
    });
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (!this.autoPersist || !this.options.persistence) return;
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.options.persistence?.save(this.exportSnapshot()).catch(error => {
        this.patchStats({ reducerErrors: this.statsSubject.value.reducerErrors + 1 });
        this.emitEngineEvent(
          'CHALLENGE_ERROR',
          null,
          null,
          error instanceof Error ? error.message : String(error),
          { stage: 'persistence-save' }
        );
      });
    }, this.persistDebounceMs);
  }
}
