import { BehaviorSubject, Subject, type Observable, type Subscription } from 'rxjs';
import { TypoRelayBridge } from './typoRelayBridge';
import { getSkribblSocketTap, type NativeTapFrame } from './skribblSocketTap';
import type { IncomingRelayEnvelope, OutgoingRelayEnvelope, RelayEnvelope, RelayStatus } from './relayTypes';

export type TelemetryPortMode = 'auto' | 'own' | 'typo';
export interface TelemetryPortState {
  mode: TelemetryPortMode;
  activeSource: 'own' | 'typo' | null;
  nativeReady: boolean;
  nativeConnected: boolean;
  typoReady: boolean;
  reloadRequired: boolean;
}

/** One source per lobby: observing both never doubles normalized telemetry. */
export class SkribblTelemetryBridge {
  private readonly incomingSubject = new Subject<IncomingRelayEnvelope>();
  private readonly outgoingSubject = new Subject<OutgoingRelayEnvelope>();
  private readonly leftSubject = new Subject<{ reason: string }>();
  private readonly stateSubject: BehaviorSubject<TelemetryPortState>;
  private readonly incomingStatusSubject = new BehaviorSubject<RelayStatus>({ relayName: 'skribblDuelsMessagePort', connected: false, portGeneration: 0, connectedAt: null, messageCount: 0 });
  private readonly outgoingStatusSubject = new BehaviorSubject<RelayStatus>({ relayName: 'skribblDuelsEmitPort', connected: false, portGeneration: 0, connectedAt: null, messageCount: 0 });
  private readonly subscriptions: Subscription[] = [];
  private readonly typo = new TypoRelayBridge();
  private nativePort: { port: MessagePort; close(): void } | null = null;
  private started = false;
  private lobbySource: 'own' | 'typo' | null = null;
  private effectiveMode: TelemetryPortMode;
  private nativeGeneration = 0;
  private typoIncomingReady = false;
  private typoOutgoingReady = false;

  public readonly incoming$: Observable<IncomingRelayEnvelope> = this.incomingSubject.asObservable();
  public readonly outgoing$: Observable<OutgoingRelayEnvelope> = this.outgoingSubject.asObservable();
  public readonly lobbyLeft$ = this.leftSubject.asObservable();
  public readonly state$: Observable<TelemetryPortState>;
  public readonly incomingStatus$ = this.incomingStatusSubject.asObservable();
  public readonly outgoingStatus$ = this.outgoingStatusSubject.asObservable();

  public constructor(mode: TelemetryPortMode = 'auto') {
    this.effectiveMode = mode;
    this.stateSubject = new BehaviorSubject<TelemetryPortState>({ mode, activeSource: null,
      nativeReady: false, nativeConnected: false, typoReady: false, reloadRequired: false });
    this.state$ = this.stateSubject.asObservable();
  }

  public getState(): TelemetryPortState { return { ...this.stateSubject.value }; }

  public setMode(mode: TelemetryPortMode): void {
    if (mode === this.stateSubject.value.mode) return;
    this.updateState({ mode });
    if (this.lobbySource !== null) this.updateState({ reloadRequired: mode !== this.effectiveMode });
    else { this.effectiveMode = mode; this.updateState({ reloadRequired: false }); this.refreshStatus(); }
  }

  public start(): void {
    if (this.started) return;
    this.started = true;
    this.subscriptions.push(
      this.typo.incoming$.subscribe(packet => this.forward('typo', packet)),
      this.typo.outgoing$.subscribe(packet => this.forward('typo', packet)),
      this.typo.incomingStatus$.subscribe(status => { this.typoIncomingReady = status.connected; this.refreshStatus(); }),
      this.typo.outgoingStatus$.subscribe(status => { this.typoOutgoingReady = status.connected; this.refreshStatus(); })
    );
    // Listen for Typo's one-shot ports before installing any page hook.
    this.typo.start();
    try {
      this.openNativePort();
    } catch { this.updateState({ nativeReady: false }); }
    document.addEventListener('leftLobby', this.handleTypoLeft);
    window.addEventListener('pageshow', this.handlePageShow);
  }

  public stop(): void {
    if (!this.started) return;
    this.started = false; this.typo.stop();
    for (const subscription of this.subscriptions.splice(0)) subscription.unsubscribe();
    document.removeEventListener('leftLobby', this.handleTypoLeft);
    window.removeEventListener('pageshow', this.handlePageShow);
    this.nativePort?.port.removeEventListener('message', this.handleNativeMessage);
    this.nativePort?.close(); this.nativePort = null;
    this.lobbySource = null;
    this.updateState({ activeSource: null, nativeConnected: false, nativeReady: false, typoReady: false });
    this.refreshStatus();
  }

