import * as assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';
import { JSDOM } from 'jsdom';
import { SkribblTelemetryBridge, RawPacketRecorder, ProtocolDecoder, LobbyStateStore, TelemetryStore,
  type RelayEnvelope, type IndexedDbRawPacketStore } from '@skribbl-duels/telemetry-core';
import { getSkribblSocketTap } from '../packages/telemetry-core/src/bridge/skribblSocketTap';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://skribbl.io/', pretendToBeVisual: true });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
  location: dom.window.location, navigator: dom.window.navigator, CustomEvent: dom.window.CustomEvent,
  MessageChannel })) Object.defineProperty(globalThis, key, { value, configurable: true });
const settle = () => new Promise(resolve => setTimeout(resolve, 25));

class FakeSocket {
  public connected = false;
  public readonly wire: unknown[][] = [];
  public readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  public readonly io: { uri: string };
  public constructor(uri: string) { this.io = { uri }; }
  public on(event: string, listener: (...args: unknown[]) => void): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]); return this;
  }
  public emit(...args: unknown[]): this { this.wire.push(structuredClone(args)); return this; }
  public onevent(packet: { data: unknown[] }): string {
    for (const listener of this.listeners.get(String(packet.data[0])) ?? []) listener(...packet.data.slice(1));
    return 'native-onevent-return';
  }
  public connect(): void { this.connected = true; this.onevent({ data: ['connect'] }); }
  public disconnect(): void { this.connected = false; this.onevent({ data: ['disconnect', 'client disconnect'] }); }
}
const factory = Object.assign((uri: string) => new FakeSocket(uri), { Socket: FakeSocket, connect: null as unknown, io: null as unknown });
factory.connect = factory; factory.io = factory;
const bridge = new SkribblTelemetryBridge('auto');
const incoming: RelayEnvelope[] = []; const outgoing: RelayEnvelope[] = [];
bridge.incoming$.subscribe(value => incoming.push(value)); bridge.outgoing$.subscribe(value => outgoing.push(value));
let left = 0; bridge.lobbyLeft$.subscribe(() => left++);
const persistence = { saveSession: async () => {}, addMany: async () => {} } as unknown as IndexedDbRawPacketStore;
bridge.start();
const recorder = new RawPacketRecorder(persistence, bridge.incoming$, bridge.outgoing$, '0.72.0');
const decoder = new ProtocolDecoder(recorder.records$); const lobby = new LobbyStateStore(decoder.decoded$);
const telemetry = new TelemetryStore(decoder.decoded$, lobby.changes$, lobby);
bridge.lobbyLeft$.subscribe(({ reason }) => {
  telemetry.emitDomEvent('LOBBY_LEFT', { method: 'duels-socket', reason });
  lobby.clearLobby();
});
const typoIn = new MessageChannel(); const typoOut = new MessageChannel();
let otherTypoConsumerMessages = 0;
(typoIn.port2 as unknown as MessagePort).onmessage = () => { otherTypoConsumerMessages++; };
const transferTypo = (name: string, port: import('node:worker_threads').MessagePort) => {
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: name, ports: [port as unknown as MessagePort] }));
};
transferTypo('skribblMessagePort', typoIn.port2); transferTypo('skribblEmitPort', typoOut.port2);

