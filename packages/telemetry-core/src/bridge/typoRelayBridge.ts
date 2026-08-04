import { BehaviorSubject, Subject, type Observable } from 'rxjs';
import type {
  IncomingRelayEnvelope,
  OutgoingRelayEnvelope,
  RelayStatus
} from './relayTypes';

interface RelayPortState {
  generation: number;
  messageCount: number;
  ports: WeakSet<MessagePort>;
}

function isWindowMessage(event: MessageEvent<unknown>): boolean {
  return event.source === null || event.source === window;
}

export class TypoRelayBridge {
  private readonly incomingSubject = new Subject<IncomingRelayEnvelope>();
  private readonly outgoingSubject = new Subject<OutgoingRelayEnvelope>();

  private readonly incomingStatusSubject = new BehaviorSubject<RelayStatus>({
    relayName: 'skribblMessagePort',
    connected: false,
    portGeneration: 0,
    connectedAt: null,
    messageCount: 0
  });

  private readonly outgoingStatusSubject = new BehaviorSubject<RelayStatus>({
    relayName: 'skribblEmitPort',
    connected: false,
    portGeneration: 0,
    connectedAt: null,
    messageCount: 0
  });

  private readonly incomingState: RelayPortState = {
    generation: 0,
    messageCount: 0,
    ports: new WeakSet<MessagePort>()
  };

  private readonly outgoingState: RelayPortState = {
    generation: 0,
    messageCount: 0,
    ports: new WeakSet<MessagePort>()
  };

  private started = false;

  public readonly incoming$: Observable<IncomingRelayEnvelope> =
    this.incomingSubject.asObservable();

  public readonly outgoing$: Observable<OutgoingRelayEnvelope> =
    this.outgoingSubject.asObservable();

  public readonly incomingStatus$: Observable<RelayStatus> =
    this.incomingStatusSubject.asObservable();

  public readonly outgoingStatus$: Observable<RelayStatus> =
    this.outgoingStatusSubject.asObservable();

  public start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener('message', this.handleWindowMessage);
  }

  public stop(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener('message', this.handleWindowMessage);
  }

  private readonly handleWindowMessage = (event: MessageEvent<unknown>): void => {
    if (!isWindowMessage(event)) return;

    if (event.data === 'skribblMessagePort') {
      const port = event.ports[0];
      if (port) this.attachIncomingPort(port);
      return;
    }

    if (event.data === 'skribblEmitPort') {
      const port = event.ports[0];
      if (port) this.attachOutgoingPort(port);
    }
  };

  private attachIncomingPort(port: MessagePort): void {
    if (this.incomingState.ports.has(port)) return;
    this.incomingState.ports.add(port);
    this.incomingState.generation += 1;

    const generation = this.incomingState.generation;

    port.addEventListener('message', (event: MessageEvent<unknown>) => {
      this.incomingState.messageCount += 1;
      this.incomingStatusSubject.next({
        relayName: 'skribblMessagePort',
        connected: true,
        portGeneration: generation,
        connectedAt: this.incomingStatusSubject.value.connectedAt ?? Date.now(),
        messageCount: this.incomingState.messageCount
      });

      this.incomingSubject.next({
        direction: 'server-to-client',
        relayName: 'skribblMessagePort',
        data: event.data,
        portGeneration: generation
      });
    });

    port.start();

    this.incomingStatusSubject.next({
      relayName: 'skribblMessagePort',
      connected: true,
      portGeneration: generation,
      connectedAt: Date.now(),
      messageCount: this.incomingState.messageCount
    });
  }

  private attachOutgoingPort(port: MessagePort): void {
    if (this.outgoingState.ports.has(port)) return;
    this.outgoingState.ports.add(port);
    this.outgoingState.generation += 1;

    const generation = this.outgoingState.generation;

    port.addEventListener('message', (message: MessageEvent<unknown>) => {
      this.outgoingState.messageCount += 1;
      this.outgoingStatusSubject.next({
        relayName: 'skribblEmitPort',
        connected: true,
        portGeneration: generation,
        connectedAt: this.outgoingStatusSubject.value.connectedAt ?? Date.now(),
        messageCount: this.outgoingState.messageCount
      });

      const raw = message.data;
      const tuple = Array.isArray(raw) ? raw : null;
      const eventName = typeof tuple?.[0] === 'string' ? tuple[0] : null;
      const data = tuple && tuple.length > 1 ? tuple[1] : null;

      this.outgoingSubject.next({
        direction: 'client-to-server',
        relayName: 'skribblEmitPort',
        event: eventName,
        data,
        raw,
        portGeneration: generation
      });
    });

    port.start();

    this.outgoingStatusSubject.next({
      relayName: 'skribblEmitPort',
      connected: true,
      portGeneration: generation,
      connectedAt: Date.now(),
      messageCount: this.outgoingState.messageCount
    });
  }
}