  private desiredSource(): 'own' | 'typo' | null {
    if (this.lobbySource) return this.lobbySource;
    if (this.effectiveMode === 'typo') return 'typo';
    if (this.stateSubject.value.nativeReady) return 'own';
    return this.effectiveMode === 'auto' ? 'typo' : null;
  }

  private forward(source: 'own' | 'typo', packet: RelayEnvelope): void {
    if (!this.started || this.desiredSource() !== source) return;
    const data = packet.data as { id?: unknown } | null;
    const startsLobby = packet.direction === 'client-to-server' && packet.event === 'login'
      || packet.direction === 'server-to-client' && data?.id === 10;
    if (startsLobby && this.lobbySource === null) {
      this.lobbySource = source; this.updateState({ activeSource: source });
    }
    const status = packet.direction === 'server-to-client' ? this.incomingStatusSubject : this.outgoingStatusSubject;
    status.next({ ...status.value, relayName: packet.relayName, connected: true,
      connectedAt: status.value.connectedAt ?? Date.now(), portGeneration: packet.portGeneration,
      messageCount: status.value.messageCount + 1 });
    if (packet.direction === 'server-to-client') this.incomingSubject.next(packet);
    else this.outgoingSubject.next(packet);
  }

  private readonly handleNativeMessage = (event: MessageEvent<NativeTapFrame>): void => {
    if (!this.started || !event.data || event.data.version !== 1) return;
    const frame = event.data;
    if (frame.kind === 'status') {
      if (this.lobbySource === 'own' && this.nativeGeneration !== 0
          && (frame.status.generation !== this.nativeGeneration
            || this.stateSubject.value.nativeConnected && !frame.status.connected)) {
        this.leftSubject.next({ reason: 'connection-generation-changed' }); this.endLobby();
      }
      this.nativeGeneration = frame.status.generation;
      this.updateState({ nativeReady: frame.status.hookReady, nativeConnected: frame.status.connected });
      this.refreshStatus(); return;
    }
    if (frame.generation !== this.nativeGeneration) return;
    if (frame.kind === 'left') {
      if (this.desiredSource() === 'own') {
        this.leftSubject.next({ reason: frame.reason }); this.endLobby();
      }
      return;
    }
    if (frame.kind !== 'packet') return;
    const time = { occurredAt: frame.occurredAt, monotonicMs: frame.monotonicMs };
    if (frame.direction === 'server-to-client') this.forward('own', {
      direction: frame.direction, relayName: 'skribblDuelsMessagePort', data: frame.data,
      portGeneration: frame.generation, ...time
    });
    else this.forward('own', { direction: frame.direction, relayName: 'skribblDuelsEmitPort',
      event: frame.event, data: frame.data, raw: [frame.event, frame.data], portGeneration: frame.generation, ...time });
  };

  private readonly handleTypoLeft = (): void => {
    if (this.desiredSource() === 'typo') this.endLobby();
  };

  private openNativePort(): void {
    this.nativePort?.port.removeEventListener('message', this.handleNativeMessage);
    this.nativePort?.close();
    this.nativePort = getSkribblSocketTap().openPort();
    this.nativePort.port.addEventListener('message', this.handleNativeMessage);
    this.nativePort.port.start();
  }

  private readonly handlePageShow = (event: PageTransitionEvent): void => {
    if (!this.started || !event.persisted) return;
    try { this.openNativePort(); } catch { this.updateState({ nativeReady: false }); this.refreshStatus(); }
  };

  private endLobby(): void {
    this.lobbySource = null; this.effectiveMode = this.stateSubject.value.mode;
    this.updateState({ activeSource: null, reloadRequired: false }); this.refreshStatus();
  }

  private refreshStatus(): void {
    this.updateState({ typoReady: this.typoIncomingReady && this.typoOutgoingReady });
    const source = this.desiredSource();
    for (const [subject, incoming] of [[this.incomingStatusSubject, true], [this.outgoingStatusSubject, false]] as const) {
      const connected = this.started && (source === 'own' ? this.stateSubject.value.nativeConnected
        : source === 'typo' ? incoming ? this.typoIncomingReady : this.typoOutgoingReady : false);
      subject.next({ ...subject.value, relayName: source === 'typo'
        ? incoming ? 'skribblMessagePort' : 'skribblEmitPort'
        : incoming ? 'skribblDuelsMessagePort' : 'skribblDuelsEmitPort', connected });
    }
  }

  private updateState(update: Partial<TelemetryPortState>): void {
    const next = { ...this.stateSubject.value, ...update };
    if (JSON.stringify(next) !== JSON.stringify(this.stateSubject.value)) this.stateSubject.next(next);
  }
}
