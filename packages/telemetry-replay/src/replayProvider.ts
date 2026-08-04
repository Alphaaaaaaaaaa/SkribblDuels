import {
  BehaviorSubject,
  Subject,
  type Observable
} from 'rxjs';
import {
  TELEMETRY_CONTRACT_VERSION,
  TELEMETRY_SCHEMA_VERSION,
  createTelemetryProviderDescriptor,
  type TelemetryEvent,
  type TelemetryEventOf,
  type TelemetryEventType,
  type TelemetryExportOptions,
  type TelemetryProvider,
  type TelemetryStats,
  type Unsubscribe
} from '@skribbl-duels/telemetry-contracts';
import { validateTelemetryFixture } from './fixture';
import {
  TELEMETRY_REPLAY_VERSION,
  type ReplayOptions,
  type ReplayResult,
  type ReplayState,
  type ReplayTimestampMode,
  type TelemetryFixture,
  type TelemetryFixtureEntry
} from './types';

const INITIAL_STATE: ReplayState = {
  status: 'idle',
  fixtureId: null,
  fixtureName: null,
  currentIndex: 0,
  totalEvents: 0,
  emittedEvents: 0,
  speed: 1,
  timestampMode: 'preserve',
  startedAt: null,
  completedAt: null,
  lastEvent: null,
  error: null
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class TelemetryReplayProvider implements TelemetryProvider {
  private readonly eventSubject = new Subject<TelemetryEvent>();
  private readonly stateSubject = new BehaviorSubject<ReplayState>(clone(INITIAL_STATE));
  private fixture: TelemetryFixture | null = null;
  private retainedEvents: TelemetryEvent[] = [];
  private stats: TelemetryStats = {
    total: 0,
    retained: 0,
    omittedHighVolume: 0,
    byType: {},
    lastEvent: null
  };
  private runGeneration = 0;
  private resumeWaiters: Array<() => void> = [];
  private replayBaseWallTime = 0;
  private replayBaseMonotonicTime = 0;

  public readonly events$: Observable<TelemetryEvent> = this.eventSubject.asObservable();
  public readonly state$: Observable<ReplayState> = this.stateSubject.asObservable();

  public get descriptor() {
    const supportedEvents = this.fixture
      ? Array.from(new Set(this.fixture.events.map(entry => entry.event.type)))
      : [];
    return createTelemetryProviderDescriptor(
      'Skribbl Duels Telemetry Replay',
      TELEMETRY_REPLAY_VERSION,
      supportedEvents
    );
  }

  public load(value: unknown): TelemetryFixture {
    const validation = validateTelemetryFixture(value);
    if (!validation.valid || !validation.fixture) {
      throw new Error(validation.issues.join('\n'));
    }

    this.stop();
    this.fixture = validation.fixture;
    this.clearEmittedHistory();
    this.stateSubject.next({
      ...clone(INITIAL_STATE),
      status: 'ready',
      fixtureId: this.fixture.metadata.fixtureId,
      fixtureName: this.fixture.metadata.name,
      totalEvents: this.fixture.events.length
    });
    return clone(this.fixture);
  }

  public getFixture(): TelemetryFixture | null {
    return this.fixture ? clone(this.fixture) : null;
  }

  public getState(): ReplayState {
    return clone(this.stateSubject.value);
  }

  public getStats(): TelemetryStats {
    return clone(this.stats);
  }

  public getRecent(options: TelemetryExportOptions = {}): TelemetryEvent[] {
    return this.retainedEvents
      .filter(event => options.includeHighVolumeEvents === true || !event.highVolume)
      .map(event => clone(event));
  }

  public getByType<TType extends TelemetryEventType>(type: TType): TelemetryEventOf<TType>[] {
    return this.retainedEvents
      .filter(event => event.type === type)
      .map(event => clone(event)) as TelemetryEventOf<TType>[];
  }

  public subscribe(listener: (event: TelemetryEvent) => void): Unsubscribe {
    const subscription = this.events$.subscribe(listener);
    return () => subscription.unsubscribe();
  }

  public subscribeState(listener: (state: ReplayState) => void): Unsubscribe {
    const subscription = this.state$.subscribe(state => listener(clone(state)));
    return () => subscription.unsubscribe();
  }

  public async play(options: ReplayOptions = {}): Promise<ReplayResult> {
    if (!this.fixture) throw new Error('No telemetry fixture is loaded.');

    const mode = options.mode ?? 'realtime';
    const speed = mode === 'instant' ? Number.POSITIVE_INFINITY : options.speed ?? 1;
    if (mode !== 'instant' && (!Number.isFinite(speed) || speed <= 0)) {
      throw new RangeError('Replay speed must be a finite number greater than zero.');
    }

    if (options.restartFromBeginning === true || this.stateSubject.value.currentIndex >= this.fixture.events.length) {
      this.clearEmittedHistory();
      this.resetPosition();
    }

    const generation = ++this.runGeneration;
    const startedAt = Date.now();
    this.replayBaseWallTime = startedAt;
    this.replayBaseMonotonicTime = performance.now();

    this.patchState({
      status: 'running',
      speed: mode === 'instant' ? 1 : speed,
      timestampMode: options.timestampMode ?? 'preserve',
      startedAt,
      completedAt: null,
      error: null
    });

    try {
      let previousOffset = this.currentEntryPreviousOffset();
      while (this.fixture && this.stateSubject.value.currentIndex < this.fixture.events.length) {
        if (generation !== this.runGeneration) break;
        await this.waitWhilePaused(generation);
        if (generation !== this.runGeneration) break;

        const index = this.stateSubject.value.currentIndex;
        const entry = this.fixture.events[index];
        if (!entry) break;

        if (mode !== 'instant') {
          const deltaMs = Math.max(0, entry.offsetMs - previousOffset) / speed;
          await this.sleepInterruptible(deltaMs, generation);
          if (generation !== this.runGeneration) break;
        }

        this.emitEntry(entry, options.timestampMode ?? 'preserve');
        previousOffset = entry.offsetMs;
      }

      if (generation === this.runGeneration && this.fixture &&
          this.stateSubject.value.currentIndex >= this.fixture.events.length) {
        this.patchState({ status: 'completed', completedAt: Date.now() });
      }
    } catch (error) {
      if (generation === this.runGeneration) {
        this.patchState({
          status: 'error',
          completedAt: Date.now(),
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return this.result();
  }

  public step(count = 1, timestampMode: ReplayTimestampMode = 'preserve'): TelemetryEvent[] {
    if (!this.fixture) throw new Error('No telemetry fixture is loaded.');
    if (!Number.isInteger(count) || count <= 0) {
      throw new RangeError('Step count must be a positive integer.');
    }

    this.runGeneration += 1;
    if (this.stateSubject.value.startedAt === null) {
      this.replayBaseWallTime = Date.now();
      this.replayBaseMonotonicTime = performance.now();
    }
    this.patchState({
      status: 'paused',
      timestampMode,
      startedAt: this.stateSubject.value.startedAt ?? Date.now(),
      completedAt: null,
      error: null
    });

    const emitted: TelemetryEvent[] = [];
    for (let index = 0; index < count; index += 1) {
      const entry = this.fixture.events[this.stateSubject.value.currentIndex];
      if (!entry) break;
      emitted.push(this.emitEntry(entry, timestampMode));
    }

    if (this.stateSubject.value.currentIndex >= this.fixture.events.length) {
      this.patchState({ status: 'completed', completedAt: Date.now() });
    }
    return emitted;
  }

  public pause(): void {
    if (this.stateSubject.value.status === 'running') {
      this.patchState({ status: 'paused' });
    }
  }

  public resume(): void {
    if (this.stateSubject.value.status !== 'paused') return;
    this.patchState({ status: 'running' });
    const waiters = this.resumeWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  public stop(): void {
    this.runGeneration += 1;
    const waiters = this.resumeWaiters.splice(0);
    for (const resolve of waiters) resolve();
    if (this.stateSubject.value.status !== 'idle') {
      this.patchState({ status: 'stopped', completedAt: Date.now() });
    }
  }

  public reset(): void {
    this.stop();
    this.clearEmittedHistory();
    this.resetPosition();
  }

  public destroy(): void {
    this.stop();
    this.eventSubject.complete();
    this.stateSubject.complete();
  }

  private resetPosition(): void {
    this.patchState({
      status: this.fixture ? 'ready' : 'idle',
      currentIndex: 0,
      emittedEvents: 0,
      startedAt: null,
      completedAt: null,
      lastEvent: null,
      error: null
    });
  }

  private clearEmittedHistory(): void {
    this.retainedEvents = [];
    this.stats = {
      total: 0,
      retained: 0,
      omittedHighVolume: 0,
      byType: {},
      lastEvent: null
    };
  }

  private currentEntryPreviousOffset(): number {
    if (!this.fixture) return 0;
    const previousIndex = this.stateSubject.value.currentIndex - 1;
    return previousIndex >= 0 ? this.fixture.events[previousIndex]?.offsetMs ?? 0 : 0;
  }

  private emitEntry(entry: TelemetryFixtureEntry, timestampMode: ReplayTimestampMode): TelemetryEvent {
    const event = clone(entry.event);
    if (timestampMode === 'rebase') {
      event.occurredAt = this.replayBaseWallTime + entry.offsetMs;
      event.monotonicMs = this.replayBaseMonotonicTime + entry.offsetMs;
    }

    const retained = !event.highVolume;
    if (retained) this.retainedEvents.unshift(event);
    this.stats = {
      total: this.stats.total + 1,
      retained: this.stats.retained + (retained ? 1 : 0),
      omittedHighVolume: this.stats.omittedHighVolume + (retained ? 0 : 1),
      byType: {
        ...this.stats.byType,
        [event.type]: (this.stats.byType[event.type] ?? 0) + 1
      },
      lastEvent: clone(event)
    };

    const nextIndex = this.stateSubject.value.currentIndex + 1;
    this.patchState({
      currentIndex: nextIndex,
      emittedEvents: this.stateSubject.value.emittedEvents + 1,
      lastEvent: clone(event)
    });
    this.eventSubject.next(event);
    return clone(event);
  }

  private async waitWhilePaused(generation: number): Promise<void> {
    while (generation === this.runGeneration && this.stateSubject.value.status === 'paused') {
      await new Promise<void>(resolve => this.resumeWaiters.push(resolve));
    }
  }

  private async sleepInterruptible(ms: number, generation: number): Promise<void> {
    let remaining = ms;
    while (remaining > 0 && generation === this.runGeneration) {
      await this.waitWhilePaused(generation);
      if (generation !== this.runGeneration) return;
      const slice = Math.min(remaining, 50);
      const before = performance.now();
      await delay(slice);
      if (this.stateSubject.value.status !== 'paused') {
        remaining -= Math.max(0, performance.now() - before);
      }
    }
  }

  private patchState(patch: Partial<ReplayState>): void {
    this.stateSubject.next({
      ...this.stateSubject.value,
      ...patch,
      lastEvent: patch.lastEvent === undefined
        ? this.stateSubject.value.lastEvent
        : patch.lastEvent
    });
  }

  private result(): ReplayResult {
    const state = this.stateSubject.value;
    return {
      status: state.status,
      fixtureId: state.fixtureId,
      emittedEvents: state.emittedEvents,
      totalEvents: state.totalEvents,
      startedAt: state.startedAt,
      completedAt: state.completedAt
    };
  }
}

export const REPLAY_CONTRACT = {
  contractVersion: TELEMETRY_CONTRACT_VERSION,
  schemaVersion: TELEMETRY_SCHEMA_VERSION,
  replayVersion: TELEMETRY_REPLAY_VERSION
} as const;