try {
  (dom.window as unknown as { io: typeof factory }).io = factory;
  await settle(); assert.equal(bridge.getState().nativeReady, true); assert.equal(bridge.getState().typoReady, true);
  const observedFactory = (dom.window as unknown as { io: typeof factory }).io;
  assert.equal(observedFactory.connect, observedFactory); assert.equal(observedFactory.io, observedFactory);
  const socket = observedFactory('https://server1.skribbl.io'); socket.connect();
  assert.equal(socket.emit('heartbeat'), socket, 'No-payload emits preserve return values and do not crash.');
  const login = { join: 'ROOM', create: 0, name: 'Alpha', lang: 1, avatar: [0, 1, 2, -1], code: 'DO-NOT-RECORD' };
  assert.equal(socket.emit('login', login), socket); typoOut.port1.postMessage(['login', login]);
  const snapshot = { id: 10, data: { settings: [1, 8, 80, 3, 3, 2, 0, 0], id: 'ROOM', type: 0,
    me: 1, owner: 1, round: 0, users: [{ id: 1, name: 'Alpha', avatar: [0, 1, 2, -1], score: 0, guessed: false, flags: 0 },
      { id: 2, name: 'Friend', avatar: [1, 2, 3, -1], score: 0, guessed: false, flags: 0 }], state: { id: 7, type: 0, time: 0, data: {} } } };
  socket.on('data', value => typoIn.port1.postMessage(value));
  assert.equal(socket.onevent({ data: ['data', snapshot] }), 'native-onevent-return');
  await settle();
  assert.equal(bridge.getState().activeSource, 'own'); assert.equal(incoming.length, 1); assert.equal(outgoing.length, 1);
  assert.equal(otherTypoConsumerMessages, 1, 'The original Typo port consumer still receives its data.');
  assert.equal(lobby.getSnapshot().lobbyId, 'ROOM'); assert.equal(telemetry.getByType('LOBBY_HYDRATED').length, 1);
  assert.ok(!JSON.stringify(outgoing).includes('DO-NOT-RECORD')); assert.equal(login.code, 'DO-NOT-RECORD');

  // Typo captures the logical emit, then expands it into multiple physical
  // packets. Duels must capture that original call once and preserve all wire calls.
  const original = socket.emit.bind(socket);
  socket.emit = function(...args: unknown[]): FakeSocket {
    typoOut.port1.postMessage(args);
    const payload = args[1] as { id?: number } | undefined;
    if (args[0] === 'data' && payload?.id === 19) {
      original('data', { id: 19, data: [[0, 0, 5, 0, 0, 0, 0]] });
      original('data', { id: 21, data: 0 });
      return original(...args);
    }
    return original(...args);
  };
  const drawing = { id: 19, data: [[0, 12000, 12, 10, 10, 20, 20]] };
  const beforeWire = socket.wire.length;
  assert.equal(socket.emit('data', drawing), socket);
  await settle(); assert.equal(socket.wire.length - beforeWire, 3);
  assert.equal(outgoing.length, 2, 'Nested Typo wire emits and its second port cannot duplicate the logical submission.');
  assert.deepEqual(outgoing.at(-1)?.data, drawing);
  const incomingDrawing = { id: 19, data: [[0, 1, 12, 10, 10, 20, 20]] };
  socket.on('data', value => { const packet = value as typeof incomingDrawing; if (packet.id === 19) packet.data[0]![1] = 999; });
  socket.onevent({ data: ['data', incomingDrawing] }); await settle();
  assert.equal((incoming.at(-1)?.data as typeof incomingDrawing).data[0]![1], 1, 'Capture is cloned before other consumers mutate incoming draw arrays.');
  assert.equal(incomingDrawing.data[0]![1], 999, 'The native callback still receives its original mutable packet.');

  const extraPort = getSkribblSocketTap().openPort();
  const wireCount = socket.wire.length;
  extraPort.port.postMessage({ event: 'data', data: { id: 3, data: 2 } });
  await settle(); assert.equal(socket.wire.length, wireCount, 'The independent port has no command/write path.'); extraPort.close();
  const unrelated = observedFactory('https://gateway.example.com'); unrelated.connect(); unrelated.emit('data', { id: 30, data: 'ignored' });
  unrelated.onevent({ data: ['data', snapshot] }); await settle(); assert.equal(incoming.length, 2); assert.equal(outgoing.length, 2);
  socket.emit('data', { id: 30, data: 'hello' }); await settle(); assert.equal(outgoing.length, 3);
  assert.equal(recorder.getStats().lastRecord?.relayName, 'skribblDuelsEmitPort');
  assert.equal(recorder.getStats().lastRecord?.occurredAt, outgoing.at(-1)?.occurredAt);

  bridge.setMode('typo'); assert.equal(bridge.getState().reloadRequired, true);
  socket.emit('data', { id: 30, data: 'still own until lobby exit' }); await settle();
  assert.equal(outgoing.at(-1)?.relayName, 'skribblDuelsEmitPort');
  socket.disconnect(); await settle(); assert.equal(left, 1); assert.equal(bridge.getState().reloadRequired, false);
  assert.equal(telemetry.getByType('LOBBY_LEFT').length, 1);
  assert.equal(telemetry.getByType('LOBBY_LEFT')[0]?.context.lobbyId, 'ROOM', 'Departure retains the old scope before clearing the state.');
  assert.equal(lobby.getSnapshot().lobbyId, null); assert.equal(lobby.getSnapshot().userOrder.length, 0);
  typoOut.port1.postMessage(['login', login]); typoIn.port1.postMessage(snapshot); await settle();
  assert.equal(bridge.getState().activeSource, 'typo'); assert.equal(outgoing.at(-1)?.relayName, 'skribblEmitPort');
  const baseline = incoming.length;
  const next = observedFactory('https://server2.skribbl.io'); next.connect(); next.onevent({ data: ['data', snapshot] }); await settle();
  assert.equal(incoming.length, baseline, 'Legacy selection never mixes in the independent stream.');
  bridge.setMode('own'); assert.equal(bridge.getState().reloadRequired, true);
  dom.window.document.dispatchEvent(new dom.window.Event('leftLobby')); await settle();
  next.onevent({ data: ['data', snapshot] }); await settle(); assert.equal(incoming.length, baseline + 1);
  socket.onevent({ data: ['data', snapshot] }); await settle(); assert.equal(incoming.length, baseline + 1, 'Old sockets cannot re-enter the new lobby stream.');
  bridge.stop(); const stopped = incoming.length; next.onevent({ data: ['data', snapshot] }); await settle(); assert.equal(incoming.length, stopped);
  bridge.start(); await settle(); next.onevent({ data: ['data', snapshot] }); await settle();
  assert.equal(incoming.length, stopped + 1, 'A restarted runtime gets a fresh port without stacking page hooks.');
  const beforeRestore = incoming.length;
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true }));
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true })); await settle();
  next.onevent({ data: ['data', { id: 30, data: { id: 2, msg: 'after cached-page restore' } }] }); await settle();
  assert.equal(incoming.length, beforeRestore + 1, 'Returning from the browser page cache establishes a fresh port.');
  const previousLeft = left;
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: true })); next.disconnect();
  dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pageshow', { persisted: true })); await settle();
  assert.equal(left, previousLeft + 1, 'A lobby departure while the page port was closed is reconciled on restore.');
  await testLateOwnHook(snapshot, login);
  console.log('v0.72.0: independent socket/port, Typo coexistence, at-most-once normalization, private-code redaction, immutable captures, native returns, source changes, old-socket isolation and runtime restart passed.');
} finally {
  bridge.stop(); telemetry.destroy(); lobby.destroy(); decoder.destroy(); recorder.destroy();
  typoIn.port1.close(); typoIn.port2.close(); typoOut.port1.close(); typoOut.port2.close(); dom.window.close();
}

