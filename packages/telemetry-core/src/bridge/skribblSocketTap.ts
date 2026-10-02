/** A passive page-world tap. It never reads commands from a MessagePort. */
export const SKRIBBL_DUELS_SOCKET_PORT = 'skribblDuelsSocketPort' as const;
const TAP_KEY = '__skribblDuelsSocketTapV1__';

interface GameSocket {
  emit: (...args: unknown[]) => unknown;
  onevent?: (packet: { data?: unknown[] }) => unknown;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  onAny?: (listener: (...args: unknown[]) => void) => unknown;
  prependAny?: (listener: (...args: unknown[]) => void) => unknown;
  connected?: boolean;
  io?: { uri?: string };
}
type IoFactory = ((...args: unknown[]) => unknown) & {
  Socket?: { prototype: GameSocket }; connect?: IoFactory; io?: IoFactory;
};
export interface NativeTapStatus {
  hookReady: boolean;
  connected: boolean;
  generation: number;
}
export type NativeTapFrame =
  | { version: 1; kind: 'status'; status: NativeTapStatus }
  | { version: 1; kind: 'left'; generation: number; reason: string }
  | { version: 1; kind: 'packet'; direction: 'server-to-client' | 'client-to-server';
      generation: number; event: 'data' | 'login'; data: unknown; occurredAt: number; monotonicMs: number };

function isGameEndpoint(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const host = new URL(value, window.location.origin).hostname.toLowerCase();
    return host === 'skribbl.io' || host.endsWith('.skribbl.io');
  } catch { return false; }
}

export class SkribblSocketTap {
  private readonly senders = new Set<MessagePort>();
  private readonly sockets = new WeakSet<object>();
  private readonly prototypes = new WeakSet<object>();
  private readonly wrappedFactories = new WeakMap<object, IoFactory>();
  private readonly outgoingDepth = new WeakMap<object, number>();
  private readonly incomingStack = new WeakSet<object>();
  private activeSocket: GameSocket | null = null;
  private status: NativeTapStatus = { hookReady: false, connected: false, generation: 0 };
  private currentIo: unknown;
  private pollTimer: number | null = null;

  public constructor() {
    const page = window as unknown as Record<string, unknown>;
    const descriptor = Object.getOwnPropertyDescriptor(page, 'io');
    this.currentIo = page.io;
    // Preserve pre-existing accessors. A poll is the compatibility fallback for
    // unusual loaders/non-configurable globals; no game source is replaced.
    if (!descriptor || (descriptor.configurable && 'value' in descriptor && descriptor.writable !== false)) {
      Object.defineProperty(page, 'io', {
        configurable: true, enumerable: descriptor?.enumerable ?? true,
        get: () => this.currentIo,
        set: value => { this.currentIo = this.wrapFactory(value); }
      });
      this.currentIo = this.wrapFactory(this.currentIo);
    } else this.wrapFactory(this.currentIo);
    this.pollTimer = window.setInterval(() => {
      const value = page.io;
      const wrapped = this.wrapFactory(value);
      if (wrapped !== value && descriptor?.writable) {
        try { page.io = wrapped; } catch { /* Prototype capture remains available. */ }
      }
      if (this.status.hookReady && this.pollTimer !== null) {
        window.clearInterval(this.pollTimer); this.pollTimer = null;
      }
    }, 500);
    window.addEventListener('pagehide', () => {
      if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
      for (const sender of this.senders) sender.close();
      this.senders.clear();
    });
  }

  public openPort(): { port: MessagePort; close(): void } {
    const channel = new MessageChannel();
    this.senders.add(channel.port1);
    channel.port1.postMessage({ version: 1, kind: 'status', status: this.status } satisfies NativeTapFrame);
    // Deliberately no onmessage/addEventListener on port1: the channel is read-only.
    return { port: channel.port2, close: () => {
      this.senders.delete(channel.port1); channel.port1.close(); channel.port2.close();
    } };
  }

  private publish(frame: NativeTapFrame): void {
    for (const port of this.senders) {
      try { port.postMessage(frame); } catch { /* Telemetry must never interrupt gameplay. */ }
    }
  }

  private updateStatus(update: Partial<NativeTapStatus>): void {
    this.status = { ...this.status, ...update };
    this.publish({ version: 1, kind: 'status', status: this.status });
  }

  private wrapFactory(value: unknown): unknown {
    if (typeof value !== 'function') return value;
    const factory = value as IoFactory;
    const known = this.wrappedFactories.get(factory);
    if (known) return known;
    this.wrapPrototype(factory.Socket?.prototype);
    const tap = this;
    const proxy = new Proxy(factory, {
      apply(target, receiver, args) {
        const socket = Reflect.apply(target, receiver, args) as GameSocket;
        try { if (isGameEndpoint(args[0])) tap.adoptSocket(socket); } catch { /* Observer isolation. */ }
        return socket;
      },
      get(target, property, receiver) {
        const result = Reflect.get(target, property, receiver);
        // Standalone Socket.IO exports these aliases pointing at the factory.
        const descriptor = Object.getOwnPropertyDescriptor(target, property);
        const fixed = descriptor?.configurable === false && 'value' in descriptor && descriptor.writable === false;
        return !fixed && (property === 'connect' || property === 'io') && result === target ? proxy : result;
      }
    });
    this.wrappedFactories.set(factory, proxy); this.wrappedFactories.set(proxy, proxy);
    this.updateStatus({ hookReady: true });
    return proxy;
  }

