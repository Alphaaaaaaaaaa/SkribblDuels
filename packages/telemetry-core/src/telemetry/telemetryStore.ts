import {
  BehaviorSubject,
  Subject,
  type Observable,
  type Subscription
} from 'rxjs';
import { createId } from '../core/ids';
import type { DecodedSocketRecord } from '../protocol/types';
import type { LobbyStateChange } from '../state/lobbyState';
import type { LobbyStateStore } from '../state/lobbyStateStore';
import {
  createTelemetryContext,
  mapDecodedRecordToTelemetry,
  mapLobbyChangeToTelemetry,
  sourceFromChange,
  sourceFromDecoded,
  type TelemetryDraft
} from './telemetryMapper';
import { TELEMETRY_EVENT_CATEGORIES } from '@skribbl-duels/telemetry-contracts';
import type {
  TelemetryEvent,
  TelemetryEventOf,
  TelemetryEventType,
  TelemetryExportOptions,
  TelemetryPayloadMap,
  TelemetrySource,
  TelemetryStats
} from '@skribbl-duels/telemetry-contracts';

export class TelemetryStore {
  private readonly eventSubject = new Subject<TelemetryEvent>();
  private readonly statsSubject = new BehaviorSubject<TelemetryStats>({
    total: 0,
    retained: 0,
    omittedHighVolume: 0,
    byType: {},
    lastEvent: null
  });
  private readonly subscriptions: Subscription[] = [];
  private readonly retainedEvents: TelemetryEvent[] = [];
  private telemetrySequence = 0;

  public readonly events$: Observable<TelemetryEvent> = this.eventSubject.asObservable();
  public readonly stats$: Observable<TelemetryStats> = this.statsSubject.asObservable();

  public constructor(
    decoded$: Observable<DecodedSocketRecord>,
    changes$: Observable<LobbyStateChange>,
    private readonly lobbyStore: LobbyStateStore,
    private readonly maxRetainedEvents = 5000
  ) {
    this.subscriptions.push(
      changes$.subscribe(change => this.handleChange(change)),
      decoded$.subscribe(record => this.handleDecoded(record))
    );
  }

  public getStats(): TelemetryStats {
    const stats = this.statsSubject.value;
    return {
      ...stats,
      byType: { ...stats.byType },
      lastEvent: stats.lastEvent ? structuredClone(stats.lastEvent) : null
    };
  }

  public getRecent(options: TelemetryExportOptions = {}): TelemetryEvent[] {
    if (options.includeHighVolumeEvents === true) {
      // High-volume events are emitted live but intentionally not retained.
      return this.retainedEvents.map(event => structuredClone(event));
    }
    return this.retainedEvents
      .filter(event => !event.highVolume)
      .map(event => structuredClone(event));
  }

  public getByType<TType extends TelemetryEventType>(type: TType): TelemetryEventOf<TType>[] {
    return this.retainedEvents
      .filter(event => event.type === type)
      .map(event => structuredClone(event)) as TelemetryEventOf<TType>[];
  }


  public emitDomEvent<TType extends TelemetryEventType>(
    type: TType,
    payload: TelemetryPayloadMap[TType],
    options: {
      actor?: import('@skribbl-duels/telemetry-contracts').TelemetryActor | null;
      confidence?: TelemetryEvent['confidence'];
      occurredAt?: number;
      monotonicMs?: number;
    } = {}
  ): void {
    const source: TelemetrySource = {
      origin: 'dom-adapter',
      rawRecordId: null,
      changeId: null,
      direction: null,
      socketEvent: null,
      packetId: null
    };
    this.emitDraft(
      {
        type,
        category: TELEMETRY_EVENT_CATEGORIES[type],
        actor: options.actor ?? null,
        payload,
        confidence: options.confidence ?? 'confirmed'
      },
      source,
      options.occurredAt ?? Date.now(),
      options.monotonicMs ?? performance.now()
    );
  }

  public exportSnapshot(options: TelemetryExportOptions = {}): unknown {
    return {
      exportedAt: Date.now(),
      note: 'High-volume draw telemetry is live-only and is not retained in the telemetry history.',
      options: {
        includeHighVolumeEvents: options.includeHighVolumeEvents === true
      },
      stats: this.getStats(),
      lobbyState: this.lobbyStore.getSnapshot(),
      events: this.getRecent(options)
    };
  }

  public destroy(): void {
    for (const subscription of this.subscriptions) subscription.unsubscribe();
    this.eventSubject.complete();
    this.statsSubject.complete();
  }

  private handleChange(change: LobbyStateChange): void {
    const state = this.lobbyStore.getSnapshot();
    const drafts = mapLobbyChangeToTelemetry(change, state);
    const source = sourceFromChange(change);
    for (const draft of drafts) {
      this.emitDraft(draft, source, change.occurredAt, change.monotonicMs);
    }
  }

  private handleDecoded(record: DecodedSocketRecord): void {
    const state = this.lobbyStore.getSnapshot();
    const drafts = mapDecodedRecordToTelemetry(record, state);
    const source = sourceFromDecoded(record);
    for (const draft of drafts) {
      this.emitDraft(draft, source, record.occurredAt, record.monotonicMs);
    }
  }

  private emitDraft(
    draft: TelemetryDraft,
    source: TelemetrySource,
    occurredAt: number,
    monotonicMs: number
  ): void {
    this.telemetrySequence += 1;
    const event = {
      schemaVersion: 1,
      eventId: createId(),
      telemetrySequence: this.telemetrySequence,
      type: draft.type,
      category: draft.category,
      occurredAt,
      monotonicMs,
      actor: draft.actor ?? null,
      context: createTelemetryContext(this.lobbyStore.getSnapshot()),
      source,
      payload: draft.payload ?? {},
      confidence: draft.confidence ?? 'confirmed',
      highVolume: draft.highVolume === true
    } as TelemetryEvent;

    const previous = this.statsSubject.value;
    const retained = !event.highVolume;
    if (retained) {
      this.retainedEvents.unshift(event);
      if (this.retainedEvents.length > this.maxRetainedEvents) {
        this.retainedEvents.length = this.maxRetainedEvents;
      }
    }

    this.statsSubject.next({
      total: previous.total + 1,
      retained: previous.retained + (retained ? 1 : 0),
      omittedHighVolume: previous.omittedHighVolume + (retained ? 0 : 1),
      byType: {
        ...previous.byType,
        [event.type]: (previous.byType[event.type] ?? 0) + 1
      },
      lastEvent: event
    });

    this.eventSubject.next(event);
  }
}
