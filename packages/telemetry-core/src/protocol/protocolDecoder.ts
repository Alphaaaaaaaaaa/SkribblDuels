import { BehaviorSubject, Subject, type Observable, type Subscription } from 'rxjs';
import type { RawSocketRecord } from '../recorder/rawRecord';
import { decodeIncoming } from './decodeIncoming';
import { decodeOutgoing } from './decodeOutgoing';
import type {
  DecodedPacket,
  DecodedSocketRecord,
  ProtocolStats
} from './types';

export function decodeRawRecord(record: RawSocketRecord): DecodedPacket {
  try {
    return record.direction === 'server-to-client'
      ? decodeIncoming(record)
      : decodeOutgoing(record);
  } catch (error) {
    return {
      known: false,
      kind: 'DECODER_ERROR',
      direction: record.direction,
      socketEvent: record.socketEvent,
      packetId: record.packetId,
      payload: {
        message: error instanceof Error ? error.message : String(error)
      },
      issues: ['The decoder threw unexpectedly.'],
      rawData: record.packetData
    };
  }
}

export class ProtocolDecoder {
  private readonly decodedSubject = new Subject<DecodedSocketRecord>();
  private readonly statsSubject: BehaviorSubject<ProtocolStats>;
  private readonly subscription: Subscription;
  private readonly recent: DecodedSocketRecord[] = [];

  public readonly decoded$: Observable<DecodedSocketRecord> = this.decodedSubject.asObservable();
  public readonly stats$: Observable<ProtocolStats>;

  public constructor(records$: Observable<RawSocketRecord>, private readonly maxRecent = 200) {
    const initial: ProtocolStats = {
      total: 0,
      known: 0,
      unknown: 0,
      withIssues: 0,
      byKind: {},
      lastRecord: null
    };

    this.statsSubject = new BehaviorSubject<ProtocolStats>(initial);
    this.stats$ = this.statsSubject.asObservable();

    this.subscription = records$.subscribe(record => {
      const decodedRecord = this.decodeRecord(record);
      this.recent.unshift(decodedRecord);
      if (this.recent.length > this.maxRecent) this.recent.length = this.maxRecent;

      const previous = this.statsSubject.value;
      const byKind = {
        ...previous.byKind,
        [decodedRecord.decoded.kind]: (previous.byKind[decodedRecord.decoded.kind] ?? 0) + 1
      };

      this.statsSubject.next({
        total: previous.total + 1,
        known: previous.known + (decodedRecord.decoded.known ? 1 : 0),
        unknown: previous.unknown + (decodedRecord.decoded.known ? 0 : 1),
        withIssues: previous.withIssues + (decodedRecord.decoded.issues.length > 0 ? 1 : 0),
        byKind,
        lastRecord: decodedRecord
      });

      this.decodedSubject.next(decodedRecord);
    });
  }

  public decodeRecord(record: RawSocketRecord): DecodedSocketRecord {
    return {
      rawRecordId: record.recordId,
      sessionId: record.sessionId,
      sequence: record.sequence,
      occurredAt: record.occurredAt,
      monotonicMs: record.monotonicMs,
      decoded: decodeRawRecord(record)
    };
  }

  public decodeMany(records: readonly RawSocketRecord[]): DecodedSocketRecord[] {
    return records.map(record => this.decodeRecord(record));
  }

  public getStats(): ProtocolStats {
    const stats = this.statsSubject.value;
    return {
      ...stats,
      byKind: { ...stats.byKind }
    };
  }

  public getRecent(): DecodedSocketRecord[] {
    return this.recent.slice();
  }

  public destroy(): void {
    this.subscription.unsubscribe();
    this.decodedSubject.complete();
    this.statsSubject.complete();
  }
}