  private wrapPrototype(prototype: GameSocket | undefined): void {
    if (!prototype || this.prototypes.has(prototype)) return;
    this.prototypes.add(prototype);
    const tap = this;
    const originalEmit = prototype.emit;
    if (typeof originalEmit === 'function') {
      try {
        prototype.emit = function(this: GameSocket, ...args: unknown[]): unknown {
          try { tap.observeOutgoing(this, args); } catch { /* Observer isolation. */ }
          return Reflect.apply(originalEmit, this, args);
        };
      } catch { /* Per-socket wrapping is still possible. */ }
    }
    const originalOnevent = prototype.onevent;
    if (typeof originalOnevent === 'function') {
      try {
        prototype.onevent = function(this: GameSocket, packet): unknown {
          const data = packet?.data?.[1];
          let tracked = false;
          try {
            if (packet?.data?.[0] === 'data' && data !== null && typeof data === 'object' && !tap.incomingStack.has(data)) {
              tap.capture(this, 'server-to-client', 'data', data); tap.incomingStack.add(data); tracked = true;
            }
          } catch { /* Observer isolation. */ }
          try { return Reflect.apply(originalOnevent, this, [packet]); }
          finally { if (tracked) tap.incomingStack.delete(data as object); }
        };
      } catch { /* Public catch-all listeners are the fallback. */ }
    }
  }

  private adoptSocket(socket: GameSocket): boolean {
    if (!socket || typeof socket.emit !== 'function' || typeof socket.on !== 'function') return false;
    if (!this.sockets.has(socket)) {
      if (!isGameEndpoint(socket.io?.uri)) return false;
      this.sockets.add(socket);
      const tap = this;
      // Observe the outer logical emit even if Typo later replaces it to encode
      // custom colors. Each assigned function gets its own closure: previously
      // bound emits remain valid and nested wire emits are not counted twice.
      let current = this.wrapInstanceEmit(socket, socket.emit);
      try {
        Object.defineProperty(socket, 'emit', { configurable: true, enumerable: true,
          get: () => current,
          set: value => { current = typeof value === 'function'
            ? tap.wrapInstanceEmit(socket, value) : value; }
        });
      } catch { /* The prototype wrapper preserves the wire-level fallback. */ }
      if (!this.prototypes.has(Object.getPrototypeOf(socket)) || typeof socket.onevent !== 'function') {
        const receive = (...args: unknown[]): void => {
          if (args[0] === 'data') this.capture(socket, 'server-to-client', 'data', args[1]);
        };
        if (socket.prependAny) socket.prependAny(receive);
        else if (socket.onAny) socket.onAny(receive);
        else socket.on('data', data => this.capture(socket, 'server-to-client', 'data', data));
      }
      socket.on('connect', () => {
        if (this.activeSocket !== socket) return;
        this.updateStatus({ connected: true, generation: this.status.generation + 1 });
      });
      socket.on('disconnect', reason => {
        if (this.activeSocket !== socket) return;
        this.publish({ version: 1, kind: 'left', generation: this.status.generation,
          reason: typeof reason === 'string' ? reason.slice(0, 120) : 'socket-disconnect' });
        this.updateStatus({ connected: false });
      });
      this.activeSocket = socket;
      this.updateStatus({ connected: socket.connected === true, generation: this.status.generation + 1 });
    }
    return this.activeSocket === socket;
  }

  private wrapInstanceEmit(socket: GameSocket, original: GameSocket['emit']): GameSocket['emit'] {
    const tap = this;
    return function(this: GameSocket, ...args: unknown[]): unknown {
      const depth = tap.outgoingDepth.get(socket) ?? 0;
      if (depth === 0) { try { tap.observeOutgoing(socket, args); } catch { /* Observer isolation. */ } }
      tap.outgoingDepth.set(socket, depth + 1);
      try { return Reflect.apply(original, this, args); }
      finally { tap.outgoingDepth.set(socket, depth); }
    };
  }

  private observeOutgoing(socket: GameSocket, args: unknown[]): void {
    if ((this.outgoingDepth.get(socket) ?? 0) > 0) return;
    if (args[0] === 'data') this.capture(socket, 'client-to-server', 'data', args[1]);
    else if (args[0] === 'login' && args[1] !== null && typeof args[1] === 'object') {
      const login = args[1] as Record<string, unknown>;
      this.capture(socket, 'client-to-server', 'login', {
        join: login.join, create: login.create, name: login.name, lang: login.lang, avatar: login.avatar
      });
    }
  }

  private capture(socket: GameSocket, direction: 'server-to-client' | 'client-to-server', event: 'data' | 'login', data: unknown): void {
    if (direction === 'server-to-client' && data !== null && typeof data === 'object' && this.incomingStack.has(data)) return;
    if (!this.adoptSocket(socket)) return;
    if (event === 'data' && (!data || typeof data !== 'object' ||
        !Number.isSafeInteger((data as { id?: unknown }).id))) return;
    // Clone before the native game/another extension mutates its packet. Never
    // serialize callbacks, socket internals, OAuth credentials or login codes.
    this.publish({ version: 1, kind: 'packet', direction, event, data,
      generation: this.status.generation, occurredAt: Date.now(), monotonicMs: performance.now() });
  }
}

/** One installation per page; new Duels runtimes request fresh independent ports. */
export function getSkribblSocketTap(): SkribblSocketTap {
  const page = window as unknown as Record<string, unknown>;
  if (!page[TAP_KEY]) Object.defineProperty(page, TAP_KEY, { value: new SkribblSocketTap(), configurable: false });
  return page[TAP_KEY] as SkribblSocketTap;
}
