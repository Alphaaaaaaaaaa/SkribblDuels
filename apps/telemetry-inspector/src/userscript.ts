import { BehaviorSubject } from 'rxjs';
import {
  TELEMETRY_CONTRACT_VERSION,
  TELEMETRY_SCHEMA_VERSION,
  createTelemetryProviderDescriptor,
  type TelemetryEvent,
  type TelemetryEventOf,
  type TelemetryEventType,
  type TelemetryExportOptions,
  type TelemetryProvider
} from '@skribbl-duels/telemetry-contracts';
import {
  AvatarTelemetryAdapter,
  CanvasSnapshotTelemetryAdapter,
  CanvasWhiteTelemetryAdapter,
  HomeInteractionTelemetryAdapter,
  CORE_SUPPORTED_TELEMETRY_EVENTS,
  IndexedDbRawPacketStore,
  LobbyStateStore,
  ProtocolDecoder,
  RawPacketRecorder,
  StrokeTelemetryAdapter,
  TypoDropTelemetryAdapter,
  TypoAutodrawTelemetryAdapter,
  TypoChallengeTelemetryAdapter,
  TelemetryStore,
  TypoRelayBridge,
  decodeRawRecord,
  filterDecodedRecords,
  filterRawRecords,
  selectDrawer,
  selectEstimatedServerTime,
  selectPlayers,
  selectSelf,
  type CanonicalLobbyState,
  type DecodedSocketRecord,
  type LobbyStateChange,
  type PacketExportOptions,
  type RawSocketRecord,
  type RelayEnvelope
} from '@skribbl-duels/telemetry-core';
import {
  TelemetryReplayProvider,
  createFixtureFromProvider,
  parseTelemetryFixture,
  validateTelemetryFixture,
  type CreateTelemetryFixtureOptions,
  type ReplayOptions,
  type ReplayResult,
  type ReplayState,
  type TelemetryFixture
} from '@skribbl-duels/telemetry-replay';
import {
  ChallengeEngine,
  LocalStorageChallengePersistence,
  CHALLENGE_ENGINE_VERSION,
  type ChallengeActivation,
  type ChallengeDefinition,
  type ChallengeEngineEvent,
  type ChallengeEngineSnapshot,
  type ChallengeDefinitionSummary,
  type ChallengeEngineStats,
  type ChallengeRuntimeSnapshot,
  type CompletionResolution
} from '@skribbl-duels/challenge-engine';
import {
  CHALLENGE_DEFINITIONS_VERSION,
  activateStarterSandbox,
  deactivateStarterSandbox,
  registerStarterChallengeDefinitions,
  starterChallengeDefinitions,
  starterSandboxInstanceIds,
  loadOfficialWordList,
  getOfficialWordListStatus,
  getOfficialWords,
  getOfficialWordLengthMetrics,
  getOfficialWordLetterLength,
  subscribeOfficialWordListStatus,
  type OfficialWordListStatus
} from '@skribbl-duels/challenge-definitions';
import { DebugPanel } from './debugPanel';
import { DuelProductFoundation } from './duelProductUi';

const BUILD_VERSION = '0.50.0';

interface RuntimePublicApi {
  readonly runtimeId: string;
  readonly version: string;
  dispose(reason?: string): void;
}

interface RuntimeController extends RuntimePublicApi {
  addCleanup(cleanup: () => void): void;
  isActive(): boolean;
}

interface ProtocolPublicApi {
  getStats(): ReturnType<ProtocolDecoder['getStats']>;
  getRecent(): DecodedSocketRecord[];
  decodeRecord(record: RawSocketRecord): ReturnType<typeof decodeRawRecord>;
  exportSession(options?: PacketExportOptions): Promise<unknown>;
  exportBoth(options?: PacketExportOptions): Promise<unknown>;
}

interface LobbyPublicApi {
  getState(): CanonicalLobbyState;
  getStats(): ReturnType<LobbyStateStore['getStats']>;
  getRecentChanges(): LobbyStateChange[];
  subscribe(listener: (state: CanonicalLobbyState) => void): () => void;
  subscribeChanges(listener: (change: LobbyStateChange) => void): () => void;
  exportState(): unknown;
  getPlayers(): ReturnType<typeof selectPlayers>;
  getSelf(): ReturnType<typeof selectSelf>;
  getDrawer(): ReturnType<typeof selectDrawer>;
  getEstimatedServerTime(): number | null;
  getRoundIndex(): number | null;
  getRoundNumber(): number | null;
}