async function testLateOwnHook(snapshot: unknown, login: unknown): Promise<void> {
  const fallbackDom = new JSDOM('<!doctype html><body></body>', { url: 'https://skribbl.io/', pretendToBeVisual: true });
  Object.defineProperty(globalThis, 'window', { value: fallbackDom.window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: fallbackDom.window.document, configurable: true });
  class LateSocket {
    public connected = false;
    public readonly io = { uri: 'https://server3.skribbl.io' };
    private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    public on(event: string, listener: (...args: unknown[]) => void): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]); return this;
    }
    public emit(..._args: unknown[]): this { return this; }
    public onevent(packet: { data: unknown[] }): void {
      for (const listener of this.listeners.get(String(packet.data[0])) ?? []) listener(...packet.data.slice(1));
    }
  }
  const lateFactory = Object.assign(() => new LateSocket(), { Socket: LateSocket });
  const fallback = new SkribblTelemetryBridge('auto');
  const received: RelayEnvelope[] = []; fallback.incoming$.subscribe(value => received.push(value));
  const portIn = new MessageChannel(); const portOut = new MessageChannel();
  try {
    fallback.start();
    for (const [name, port] of [['skribblMessagePort', portIn.port2], ['skribblEmitPort', portOut.port2]] as const) {
      fallbackDom.window.dispatchEvent(new fallbackDom.window.MessageEvent('message', { data: name, ports: [port as unknown as MessagePort] }));
    }
    await settle(); assert.equal(fallback.getState().nativeReady, false);
    portOut.port1.postMessage(['login', login]); portIn.port1.postMessage(snapshot); await settle();
    assert.equal(fallback.getState().activeSource, 'typo'); assert.equal(received.length, 1);
    (fallbackDom.window as unknown as { io: typeof lateFactory }).io = lateFactory;
    await settle(); assert.equal(fallback.getState().nativeReady, true);
    const late = (fallbackDom.window as unknown as { io: typeof lateFactory }).io();
    late.onevent({ data: ['data', snapshot] }); await settle();
    assert.equal(received.length, 1, 'A late own hook cannot mix its partial stream into an active Typo lobby.');
    fallbackDom.window.document.dispatchEvent(new fallbackDom.window.Event('leftLobby'));
    late.onevent({ data: ['data', snapshot] }); await settle();
    assert.equal(fallback.getState().activeSource, 'own'); assert.equal(received.length, 2, 'Auto selects the ready own port for the next lobby.');
  } finally {
    fallback.stop(); portIn.port1.close(); portIn.port2.close(); portOut.port1.close(); portOut.port2.close(); fallbackDom.window.close();
    Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
  }
}
