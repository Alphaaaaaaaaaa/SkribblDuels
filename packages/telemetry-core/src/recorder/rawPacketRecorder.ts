import { BehaviorSubject, merge, Subject, type Observable, type Subscription } from 'rxjs';
import { createId } from '../core/ids';
import { now } from '../core/time';
import type { RelayEnvelope } from '../bridge/relayTypes';
import type { IndexedDbRawPacketStore } from '../storage/indexedDbStore';
import {
  extractPacketId,
  redactSensitivePacketData,
  redactSensitiveRawValue,
  type RawSocketRecord,
  type RecordingSession
} from './rawRecord';

export interface RecorderStats {
  sessionId: string;
  total: number;
  incoming: number;
  outgoing: number;
  drawPackets: number;
  storageErrors: number;
  lastRecord: RawSocketRecord | null;
}

export class RawPacketRecorder {
  private sequence = 0;
  private readonly statsSubject: BehaviorSubject<RecorderStats>;
  private readonly session: RecordingSession;
  private readonly stats: RecorderStats;
  private pendingRecords: RawSocketRecord[] = [];
  private flushTimer: number | null = null;
  private readonly subscription: Subscription;

  private readonly recordsSubject = new Subject<RawSocketRecord>();

  public readonly stats$: Observable<RecorderStats>;
  public readonly records$: Observable<RawSocketRecord> = this.recordsSubject.asObservable();

  public constructor(
    private readonly store: IndexedDbRawPacketStore,
    incoming$: Observable<RelayEnvelope>,
    outgoing$: Observable<RelayEnvelope>,
    buildVersion: string
  ) {
    this.session = {
      sessionId: createId(),
      startedAt: Date.now(),
      endedAt: null,
      hrefAtStart: location.href,
      userAgent: navigator.userAgent,
      buildVersion
    };

    this.stats = {
      sessionId: this.session.sessionId,
      total: 0,
      incoming: 0,
      outgoing: 0,
      drawPackets: 0,
      storageErrors: 0,
      lastRecord: null
    };

    this.statsSubject = new BehaviorSubject<RecorderStats>({ ...this.stats });
    this.stats$ = this.statsSubject.asObservable();

    void this.store.saveSession(this.session);

    this.subscription = merge(incoming$, outgoing$).subscribe({
      next: envelope => void this.record(envelope),
      error: error => console.error('[SCD Raw Recorder] Relay stream failed', error)
    });

    window.addEventListener('pagehide', this.handlePageHide);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  public getSessionId(): string {
    return this.session.sessionId;
  }

  public getStats(): RecorderStats {
    return { ...this.stats };
  }

  public async flushPending(): Promise<void> {
    await this.flush();
  }

  public destroy(): void {
    this.subscription.unsubscribe();
    window.removeEventListener('pagehide', this.handlePageHide);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
    this.flushTimer = null;
    void this.flush();
    void this.closeSession();
    this.recordsSubject.complete();
    this.statsSubject.complete();
  }

  private readonly handlePageHide = (): void => {
    void this.flush();
    void this.closeSession();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') void this.flush();
  };

  private async record(envelope: RelayEnvelope): Promise<void> {
    this.sequence += 1;
    const timestamp = now();

    const socketEvent = envelope.direction === 'client-to-server'
      ? envelope.event
      : 'data';

    const unredactedPacketData = envelope.direction === 'client-to-server'
      ? envelope.data
      : envelope.data;
    const packetData = redactSensitivePacketData(socketEvent, unredactedPacketData);

    const packetId = extractPacketId(socketEvent, packetData);

    const record: RawSocketRecord = {
      recordId: createId(),
      sessionId: this.session.sessionId,
      sequence: this.sequence,

      direction: envelope.direction,
      relayName: envelope.relayName,
      portGeneration: envelope.portGeneration,

      socketEvent,
      packetId,
      packetData,
      raw: envelope.direction === 'client-to-server'
        ? redactSensitiveRawValue(socketEvent, envelope.raw)
        : envelope.data,

      occurredAt: timestamp.occurredAt,
      monotonicMs: timestamp.monotonicMs,

      page: {
        href: location.href,
        pathname: location.pathname,
        search: location.search,
        visibilityState: document.visibilityState
      }
    };

    this.stats.total += 1;
    if (record.direction === 'server-to-client') this.stats.incoming += 1;
    if (record.direction === 'client-to-server') this.stats.outgoing += 1;
    if (record.packetId === 19) this.stats.drawPackets += 1;
    this.stats.lastRecord = record;
    this.statsSubject.next({ ...this.stats });
    this.recordsSubject.next(record);

    this.pendingRecords.push(record);

    if (this.pendingRecords.length >= 50) {
      await this.flush();
    } else if (this.flushTimer === null) {
      this.flushTimer = window.setTimeout(() => {
        this.flushTimer = null;
        void this.flush();
      }, 100);
    }
  }

  private async flush(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.pendingRecords.length === 0) return;

    const batch = this.pendingRecords;
    this.pendingRecords = [];

    try {
      await this.store.addMany(batch);
    } catch (error) {
      this.stats.storageErrors += batch.length;
      this.statsSubject.next({ ...this.stats });
      console.error('[SCD Raw Recorder] Could not persist packet batch', batch, error);
    }
  }

  private async closeSession(): Promise<void> {
    this.session.endedAt = Date.now();
    await this.store.saveSession(this.session);
  }
}