interface TelemetryPublicApi extends TelemetryProvider {
  exportSession(options?: TelemetryExportOptions): unknown;
}


interface ReplayPublicApi extends TelemetryProvider {
  createFixture(options?: CreateTelemetryFixtureOptions): TelemetryFixture;
  validateFixture(value: unknown): ReturnType<typeof validateTelemetryFixture>;
  parseFixture(json: string): ReturnType<typeof parseTelemetryFixture>;
  load(value: unknown): TelemetryFixture;
  getFixture(): TelemetryFixture | null;
  getState(): ReplayState;
  subscribeState(listener: (state: ReplayState) => void): () => void;
  play(options?: ReplayOptions): Promise<ReplayResult>;
  step(count?: number): TelemetryEvent[];
  pause(): void;
  resume(): void;
  stop(): void;
  reset(): void;
}

type ChallengeSource = 'live' | 'replay' | 'detached';

interface ChallengeEnginePublicApi {
  readonly version: typeof CHALLENGE_ENGINE_VERSION;
  getSource(): ChallengeSource;
  useLive(): void;
  useReplay(): void;
  detachSource(): void;
  register<TInternalState, TParameters>(
    definition: ChallengeDefinition<TInternalState, TParameters>
  ): void;
  activate<TParameters = unknown>(
    activation: ChallengeActivation<TParameters>
  ): ChallengeRuntimeSnapshot;
  deactivate(instanceId: string, reason?: string): boolean;
  process(event: TelemetryEvent): ChallengeEngineEvent[];
  processMany(events: readonly TelemetryEvent[]): ChallengeEngineEvent[];
  resolveCompletion(
    instanceId: string,
    resolution: CompletionResolution
  ): ChallengeRuntimeSnapshot;
  expire(instanceId: string, reason?: string): ChallengeRuntimeSnapshot;
  reset(reason?: string): void;
  getDefinitionIds(): string[];
  getDefinitions(): ChallengeDefinitionSummary[];
  getInstance(instanceId: string): ChallengeRuntimeSnapshot | null;
  getInstances(): ChallengeRuntimeSnapshot[];
  getStats(): ChallengeEngineStats;
  exportSnapshot(): ChallengeEngineSnapshot;
  restore(): Promise<ChallengeEngineSnapshot | null>;
  clearPersistence(): Promise<void>;
  subscribe(listener: (event: ChallengeEngineEvent) => void): () => void;
  subscribeState(listener: (instances: ChallengeRuntimeSnapshot[]) => void): () => void;
}



interface WordListPublicApi {
  getStatus(languageId?: number, languageName?: string | null): OfficialWordListStatus;
  getWords(languageId?: number): readonly string[];
  getLengthMetrics(languageId?: number): ReturnType<typeof getOfficialWordLengthMetrics>;
  getLetterLength(word: string): number;
  load(languageId?: number, languageName?: string | null, force?: boolean): Promise<OfficialWordListStatus>;
  subscribe(listener: (status: OfficialWordListStatus) => void): () => void;
}

interface ChallengeDefinitionsPublicApi {
  readonly version: typeof CHALLENGE_DEFINITIONS_VERSION;
  list(): Array<{
    id: string;
    version: number;
    metadata: ChallengeDefinitionSummary['metadata'];
    defaultParameters: unknown;
    sandboxInstanceId: string;
  }>;
  registerAll(): string[];
  activateStarterSet(): ChallengeRuntimeSnapshot[];
  deactivateStarterSet(): number;
}

interface InspectorPublicApi {
  version: string;
  sessionId: string;
  protocol: ProtocolPublicApi;
  lobby: LobbyPublicApi;
  telemetry: TelemetryPublicApi;
  exportSession(options?: PacketExportOptions): Promise<unknown>;
  exportAll(options?: PacketExportOptions): Promise<unknown>;
  clearAll(): Promise<void>;
  getStats(): ReturnType<RawPacketRecorder['getStats']>;
  isPanelMounted(): boolean;
  remountPanel(): void;
  setPanelVisible(visible: boolean): void;
}

