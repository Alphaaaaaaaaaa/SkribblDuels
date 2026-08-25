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

export const TYPO_RELAY_REQUEST_EVENT_NAME = 'skribbl-duels:request-typo-relays';

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
  private retryTimer: number | null = null;
  private retryAttempt = 0;

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
    this.requestMissingRelayPorts();
  }

  public stop(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener('message', this.handleWindowMessage);
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryAttempt = 0;
  }

  private requestMissingRelayPorts(): void {
    if (!this.started) return;
    const missing = [
      ...(!this.incomingStatusSubject.value.connected ? ['skribblMessagePort' as const] : []),
      ...(!this.outgoingStatusSubject.value.connected ? ['skribblEmitPort' as const] : [])
    ];
    if (missing.length === 0) {
      if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.retryAttempt = 0;
      return;
    }
    const detail = { missing, attempt: this.retryAttempt + 1 };
    // Late Typo builds can respond to either the DOM event or postMessage
    // handshake by transferring fresh ports. Older builds still work because
    // the original one-shot port messages remain listened for continuously.
    window.dispatchEvent(new CustomEvent(TYPO_RELAY_REQUEST_EVENT_NAME, { detail }));
    window.postMessage({ type: TYPO_RELAY_REQUEST_EVENT_NAME, detail }, '*');
    const delay = Math.min(10_000, 250 * (2 ** Math.min(this.retryAttempt, 6)));
    this.retryAttempt += 1;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      this.requestMissingRelayPorts();
    }, delay);
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
      if (!this.started) return;
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
    this.requestMissingRelayPorts();
  }

  private attachOutgoingPort(port: MessagePort): void {
    if (this.outgoingState.ports.has(port)) return;
    this.outgoingState.ports.add(port);
    this.outgoingState.generation += 1;

    const generation = this.outgoingState.generation;

    port.addEventListener('message', (message: MessageEvent<unknown>) => {
      if (!this.started) return;
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
    this.requestMissingRelayPorts();
  }
}