declare global {
  interface Window {
    scdRawRecorder?: InspectorPublicApi;
    skribblDuelsTelemetry?: TelemetryPublicApi;
    skribblDuelsReplay?: ReplayPublicApi;
    skribblDuelsChallengeEngine?: ChallengeEnginePublicApi;
    skribblDuelsChallengeDefinitions?: ChallengeDefinitionsPublicApi;
    skribblDuelsWordLists?: WordListPublicApi;
    skribblDuelsRuntime?: RuntimePublicApi;
  }
}

function createRuntimeController(): RuntimeController {
  try { window.skribblDuelsRuntime?.dispose('superseded-by-new-runtime'); } catch {}
  for (const selector of [
    '#scd-raw-recorder-panel',
    '#skribbl-duels-launcher',
    '#skribbl-duels-panel',
    '#skribbl-duels-board',
    '.skribbl-duels-completion',
    '.scd-tooltip'
  ]) {
    document.querySelectorAll(selector).forEach(node => node.remove());
  }
  const runtimeId = `scd-${BUILD_VERSION}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const cleanups: Array<() => void> = [];
  let disposed = false;
  const runtime: RuntimeController = {
    runtimeId,
    version: BUILD_VERSION,
    addCleanup(cleanup) {
      if (disposed) cleanup();
      else cleanups.push(cleanup);
    },
    isActive: () => !disposed && window.skribblDuelsRuntime === runtime,
    dispose(reason = 'runtime-disposed') {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups.splice(0).reverse()) {
        try { cleanup(); } catch (error) {
          console.warn('[Skribbl Duels Runtime] Cleanup failed', reason, error);
        }
      }
      if (window.skribblDuelsRuntime === runtime) delete window.skribblDuelsRuntime;
    }
  };
  window.skribblDuelsRuntime = runtime;
  return runtime;
}

async function bootstrap(runtime: RuntimeController): Promise<void> {
  const bridge = new TypoRelayBridge();
  const store = new IndexedDbRawPacketStore();
  // Typo transfers both relay MessagePorts only once during page startup. The
  // listener must therefore be active before any asynchronous storage work.
  // Awaiting IndexedDB cleanup here used to lose that handshake and left the
  // complete live telemetry pipeline at zero events.
  bridge.start();
  runtime.addCleanup(() => bridge.stop());

  const recorder = new RawPacketRecorder(
    store,
    bridge.incoming$ as import('rxjs').Observable<RelayEnvelope>,
    bridge.outgoing$ as import('rxjs').Observable<RelayEnvelope>,
    BUILD_VERSION
  );
  const decoder = new ProtocolDecoder(recorder.records$);
  const lobbyStore = new LobbyStateStore(decoder.decoded$);
  const telemetryStore = new TelemetryStore(decoder.decoded$, lobbyStore.changes$, lobbyStore);
  const avatarTelemetryAdapter = new AvatarTelemetryAdapter(telemetryStore);
  const strokeTelemetryAdapter = new StrokeTelemetryAdapter(telemetryStore, lobbyStore);
  const canvasSnapshotTelemetryAdapter = new CanvasSnapshotTelemetryAdapter(telemetryStore);
  const canvasWhiteTelemetryAdapter = new CanvasWhiteTelemetryAdapter(telemetryStore);
  const homeInteractionTelemetryAdapter = new HomeInteractionTelemetryAdapter(telemetryStore);
  const typoDropTelemetryAdapter = new TypoDropTelemetryAdapter(telemetryStore);
  const typoAutodrawTelemetryAdapter = new TypoAutodrawTelemetryAdapter(telemetryStore);
  const typoChallengeTelemetryAdapter = new TypoChallengeTelemetryAdapter(telemetryStore);
  const replayProvider = new TelemetryReplayProvider();
  void store.redactSensitiveRecords().catch(error => {
    console.warn('[Skribbl Duels Telemetry] Stored-record redaction failed', error);
  });
  runtime.addCleanup(() => recorder.destroy());
  runtime.addCleanup(() => decoder.destroy());
  runtime.addCleanup(() => lobbyStore.destroy());
  runtime.addCleanup(() => telemetryStore.destroy());
  runtime.addCleanup(() => strokeTelemetryAdapter.destroy());
  runtime.addCleanup(() => canvasSnapshotTelemetryAdapter.destroy());
  runtime.addCleanup(() => canvasWhiteTelemetryAdapter.destroy());
  runtime.addCleanup(() => avatarTelemetryAdapter.stop());
  runtime.addCleanup(() => homeInteractionTelemetryAdapter.stop());
  runtime.addCleanup(() => typoDropTelemetryAdapter.stop());
  runtime.addCleanup(() => typoAutodrawTelemetryAdapter.stop());
  runtime.addCleanup(() => typoChallengeTelemetryAdapter.stop());
  runtime.addCleanup(() => replayProvider.destroy());
  const loadWordListWithWarning = async (
    languageId: number,
    languageName?: string | null,
    force = false
  ): Promise<OfficialWordListStatus> => {
    const status = await loadOfficialWordList(languageId, languageName, force);
    if (status.warning) console.warn('[Skribbl Duels Word Lists]', status.warning, status);
    return status;
  };

  const preloadHomepageWordList = (force = false): void => {
    const select = document.querySelector<HTMLSelectElement>('#home select');
    if (!select) return;
    const languageId = Number(select.value);
    const languageName = select.options[select.selectedIndex]?.textContent?.trim() ?? null;
    if (!Number.isInteger(languageId)) return;
    void loadWordListWithWarning(languageId, languageName, force);
  };

  const handleHomepageLanguageChange = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.matches('#home select')) {
      preloadHomepageWordList(true);
    }
  };
  const handleHomepagePlayClick = (event: MouseEvent): void => {
    const target = event.target;
    if (target instanceof Element && target.closest('.button-play,.button-create')) {
      preloadHomepageWordList(false);
    }
  };
  document.addEventListener('change', handleHomepageLanguageChange, true);
  document.addEventListener('click', handleHomepagePlayClick, true);
  runtime.addCleanup(() => {
    document.removeEventListener('change', handleHomepageLanguageChange, true);
    document.removeEventListener('click', handleHomepagePlayClick, true);
  });
  preloadHomepageWordList(false);

  const wordListTelemetrySubscription = telemetryStore.events$.subscribe(event => {
    if (event.type === 'LOBBY_HYDRATED' && event.context.languageId !== null) {
      void loadWordListWithWarning(event.context.languageId, event.context.languageName);
    }
  });
  runtime.addCleanup(() => wordListTelemetrySubscription.unsubscribe());
  const challengeEngine = new ChallengeEngine({
    persistence: new LocalStorageChallengePersistence(
      'skribblDuelsChallengeEngineInspectorV2'
    ),
    autoPersist: true
  });
  runtime.addCleanup(() => challengeEngine.destroy());
  registerStarterChallengeDefinitions(challengeEngine);
  await challengeEngine.restore();
  if (!runtime.isActive()) return;

  const challengeSource$ = new BehaviorSubject<ChallengeSource>('detached');
  let detachChallengeProvider: (() => void) | null = null;

  const setChallengeSource = (source: ChallengeSource): void => {
    detachChallengeProvider?.();
    detachChallengeProvider = null;

    if (source === 'live') {
      detachChallengeProvider = challengeEngine.attachProvider(
        telemetryStoreAsProvider(),
        'live-telemetry'
      );
    } else if (source === 'replay') {
      detachChallengeProvider = challengeEngine.attachProvider(
        replayProvider,
        'telemetry-replay'
      );
    }

    challengeSource$.next(source);
  };
  runtime.addCleanup(() => {
    detachChallengeProvider?.();
    detachChallengeProvider = null;
    challengeSource$.complete();
  });

  function telemetryStoreAsProvider(): TelemetryProvider {
    const descriptor = createTelemetryProviderDescriptor(
      'Skribbl Duels Telemetry Core',
      BUILD_VERSION,
      CORE_SUPPORTED_TELEMETRY_EVENTS
    );
    return {
      descriptor,
      getStats: () => telemetryStore.getStats(),
      getRecent: options => telemetryStore.getRecent(options),
      getByType<TType extends TelemetryEventType>(type: TType): TelemetryEventOf<TType>[] {
        return telemetryStore.getByType(type);
      },
      subscribe(listener) {
        const subscription = telemetryStore.events$.subscribe(event => listener(event));
        return () => subscription.unsubscribe();
      }
    };
  }

  const panel = new DebugPanel({
    runtimeId: runtime.runtimeId,
    recorder,
    decoder,
    lobbyStore,
    telemetryStore,
    replayProvider,
    challengeEngine,
    challengeSource$: challengeSource$.asObservable(),
    useChallengeLive: () => setChallengeSource('live'),
    useChallengeReplay: () => setChallengeSource('replay'),
    detachChallengeSource: () => setChallengeSource('detached'),
    activateStarterChallenges: () => activateStarterSandbox(challengeEngine),
    deactivateStarterChallenges: () => deactivateStarterSandbox(challengeEngine),
    store,
    incomingStatus$: bridge.incomingStatus$,
    outgoingStatus$: bridge.outgoingStatus$
  });
  panel.setVisible(false);
  panel.mount();
  runtime.addCleanup(() => panel.destroy());

  const protocolApi: ProtocolPublicApi = {
    getStats: () => decoder.getStats(),
    getRecent: () => decoder.getRecent(),
    decodeRecord: record => decodeRawRecord(record),
    async exportSession(options = {}) {
      await recorder.flushPending();
      const rawRecords = await store.getSessionRecords(recorder.getSessionId());
      const filtered = filterDecodedRecords(decoder.decodeMany(rawRecords), options);
      return {
        exportedAt: Date.now(),
        sessionId: recorder.getSessionId(),
        filter: filtered.summary,
        lobbyState: lobbyStore.getSnapshot(),
        decodedRecords: filtered.records
      };
    },
    async exportBoth(options = {}) {
      await recorder.flushPending();
      const allRecords = await store.getSessionRecords(recorder.getSessionId());
      const rawFiltered = filterRawRecords(allRecords, options);
      const decodedFiltered = filterDecodedRecords(decoder.decodeMany(allRecords), options);
      return {
        exportedAt: Date.now(),
        sessionId: recorder.getSessionId(),
        filter: rawFiltered.summary,
        lobbyState: lobbyStore.getSnapshot(),
        stateStats: lobbyStore.getStats(),
        recentStateChanges: lobbyStore.getRecentChanges(),
        telemetry: telemetryStore.exportSnapshot(),
        records: rawFiltered.records,
        decodedRecords: decodedFiltered.records
      };
    }
  };

  const lobbyApi: LobbyPublicApi = {
    getState: () => lobbyStore.getSnapshot(),
    getStats: () => lobbyStore.getStats(),
    getRecentChanges: () => lobbyStore.getRecentChanges(),
    subscribe(listener) {
      const subscription = lobbyStore.state$.subscribe(listener);
      return () => subscription.unsubscribe();
    },
    subscribeChanges(listener) {
      const subscription = lobbyStore.changes$.subscribe(listener);
      return () => subscription.unsubscribe();
    },
    exportState() {
      return {
        exportedAt: Date.now(),
        sessionId: recorder.getSessionId(),
        lobbyState: lobbyStore.getSnapshot(),
        stateStats: lobbyStore.getStats(),
        recentStateChanges: lobbyStore.getRecentChanges()
      };
    },
    getPlayers: () => selectPlayers(lobbyStore.getSnapshot()),
    getSelf: () => selectSelf(lobbyStore.getSnapshot()),
    getDrawer: () => selectDrawer(lobbyStore.getSnapshot()),
    getEstimatedServerTime: () => selectEstimatedServerTime(lobbyStore.getSnapshot()),
    getRoundIndex: () => lobbyStore.getSnapshot().serverRoundIndex,
    getRoundNumber: () => lobbyStore.getSnapshot().round
  };

  const descriptor = createTelemetryProviderDescriptor(
    'Skribbl Duels Telemetry Core',
    BUILD_VERSION,
    CORE_SUPPORTED_TELEMETRY_EVENTS
  );

  const telemetryApi: TelemetryPublicApi = {
    descriptor,
    getStats: () => telemetryStore.getStats(),
    getRecent: options => telemetryStore.getRecent(options),
    getByType<TType extends TelemetryEventType>(type: TType): TelemetryEventOf<TType>[] {
      return telemetryStore.getByType(type);
    },
    subscribe(listener) {
      const subscription = telemetryStore.events$.subscribe(event => listener(event as TelemetryEvent));
      return () => subscription.unsubscribe();
    },
    exportSession(options = {}) {
      return {
        sessionId: recorder.getSessionId(),
        contractVersion: TELEMETRY_CONTRACT_VERSION,
        schemaVersion: TELEMETRY_SCHEMA_VERSION,
        ...(telemetryStore.exportSnapshot(options) as Record<string, unknown>)
      };
    }
  };

  window.skribblDuelsTelemetry = telemetryApi;

  const replayApi: ReplayPublicApi = {
    get descriptor() {
      return replayProvider.descriptor;
    },
    getStats: () => replayProvider.getStats(),
    getRecent: options => replayProvider.getRecent(options),
    getByType<TType extends TelemetryEventType>(type: TType): TelemetryEventOf<TType>[] {
      return replayProvider.getByType(type);
    },
    subscribe(listener) {
      return replayProvider.subscribe(listener);
    },
    createFixture(options = {}) {
      return createFixtureFromProvider(telemetryApi, options);
    },
    validateFixture: value => validateTelemetryFixture(value),
    parseFixture: json => parseTelemetryFixture(json),
    load: value => replayProvider.load(value),
    getFixture: () => replayProvider.getFixture(),
    getState: () => replayProvider.getState(),
    subscribeState: listener => replayProvider.subscribeState(listener),
    play: options => replayProvider.play(options),
    step: count => replayProvider.step(count),
    pause: () => replayProvider.pause(),
    resume: () => replayProvider.resume(),
    stop: () => replayProvider.stop(),
    reset: () => replayProvider.reset()
  };

  window.skribblDuelsReplay = replayApi;

  const challengeApi: ChallengeEnginePublicApi = {
    version: CHALLENGE_ENGINE_VERSION,
    getSource: () => challengeSource$.value,
    useLive: () => setChallengeSource('live'),
    useReplay: () => setChallengeSource('replay'),
    detachSource: () => setChallengeSource('detached'),
    register: definition => challengeEngine.register(definition),
    activate: activation => challengeEngine.activate(activation),
    deactivate: (instanceId, reason) => challengeEngine.deactivate(instanceId, reason),
    process: event => challengeEngine.process(event),
    processMany: events => challengeEngine.processMany(events),
    resolveCompletion: (instanceId, resolution) =>
      challengeEngine.resolveCompletion(instanceId, resolution),
    expire: (instanceId, reason) => challengeEngine.expire(instanceId, reason),
    reset: reason => challengeEngine.reset(reason),
    getDefinitionIds: () => challengeEngine.getDefinitionIds(),
    getDefinitions: () => challengeEngine.getDefinitions(),
    getInstance: instanceId => challengeEngine.getInstance(instanceId),
    getInstances: () => challengeEngine.getInstances(),
    getStats: () => challengeEngine.getStats(),
    exportSnapshot: () => challengeEngine.exportSnapshot(),
    restore: () => challengeEngine.restore(),
    clearPersistence: () => challengeEngine.clearPersistence(),
    subscribe: listener => challengeEngine.subscribe(listener),
    subscribeState: listener => challengeEngine.subscribeState(listener)
  };
  window.skribblDuelsChallengeEngine = challengeApi;

  const wordListApi: WordListPublicApi = {
    getStatus(languageId = lobbyStore.getSnapshot().languageId ?? -1, languageName = lobbyStore.getSnapshot().languageName) {
      return getOfficialWordListStatus(languageId, languageName);
    },
    getWords(languageId = lobbyStore.getSnapshot().languageId ?? -1) {
      return getOfficialWords(languageId);
    },
    getLengthMetrics(languageId = lobbyStore.getSnapshot().languageId ?? -1) {
      return getOfficialWordLengthMetrics(languageId);
    },
    getLetterLength(word) {
      return getOfficialWordLetterLength(word);
    },
    load(languageId = lobbyStore.getSnapshot().languageId ?? -1, languageName = lobbyStore.getSnapshot().languageName, force = false) {
      return loadWordListWithWarning(languageId, languageName, force);
    },
    subscribe: listener => subscribeOfficialWordListStatus(listener)
  };
  window.skribblDuelsWordLists = wordListApi;

  const challengeDefinitionsApi: ChallengeDefinitionsPublicApi = {
    version: CHALLENGE_DEFINITIONS_VERSION,
    list: () => starterChallengeDefinitions.map(definition => ({
      id: definition.id,
      version: definition.version,
      metadata: structuredClone(definition.metadata),
      defaultParameters: structuredClone(definition.defaultParameters),
      sandboxInstanceId: starterSandboxInstanceIds[definition.id as keyof typeof starterSandboxInstanceIds]
    })),
    registerAll: () => registerStarterChallengeDefinitions(challengeEngine),
    activateStarterSet: () => activateStarterSandbox(challengeEngine),
    deactivateStarterSet: () => deactivateStarterSandbox(challengeEngine)
  };
  window.skribblDuelsChallengeDefinitions = challengeDefinitionsApi;

  const productFoundation = new DuelProductFoundation({
    runtimeId: runtime.runtimeId,
    definitionsVersion: CHALLENGE_DEFINITIONS_VERSION,
    challengeDefinitions: challengeEngine.getDefinitions(),
    challengeEngine,
    subscribeTelemetry(listener) {
      const subscription = telemetryStore.events$.subscribe(event => listener(event));
      return () => subscription.unsubscribe();
    },
    getSelfName() {
      return selectSelf(lobbyStore.getSnapshot())?.name ?? 'Alpha';
    }
  });
  const productApi = productFoundation.start();
  runtime.addCleanup(() => productFoundation.destroy('runtime-disposed'));

  setChallengeSource('live');
  avatarTelemetryAdapter.start();
  homeInteractionTelemetryAdapter.start();
  typoDropTelemetryAdapter.start();
  typoAutodrawTelemetryAdapter.start();
  typoChallengeTelemetryAdapter.start();

  const inspectorApi: InspectorPublicApi = {
    version: BUILD_VERSION,
    sessionId: recorder.getSessionId(),
    protocol: protocolApi,
    lobby: lobbyApi,
    telemetry: telemetryApi,
    async exportSession(options = {}) {
      await recorder.flushPending();
      const allRecords = await store.getSessionRecords(recorder.getSessionId());
      const filtered = filterRawRecords(allRecords, options);
      return {
        exportedAt: Date.now(),
        sessionId: recorder.getSessionId(),
        filter: filtered.summary,
        lobbyState: lobbyStore.getSnapshot(),
        records: filtered.records
      };
    },
    async exportAll(options = {}) {
      await recorder.flushPending();
      const [sessions, allRecords] = await Promise.all([
        store.getAllSessions(),
        store.getAllRecords()
      ]);
      const filtered = filterRawRecords(allRecords, options);
      return { exportedAt: Date.now(), filter: filtered.summary, sessions, records: filtered.records };
    },
    clearAll: () => store.clearAll(),
    getStats: () => recorder.getStats(),
    isPanelMounted: () => panel.isMounted(),
    remountPanel: () => panel.ensureMounted(),
    setPanelVisible: visible => panel.setVisible(visible)
  };
  window.scdRawRecorder = inspectorApi;
  runtime.addCleanup(() => {
    if (window.scdRawRecorder === inspectorApi) delete window.scdRawRecorder;
    if (window.skribblDuelsTelemetry === telemetryApi) delete window.skribblDuelsTelemetry;
    if (window.skribblDuelsReplay === replayApi) delete window.skribblDuelsReplay;
    if (window.skribblDuelsChallengeEngine === challengeApi) delete window.skribblDuelsChallengeEngine;
    if (window.skribblDuelsChallengeDefinitions === challengeDefinitionsApi) delete window.skribblDuelsChallengeDefinitions;
    if (window.skribblDuelsWordLists === wordListApi) delete window.skribblDuelsWordLists;
  });

  console.info('[Skribbl Duels] Initialized', {
    version: BUILD_VERSION,
    contractVersion: TELEMETRY_CONTRACT_VERSION,
    sessionId: recorder.getSessionId(),
    telemetry: window.skribblDuelsTelemetry,
    replay: window.skribblDuelsReplay,
    challengeEngine: window.skribblDuelsChallengeEngine,
    challengeDefinitions: window.skribblDuelsChallengeDefinitions,
    wordList: window.skribblDuelsWordLists?.getStatus(),
    product: productApi
  });
}

const runtime = createRuntimeController();
void bootstrap(runtime).catch(error => {
  runtime.dispose('bootstrap-failed');
  console.error('[Skribbl Duels] Bootstrap failed', error);
});
