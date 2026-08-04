import type {
  ChallengeEngine,
  ChallengeEngineEvent
} from '@skribbl-duels/challenge-engine';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';
import {
  createChallengeManifest,
  generateDraftBoard,
  validateDraftBoard,
  LocalStorageProductUiSettingsStore,
  MatchStateStore,
  MatchTelemetryGateway,
  PRODUCT_CORE_VERSION,
  type ChallengeCapability,
  type ChallengeManifestSnapshot,
  type DraftBoard,
  type DraftRequest,
  type DraftResult,
  type DuelParticipant,
  type DuelPlayerSide,
  type MatchState,
  type OutboundTelemetryEnvelope,
  type ProductUiSettings
} from '@skribbl-duels/product-core';
import {
  GATEWAY_CONTRACT_VERSION,
  type GatewayClientCapability
} from '@skribbl-duels/gateway-contracts';
import {
  GATEWAY_CLIENT_VERSION,
  GATEWAY_URL,
  SocketIoGatewayClient,
  type GatewayConnectionSnapshot
} from '@skribbl-duels/gateway-client';
import {
  AUTH_CLIENT_VERSION,
  SupabaseDiscordAuthClient,
  type AuthSnapshot
} from '@skribbl-duels/auth-client';

interface ProductFoundationOptions {
  definitionsVersion: string;
  challengeDefinitions: ReturnType<ChallengeEngine['getDefinitions']>;
  challengeEngine: ChallengeEngine;
  subscribeTelemetry(listener: (event: TelemetryEvent) => void): () => void;
  getSelfName(): string;
}

interface CompletionMessage {
  claimId: string;
  side: DuelPlayerSide;
  playerName: string;
  challengeId: string;
  challengeName: string;
  occurredAt: number;
}

interface DuelChatMessage {
  id: string;
  side: DuelPlayerSide;
  author: string;
  message: string;
  occurredAt: number;
}

interface PersistedProductMatch {
  version: 1;
  state: MatchState;
  board: DraftBoard | null;
}

interface ProductPublicApi {
  readonly version: string;
  readonly coreVersion: typeof PRODUCT_CORE_VERSION;
  readonly gatewayContractVersion: typeof GATEWAY_CONTRACT_VERSION;
  readonly gatewayClientVersion: typeof GATEWAY_CLIENT_VERSION;
  readonly authClientVersion: typeof AUTH_CLIENT_VERSION;
  auth: {
    getState(): AuthSnapshot;
    subscribe(listener: (state: AuthSnapshot) => void): () => void;
    signInWithDiscord(): Promise<void>;
    signOut(): Promise<void>;
    getAccessToken(): string | null;
  };
  gateway: {
    getState(): GatewayConnectionSnapshot;
    subscribe(listener: (state: GatewayConnectionSnapshot) => void): () => void;
    reconnect(): void;
  };
  manifest: {
    get(): ChallengeManifestSnapshot;
    list(): ChallengeManifestSnapshot['entries'];
  };
  draft: {
    generate(request: DraftRequest): DraftResult;
    validate(board: DraftBoard): ReturnType<typeof validateDraftBoard>;
    getCurrent(): DraftBoard | null;
  };
  match: {
    getState(): MatchState;
    subscribe(listener: (state: MatchState) => void): () => void;
    startDemo(format?: 'casual' | 'ranked'): MatchState;
    reset(): MatchState;
    receiveOpponentCompletion(challengeId: string, claimId?: string, playerName?: string): MatchState;
    finish(winner: DuelPlayerSide): MatchState;
    canSendTelemetry(): boolean;
    getTelemetryStats(): ReturnType<MatchTelemetryGateway['getStats']>;
    setTelemetryTransport(transport: ((envelope: OutboundTelemetryEnvelope) => void | Promise<void>) | null): void;
  };
  settings: {
    get(): ProductUiSettings;
    update(update: Partial<ProductUiSettings>): ProductUiSettings;
    updateBoard(update: Partial<ProductUiSettings['board']>): ProductUiSettings;
    reset(): ProductUiSettings;
  };
  ui: {
    open(tab?: ProductUiSettings['panelTab']): void;
    close(): void;
    toggle(): void;
    remount(): void;
  };
  chat: {
    insertCompletion(message: CompletionMessage): void;
    getMessages(): readonly DuelChatMessage[];
  };
}

declare global {
  interface Window {
    skribblDuelsProduct?: ProductPublicApi;
  }
}

const ALL_CAPABILITIES = new Set<ChallengeCapability>([
  'skribbl-telemetry',
  'official-word-list',
  'typo',
  'typo-challenges',
  'typo-drops',
  'typo-image-lab'
]);

const GATEWAY_CAPABILITIES: readonly GatewayClientCapability[] = [
  'skribbl-telemetry',
  'official-word-list',
  'typo',
  'typo-challenges',
  'typo-drops',
  'typo-image-lab'
];

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function challengeName(manifest: ChallengeManifestSnapshot, id: string): string {
  return manifest.entries.find(entry => entry.id === id)?.name ?? id;
}

class CompletionChatAdapter {
  private insertedClaimIds = new Set<string>();
  private pending: CompletionMessage[] = [];
  private mountGuard: number | null = null;

  public constructor(private readonly enabled: () => boolean) {}

  public start(): void {
    this.ensureStyles();
    if (this.mountGuard === null) {
      this.mountGuard = window.setInterval(() => this.flush(), 500);
    }
  }

  public insert(message: CompletionMessage): void {
    if (this.insertedClaimIds.has(message.claimId)) return;
    this.insertedClaimIds.add(message.claimId);
    this.pending.push(message);
    this.flush();
  }

  private ensureStyles(): void {
    if (document.getElementById('skribbl-duels-product-styles')) return;
    const style = document.createElement('style');
    style.id = 'skribbl-duels-product-styles';
    style.textContent = `
:root {
  --COLOR_CHAT_BG_LEAVE_ALT: #FFD4BD;
  --COLOR_CHAT_BG_LEAVE_BASE: #FFEADF;
  --SCD_PANEL_BG: rgba(22, 24, 31, .97);
  --SCD_PANEL_BORDER: rgba(255, 255, 255, .16);
  --SCD_ACCENT: #7f8cff;
  --SCD_SELF: #8ee087;
  --SCD_OPPONENT: #ff9f72;
}
#game-chat .chat-content p.skribbl-duels-completion { padding: 2px 6px; box-sizing: border-box; }
#game-chat .chat-content p.skribbl-duels-completion.own.base { color: var(--COLOR_CHAT_TEXT_GUESSED) !important; background-color: var(--COLOR_CHAT_BG_GUESSED_BASE) !important; }
#game-chat .chat-content p.skribbl-duels-completion.own.alt { color: var(--COLOR_CHAT_TEXT_GUESSED) !important; background-color: var(--COLOR_CHAT_BG_GUESSED_ALT) !important; }
#game-chat .chat-content p.skribbl-duels-completion.opponent.base { color: var(--COLOR_CHAT_TEXT_LEAVE) !important; background-color: var(--COLOR_CHAT_BG_LEAVE_BASE) !important; }
#game-chat .chat-content p.skribbl-duels-completion.opponent.alt { color: var(--COLOR_CHAT_TEXT_LEAVE) !important; background-color: var(--COLOR_CHAT_BG_LEAVE_ALT) !important; }
.scd-tooltip { position:fixed;display:flex;z-index:2147483647;align-items:center;pointer-events:none;transform-origin:0 0;animation:scd-tooltip-appear .1s forwards ease-out; }
.scd-tooltip-title { background:var(--COLOR_TOOL_TIP_BG,#20232c);color:var(--COLOR_PANEL_TEXT,#fff);border-radius:var(--BORDER_RADIUS,6px);padding:7px;text-shadow:1px 1px 0 #00000038;text-align:center;font-size:13px;font-weight:700;white-space:pre;max-width:320px; }
.scd-tooltip-arrow { height:0;width:0; }
.scd-tooltip.E { transform:translateY(-50%);flex-direction:row; }
.scd-tooltip.E .scd-tooltip-arrow { border-right:10px solid var(--COLOR_TOOL_TIP_BG,#20232c);border-top:10px solid transparent;border-bottom:10px solid transparent; }
.scd-tooltip.W { transform:translateX(-100%) translateY(-50%);flex-direction:row-reverse; }
.scd-tooltip.W .scd-tooltip-arrow { border-left:10px solid var(--COLOR_TOOL_TIP_BG,#20232c);border-top:10px solid transparent;border-bottom:10px solid transparent; }
.scd-tooltip.N { transform:translateX(-50%) translateY(-100%);flex-direction:column-reverse; }
.scd-tooltip.N .scd-tooltip-arrow { border-top:10px solid var(--COLOR_TOOL_TIP_BG,#20232c);border-left:10px solid transparent;border-right:10px solid transparent; }
.scd-tooltip.S { transform:translateX(-50%);flex-direction:column; }
.scd-tooltip.S .scd-tooltip-arrow { border-bottom:10px solid var(--COLOR_TOOL_TIP_BG,#20232c);border-left:10px solid transparent;border-right:10px solid transparent; }
@keyframes scd-tooltip-appear { from { opacity:0;scale:0; } to { opacity:1;scale:1; } }
#skribbl-duels-launcher, #skribbl-duels-panel, #skribbl-duels-board { box-sizing: border-box; font-family: Arial, sans-serif; }
#skribbl-duels-launcher * , #skribbl-duels-panel *, #skribbl-duels-board * { box-sizing: border-box; }
.scd-button { border: 1px solid rgba(255,255,255,.18); border-radius: 7px; background: rgba(255,255,255,.08); color: white; padding: 7px 10px; cursor: pointer; }
.scd-button:hover { background: rgba(255,255,255,.14); }
.scd-button.primary { background: var(--SCD_ACCENT); border-color: transparent; color: #fff; font-weight: 700; }
.scd-button.danger { background: rgba(255,95,95,.17); }
.scd-field { position: relative; min-width: 0; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.055); color: white; border-radius: 5px; padding: 4px; overflow: hidden; }
.scd-field.pending { box-shadow: inset 0 0 0 2px #ffd95f; }
.scd-field.self { background: rgba(86,206,39,.27); border-color: rgba(142,224,135,.8); }
.scd-field.opponent { background: rgba(206,79,10,.29); border-color: rgba(255,159,114,.8); }
.scd-field-index { opacity: .55; font-size: 9px; }
.scd-field-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; line-height: 1.15; }
.scd-tab.active { background: var(--SCD_ACCENT); }
.scd-muted { color: rgba(255,255,255,.6); }
.scd-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.scd-stack { display: flex; flex-direction: column; gap: 9px; }
.scd-card { background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; padding: 10px; }
.scd-label { display:flex; align-items:center; justify-content:space-between; gap:10px; color:white; }
.scd-label input[type='range'] { flex:1; }
.scd-auth-profile { display:flex;align-items:center;gap:10px;min-width:0; }
.scd-auth-avatar { width:42px;height:42px;border-radius:50%;object-fit:cover;background:rgba(255,255,255,.1);flex:none; }
.scd-auth-copy { min-width:0;flex:1; }
.scd-auth-name { font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.scd-auth-email { color:rgba(255,255,255,.58);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.scd-auth-error { color:#ffb0b0;font-size:11px;white-space:pre-wrap; }
`;
    (document.head ?? document.documentElement).appendChild(style);
  }

  private flush(): void {
    if (!this.enabled() || this.pending.length === 0) return;
    const target = document.querySelector<HTMLElement>('#game-chat .chat-content');
    if (!target) return;

    while (this.pending.length > 0) {
      const message = this.pending.shift();
      if (!message) break;
      if (target.querySelector(`[data-skribbl-duels-claim-id="${CSS.escape(message.claimId)}"]`)) continue;
      const nextChildIndex = target.children.length + 1;
      const parity = nextChildIndex % 2 === 0 ? 'alt' : 'base';
      const paragraph = document.createElement('p');
      paragraph.className = `skribbl-duels-completion ${message.side === 'self' ? 'own' : 'opponent'} ${parity}`;
      paragraph.dataset.skribblDuelsClaimId = message.claimId;
      const bold = document.createElement('b');
      bold.textContent = `${message.playerName} has completed '${message.challengeName}'!`;
      paragraph.append(bold, document.createElement('span'));
      target.appendChild(paragraph);
      target.scrollTop = target.scrollHeight;
    }
  }
}

class ProductTooltipManager {
  private active: HTMLDivElement | null = null;
  private currentTarget: HTMLElement | null = null;
  private readonly pointerOver = (event: PointerEvent) => this.handlePointerOver(event);
  private readonly pointerLeave = () => this.hide();

  public start(): void {
    document.addEventListener('pointerover', this.pointerOver, true);
    document.documentElement.addEventListener('pointerleave', this.pointerLeave);
  }

  public register(target: HTMLElement, title: string, lock?: 'X' | 'Y'): void {
    target.dataset.scdTooltip = title;
    if (lock) target.dataset.scdTooltipLock = lock;
    else delete target.dataset.scdTooltipLock;
  }

  private handlePointerOver(event: PointerEvent): void {
    const raw = event.target;
    const target = raw instanceof Element
      ? raw.closest<HTMLElement>('[data-scd-tooltip]')
      : null;
    if (target === this.currentTarget) return;
    if (!target) {
      this.hide();
      return;
    }
    this.show(target);
  }

  private show(target: HTMLElement): void {
    this.hide();
    const title = target.dataset.scdTooltip;
    if (!title) return;
    const rect = this.getVisibleRect(target);
    const lock = target.dataset.scdTooltipLock;
    const top = rect.top;
    const bottom = window.innerHeight - rect.top - rect.height;
    const left = rect.left;
    const right = window.innerWidth - rect.left - rect.width;
    let direction: 'N' | 'S' | 'E' | 'W' = lock !== 'Y' ? 'E' : 'N';
    let anchorX = lock !== 'Y' ? rect.left + rect.width : rect.left + rect.width / 2;
    let anchorY = lock !== 'Y' ? rect.top + rect.height / 2 : rect.top;
    if (lock !== 'X' && top > bottom && (top > left && top > right || lock === 'Y')) {
      direction = 'N';
      anchorX = rect.left + rect.width / 2;
      anchorY = rect.top;
    } else if (lock !== 'X' && bottom > top && (bottom > left && bottom > right || lock === 'Y')) {
      direction = 'S';
      anchorX = rect.left + rect.width / 2;
      anchorY = rect.top + rect.height;
    } else if (lock !== 'Y' && left > right) {
      direction = 'W';
      anchorX = rect.left;
      anchorY = rect.top + rect.height / 2;
    }
    const tooltip = element('div', `scd-tooltip ${direction}`);
    tooltip.style.left = `${anchorX}px`;
    tooltip.style.top = `${anchorY}px`;
    tooltip.append(element('div', 'scd-tooltip-arrow'), element('div', 'scd-tooltip-title', title));
    document.body.appendChild(tooltip);
    this.currentTarget = target;
    this.active = tooltip;
  }

  private hide(): void {
    this.active?.remove();
    this.active = null;
    this.currentTarget = null;
  }

  private getVisibleRect(element: HTMLElement): { width: number; height: number; top: number; left: number } {
    const elementRect = element.getBoundingClientRect();
    const visible = { top: elementRect.top, left: elementRect.left, right: elementRect.right, bottom: elementRect.bottom };
    let current: HTMLElement | null = element.parentElement;
    while (current) {
      const style = getComputedStyle(current);
      if (style.overflow !== 'visible' || style.overflowX !== 'visible' || style.overflowY !== 'visible') {
        const parent = current.getBoundingClientRect();
        visible.top = Math.max(visible.top, parent.top);
        visible.left = Math.max(visible.left, parent.left);
        visible.right = Math.min(visible.right, parent.right);
        visible.bottom = Math.min(visible.bottom, parent.bottom);
      }
      current = current.parentElement;
    }
    visible.top = Math.max(0, visible.top);
    visible.left = Math.max(0, visible.left);
    visible.right = Math.min(window.innerWidth, visible.right);
    visible.bottom = Math.min(window.innerHeight, visible.bottom);
    return {
      width: Math.max(0, visible.right - visible.left),
      height: Math.max(0, visible.bottom - visible.top),
      top: visible.top,
      left: visible.left
    };
  }
}

export class DuelProductFoundation {
  public readonly manifest: ChallengeManifestSnapshot;
  public readonly matchStore: MatchStateStore;
  public readonly telemetryGateway: MatchTelemetryGateway;
  public readonly settingsStore = new LocalStorageProductUiSettingsStore();

  private readonly matchStorageKey = 'skribblDuelsProductMatchSessionV1';
  private currentBoard: DraftBoard | null = null;
  private launcher: HTMLButtonElement | null = null;
  private panel: HTMLDivElement | null = null;
  private panelBody: HTMLDivElement | null = null;
  private board: HTMLDivElement | null = null;
  private boardGrid: HTMLDivElement | null = null;
  private mountGuard: number | null = null;
  private settings: ProductUiSettings;
  private matchState: MatchState;
  private chatAdapter: CompletionChatAdapter;
  private duelChatMessages: DuelChatMessage[] = [];
  private activeTab: ProductUiSettings['panelTab'];
  private readonly tooltips = new ProductTooltipManager();
  private readonly authClient = new SupabaseDiscordAuthClient();
  private readonly gatewayClient: SocketIoGatewayClient;
  private authState: AuthSnapshot;
  private gatewayState: GatewayConnectionSnapshot;

  public constructor(private readonly options: ProductFoundationOptions) {
    this.manifest = createChallengeManifest({
      definitionsVersion: options.definitionsVersion,
      definitions: options.challengeDefinitions
    }, 'en');
    const persisted = this.loadPersistedMatch();
    this.currentBoard = persisted?.board ?? null;
    this.matchStore = new MatchStateStore(persisted?.state);
    this.telemetryGateway = new MatchTelemetryGateway(this.matchStore);
    this.settings = this.settingsStore.get();
    this.matchState = this.matchStore.getState();
    this.activeTab = this.settings.panelTab;
    this.chatAdapter = new CompletionChatAdapter(() => this.settings.completionMessages);
    this.authState = this.authClient.getState();
    this.gatewayClient = new SocketIoGatewayClient({
      endpoint: GATEWAY_URL,
      clientVersion: GATEWAY_CLIENT_VERSION,
      capabilities: GATEWAY_CAPABILITIES
    });
    this.gatewayState = this.gatewayClient.getState();
  }

  public start(): ProductPublicApi {
    this.chatAdapter.start();
    this.tooltips.start();
    this.gatewayClient.subscribe(state => {
      this.gatewayState = state;
      if (this.activeTab === 'duel' || this.activeTab === 'match' || this.activeTab === 'about') {
        this.renderPanel();
      }
    });
    this.authClient.subscribe(state => {
      this.authState = state;
      this.gatewayClient.setAccessToken(
        state.status === 'signed-in' ? state.accessToken : null
      );
      if (this.activeTab === 'duel' || this.activeTab === 'about') this.renderPanel();
    });
    void this.authClient.start();
    this.settingsStore.subscribe(settings => {
      const tabChanged = this.activeTab !== settings.panelTab;
      this.settings = settings;
      this.activeTab = settings.panelTab;
      this.renderVisibility();
      this.renderBoardPosition();
      this.renderBoard();
      if (tabChanged) this.renderPanel();
    });
    this.matchStore.subscribeState(state => {
      this.matchState = state;
      this.persistMatch();
      this.renderVisibility();
      this.renderBoard();
      if (this.activeTab === 'duel' || this.activeTab === 'match') this.renderPanel();
    });
    this.options.challengeEngine.subscribe(event => this.handleChallengeEngineEvent(event));
    this.options.subscribeTelemetry(event => {
      void this.telemetryGateway.observe(event);
    });

    this.ensureMounted();
    this.mountGuard = window.setInterval(() => this.ensureMounted(), 700);

    const api: ProductPublicApi = {
      version: '0.37.2',
      coreVersion: PRODUCT_CORE_VERSION,
      gatewayContractVersion: GATEWAY_CONTRACT_VERSION,
      gatewayClientVersion: GATEWAY_CLIENT_VERSION,
      authClientVersion: AUTH_CLIENT_VERSION,
      auth: {
        getState: () => this.authClient.getState(),
        subscribe: listener => this.authClient.subscribe(listener),
        signInWithDiscord: () => this.authClient.signInWithDiscord(),
        signOut: () => this.authClient.signOut(),
        getAccessToken: () => this.authClient.getAccessToken()
      },
      gateway: {
        getState: () => this.gatewayClient.getState(),
        subscribe: listener => this.gatewayClient.subscribe(listener),
        reconnect: () => this.gatewayClient.reconnect()
      },
      manifest: {
        get: () => structuredClone(this.manifest),
        list: () => structuredClone(this.manifest.entries)
      },
      draft: {
        generate: request => this.generateBoard(request),
        validate: board => validateDraftBoard(board, this.manifest, {
          available: ALL_CAPABILITIES
        }),
        getCurrent: () => this.currentBoard ? structuredClone(this.currentBoard) : null
      },
      match: {
        getState: () => this.matchStore.getState(),
        subscribe: listener => this.matchStore.subscribeState(listener),
        startDemo: format => this.startDemoMatch(format ?? 'ranked'),
        reset: () => this.resetMatch(),
        receiveOpponentCompletion: (challengeId, claimId, playerName) =>
          this.receiveOpponentCompletion(
            challengeId,
            claimId ?? `remote-${Date.now()}-${challengeId}`,
            playerName ?? 'Player 1'
          ),
        finish: winner => this.matchStore.finishMatch(winner),
        canSendTelemetry: () => this.matchStore.canForwardTelemetry(),
        getTelemetryStats: () => this.telemetryGateway.getStats(),
        setTelemetryTransport: transport => this.telemetryGateway.setTransport(transport)
      },
      settings: {
        get: () => this.settingsStore.get(),
        update: update => this.settingsStore.update(update),
        updateBoard: update => this.settingsStore.updateBoard(update),
        reset: () => this.settingsStore.reset()
      },
      ui: {
        open: tab => this.openPanel(tab),
        close: () => this.closePanel(),
        toggle: () => this.togglePanel(),
        remount: () => this.ensureMounted()
      },
      chat: {
        insertCompletion: message => this.chatAdapter.insert(message),
        getMessages: () => structuredClone(this.duelChatMessages)
      }
    };
    window.skribblDuelsProduct = api;
    return api;
  }

  private ensureMounted(): void {
    const target = document.body ?? document.documentElement;
    if (!target) return;
    let mounted = false;
    if (!this.launcher) { this.launcher = this.createLauncher(); mounted = true; }
    if (!this.panel) { this.panel = this.createPanel(); mounted = true; }
    if (!this.board) { this.board = this.createBoard(); mounted = true; }
    if (!this.launcher.isConnected) { target.appendChild(this.launcher); mounted = true; }
    if (!this.panel.isConnected) { target.appendChild(this.panel); mounted = true; }
    if (!this.board.isConnected) { target.appendChild(this.board); mounted = true; }
    if (!mounted) return;
    this.renderVisibility();
    this.renderBoardPosition();
    this.renderPanel();
    this.renderBoard();
  }

  private createLauncher(): HTMLButtonElement {
    const launcher = element('button') as HTMLButtonElement;
    launcher.id = 'skribbl-duels-launcher';
    launcher.type = 'button';
    launcher.textContent = 'SD';
    launcher.style.cssText = [
      'position:fixed',
      'right:12px',
      'top:50%',
      'transform:translateY(-50%)',
      'z-index:2147483644',
      'width:44px',
      'height:44px',
      'border-radius:50%',
      'border:2px solid rgba(255,255,255,.3)',
      'background:linear-gradient(135deg,#6978ff,#9e65ff)',
      'color:white',
      'font-weight:900',
      'cursor:pointer',
      'box-shadow:0 5px 20px rgba(0,0,0,.35)'
    ].join(';');
    launcher.addEventListener('click', () => this.togglePanel());
    this.tooltips.register(launcher, 'Open Skribbl Duels', 'X');
    return launcher;
  }

  private createPanel(): HTMLDivElement {
    const panel = element('div');
    panel.id = 'skribbl-duels-panel';
    panel.style.cssText = [
      'position:fixed',
      'right:64px',
      'top:50%',
      'transform:translateY(-50%)',
      'z-index:2147483645',
      'width:min(440px,calc(100vw - 90px))',
      'max-height:min(720px,calc(100vh - 24px))',
      'overflow:hidden',
      'background:var(--SCD_PANEL_BG)',
      'border:1px solid var(--SCD_PANEL_BORDER)',
      'border-radius:12px',
      'box-shadow:0 15px 50px rgba(0,0,0,.5)',
      'color:white'
    ].join(';');

    const header = element('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px;border-bottom:1px solid rgba(255,255,255,.12)';
    const title = element('strong', '', 'Skribbl Duels');
    title.style.cssText = 'font-size:16px;flex:1';
    const version = element('span', 'scd-muted', 'Gateway Connected 0.37.2');
    version.style.fontSize = '10px';
    const close = element('button', 'scd-button', '×') as HTMLButtonElement;
    close.type = 'button';
    close.style.padding = '3px 8px';
    close.addEventListener('click', () => this.closePanel());
    this.tooltips.register(close, 'Close Skribbl Duels', 'Y');
    header.append(title, version, close);

    const tabs = element('div');
    tabs.style.cssText = 'display:flex;gap:4px;padding:8px;border-bottom:1px solid rgba(255,255,255,.1);overflow:auto';
    const labels: Array<[ProductUiSettings['panelTab'], string]> = [
      ['duel', 'Duel'],
      ['match', 'Match'],
      ['chat', 'Chat'],
      ['settings', 'Settings'],
      ['about', 'About']
    ];
    for (const [id, label] of labels) {
      const tab = element('button', 'scd-button scd-tab', label) as HTMLButtonElement;
      tab.type = 'button';
      tab.dataset.tab = id;
      tab.addEventListener('click', () => this.openPanel(id));
      this.tooltips.register(tab, `Open ${label} tab`, 'Y');
      tabs.appendChild(tab);
    }

    this.panelBody = element('div');
    this.panelBody.style.cssText = 'padding:10px;overflow:auto;max-height:600px';
    panel.append(header, tabs, this.panelBody);
    return panel;
  }

  private createBoard(): HTMLDivElement {
    const board = element('div');
    board.id = 'skribbl-duels-board';
    board.style.cssText = [
      'position:fixed',
      'z-index:2147483643',
      'width:330px',
      'background:var(--SCD_PANEL_BG)',
      'border:1px solid var(--SCD_PANEL_BORDER)',
      'border-radius:10px',
      'box-shadow:0 10px 34px rgba(0,0,0,.4)',
      'color:white',
      'transform-origin:top right',
      'overflow:hidden',
      'pointer-events:none'
    ].join(';');

    const header = element('div');
    header.style.cssText = 'display:flex;align-items:center;gap:6px;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.1)';
    const title = element('strong', '', 'Challenge Board');
    title.style.cssText = 'font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const score = element('span', 'scd-muted');
    score.dataset.role = 'score';
    score.style.fontSize = '10px';
    header.append(title, score);

    this.boardGrid = element('div');
    this.boardGrid.dataset.role = 'grid';
    this.boardGrid.style.cssText = 'display:grid;gap:4px;padding:7px';
    board.append(header, this.boardGrid);
    return board;
  }

  private renderVisibility(): void {
    if (this.panel) this.panel.style.display = this.settings.panelOpen ? 'block' : 'none';
    if (this.board) {
      const hasMatchBoard = this.matchState.phase !== 'idle' && this.matchState.fields.length > 0;
      this.board.style.display = this.settings.board.visible && hasMatchBoard ? 'block' : 'none';
    }
  }

  private renderBoardPosition(): void {
    if (!this.board) return;
    const settings = this.settings.board;
    this.board.style.opacity = String(settings.opacity);
    this.board.style.pointerEvents = 'none';
    this.board.style.left = '';
    this.board.style.right = '';
    this.board.style.top = '';
    this.board.style.bottom = '';
    this.board.style.transformOrigin = 'center center';

    let transform = `scale(${settings.scale})`;
    if (settings.mode === 'custom') {
      this.board.style.left = `${settings.x}px`;
      this.board.style.top = `${settings.y}px`;
      this.board.style.transformOrigin = 'top left';
    } else {
      const gap = '14px';
      switch (settings.anchor) {
        case 'top-left':
          this.board.style.left = gap;
          this.board.style.top = '72px';
          this.board.style.transformOrigin = 'top left';
          break;
        case 'top-center':
          this.board.style.left = '50%';
          this.board.style.top = '72px';
          transform = `translateX(-50%) scale(${settings.scale})`;
          this.board.style.transformOrigin = 'top center';
          break;
        case 'top-right':
          this.board.style.right = '68px';
          this.board.style.top = '72px';
          this.board.style.transformOrigin = 'top right';
          break;
        case 'center-left':
          this.board.style.left = gap;
          this.board.style.top = '50%';
          transform = `translateY(-50%) scale(${settings.scale})`;
          this.board.style.transformOrigin = 'center left';
          break;
        case 'center-right':
          this.board.style.right = '68px';
          this.board.style.top = '50%';
          transform = `translateY(-50%) scale(${settings.scale})`;
          this.board.style.transformOrigin = 'center right';
          break;
        case 'bottom-left':
          this.board.style.left = gap;
          this.board.style.bottom = gap;
          this.board.style.transformOrigin = 'bottom left';
          break;
        case 'bottom-center':
          this.board.style.left = '50%';
          this.board.style.bottom = gap;
          transform = `translateX(-50%) scale(${settings.scale})`;
          this.board.style.transformOrigin = 'bottom center';
          break;
        case 'bottom-right':
          this.board.style.right = '68px';
          this.board.style.bottom = gap;
          this.board.style.transformOrigin = 'bottom right';
          break;
      }
    }
    this.board.style.transform = transform;
    const grid = this.board.querySelector<HTMLElement>('[data-role="grid"]');
    if (grid) grid.style.display = settings.collapsed ? 'none' : 'grid';
  }

  private renderBoard(): void {
    if (!this.boardGrid || !this.board) return;
    const fields = this.matchState.fields;
    const columns = this.matchState.format === 'casual' ? 3 : 5;
    this.boardGrid.style.gridTemplateColumns = `repeat(${columns},minmax(0,1fr))`;
    this.boardGrid.replaceChildren();

    if (fields.length === 0) {
      const empty = element('div', 'scd-muted', 'No active match. Open Skribbl Duels to generate a board.');
      empty.style.cssText = 'grid-column:1/-1;padding:15px;text-align:center;font-size:11px';
      this.boardGrid.appendChild(empty);
    } else {
      for (const field of fields) {
        const node = element('div', 'scd-field');
        this.tooltips.register(node, `${challengeName(this.manifest, field.challengeId)}\n${field.challengeId}`);
        if (field.status === 'pending') node.classList.add('pending');
        if (field.status === 'claimed' && field.owner) node.classList.add(field.owner);
        const index = element('span', 'scd-field-index', String(field.fieldIndex + 1));
        node.appendChild(index);
        if (this.settings.board.showNames) {
          node.appendChild(element('span', 'scd-field-name', challengeName(this.manifest, field.challengeId)));
        }
        this.boardGrid.appendChild(node);
      }
    }

    const score = this.board.querySelector<HTMLElement>('[data-role="score"]');
    if (score) {
      score.textContent = this.matchState.phase === 'finished'
        ? `${this.matchState.scores.self}:${this.matchState.scores.opponent} · frozen`
        : `${this.matchState.scores.self}:${this.matchState.scores.opponent} · first to ${this.matchState.winTarget || '-'}`;
    }
  }

  private renderPanel(): void {
    if (!this.panel || !this.panelBody) return;
    for (const tab of this.panel.querySelectorAll<HTMLElement>('.scd-tab')) {
      tab.classList.toggle('active', tab.dataset.tab === this.activeTab);
    }
    this.panelBody.replaceChildren();
    switch (this.activeTab) {
      case 'duel': this.renderDuelTab(); break;
      case 'match': this.renderMatchTab(); break;
      case 'chat': this.renderChatTab(); break;
      case 'settings': this.renderSettingsTab(); break;
      case 'about': this.renderAboutTab(); break;
    }
  }

  private renderDuelTab(): void {
    if (!this.panelBody) return;
    const stack = element('div', 'scd-stack');
    const intro = element('div', 'scd-card');
    intro.append(
      element('strong', '', 'Product Foundation'),
      element('p', 'scd-muted', 'The challenge pool is frozen at 46 for this phase. Boards are generated from a versioned manifest and validated before match start.')
    );

    const account = element('div', 'scd-card scd-stack');
    account.appendChild(element('strong', '', 'Skribbl Duels account'));
    if (this.authState.status === 'signed-in' && this.authState.profile) {
      const profile = element('div', 'scd-auth-profile');
      if (this.authState.profile.avatarUrl) {
        const avatar = element('img', 'scd-auth-avatar') as HTMLImageElement;
        avatar.src = this.authState.profile.avatarUrl;
        avatar.alt = '';
        avatar.referrerPolicy = 'no-referrer';
        profile.appendChild(avatar);
      } else {
        const fallback = element('div', 'scd-auth-avatar', this.authState.profile.displayName.slice(0, 1).toUpperCase());
        fallback.style.cssText += ';display:grid;place-items:center;font-weight:900';
        profile.appendChild(fallback);
      }
      const copy = element('div', 'scd-auth-copy');
      copy.append(
        element('div', 'scd-auth-name', this.authState.profile.displayName),
        element('div', 'scd-auth-email', this.authState.profile.email ?? `Discord: ${this.authState.profile.username}`)
      );
      const signOut = element('button', 'scd-button', 'Sign out') as HTMLButtonElement;
      signOut.type = 'button';
      signOut.addEventListener('click', () => {
        signOut.disabled = true;
        void this.authClient.signOut().catch(error => console.error('[Skribbl Duels Auth] Sign out failed', error));
      });
      this.tooltips.register(signOut, 'Sign out of the current Skribbl Duels account');
      profile.append(copy, signOut);
      account.appendChild(profile);
    } else {
      const statusText = this.authState.status === 'initializing'
        ? 'Checking Discord session…'
        : 'Sign in with Discord to create or restore your Skribbl Duels account.';
      account.appendChild(element('div', 'scd-muted', statusText));
      if (this.authState.error) account.appendChild(element('div', 'scd-auth-error', this.authState.error));
      const signIn = element('button', 'scd-button primary', 'Sign in with Discord') as HTMLButtonElement;
      signIn.type = 'button';
      signIn.disabled = this.authState.status === 'initializing';
      signIn.addEventListener('click', () => {
        signIn.disabled = true;
        void this.authClient.signInWithDiscord().catch(error => {
          signIn.disabled = false;
          console.error('[Skribbl Duels Auth] Discord login failed', error);
        });
      });
      this.tooltips.register(signIn, 'Open Discord authorization and return to skribbl.io');
      account.appendChild(signIn);
      account.appendChild(element('div', 'scd-muted', 'Development flow: Discord redirects back to https://skribbl.io/. Your Supabase Redirect URLs must allow that exact URL.'));
    }

    const gatewayConnection = element('div', 'scd-card scd-stack');
    gatewayConnection.appendChild(element('strong', '', 'Authenticated Gateway'));
    const gatewayCopy = this.gatewayState.status === 'not-configured'
      ? 'Server code is ready, but this userscript does not contain a public Gateway URL yet.'
      : this.gatewayState.status === 'signed-out'
        ? 'Sign in with Discord before connecting to the Gateway.'
        : this.gatewayState.status === 'connecting'
          ? 'Verifying the Supabase session and loading your server profile…'
          : this.gatewayState.status === 'connected'
            ? `Connected as ${this.gatewayState.identity?.displayName ?? 'Discord user'} · ${this.gatewayState.connectionId?.slice(0, 8) ?? '-'}`
            : 'The Gateway connection could not be established.';
    gatewayConnection.appendChild(element('div', 'scd-muted', gatewayCopy));
    if (this.gatewayState.error) {
      gatewayConnection.appendChild(element('div', 'scd-auth-error', this.gatewayState.error));
    }
    if (this.gatewayState.endpoint && this.authState.status === 'signed-in') {
      const reconnect = element('button', 'scd-button', 'Reconnect Gateway') as HTMLButtonElement;
      reconnect.type = 'button';
      reconnect.disabled = this.gatewayState.status === 'connecting';
      reconnect.addEventListener('click', () => this.gatewayClient.reconnect());
      this.tooltips.register(reconnect, 'Start a fresh authenticated Gateway connection');
      gatewayConnection.appendChild(reconnect);
    }

    const actions = element('div', 'scd-card scd-stack');
    actions.appendChild(element('strong', '', 'Development board'));
    const row = element('div', 'scd-row');
    const casual = element('button', 'scd-button', 'Generate 3×3') as HTMLButtonElement;
    const ranked = element('button', 'scd-button primary', 'Generate 5×5') as HTMLButtonElement;
    casual.addEventListener('click', () => this.startDemoMatch('casual'));
    ranked.addEventListener('click', () => this.startDemoMatch('ranked'));
    this.tooltips.register(casual, 'Generate and start a casual 3×3 development match');
    this.tooltips.register(ranked, 'Generate and start a ranked 5×5 development match');
    row.append(casual, ranked);
    actions.appendChild(row);

    const compatibility = element('div', 'scd-card');
    compatibility.append(
      element('strong', '', 'Draft compatibility'),
      element('p', 'scd-muted', 'Blind Guess and Drunk Vision share the conflict key “primary-visual-obstruction” and can never appear together. Deaf Guess may appear with either one.')
    );

    stack.append(account, gatewayConnection, intro, actions, compatibility);
    this.panelBody.appendChild(stack);
  }

  private renderMatchTab(): void {
    if (!this.panelBody) return;
    const stack = element('div', 'scd-stack');
    const status = element('div', 'scd-card scd-stack');
    status.append(
      element('strong', '', `Status: ${this.matchState.phase}`),
      element('div', '', `Alpha ${this.matchState.scores.self} / ${this.matchState.winTarget || '-'} · Player 1 ${this.matchState.scores.opponent} / ${this.matchState.winTarget || '-'}`),
      element('div', 'scd-muted', this.matchState.freeze.frozen
        ? 'Match frozen. Skribbl continues normally; Duel telemetry is no longer forwarded.'
        : 'Duel telemetry forwarding is available while the match is running.')
    );

    const telemetry = this.telemetryGateway.getStats();
    const gateway = element('div', 'scd-card scd-stack');
    gateway.append(
      element('strong', '', 'Telemetry gateway'),
      element('div', 'scd-muted', `Connection: ${this.gatewayState.status} · Local: ${telemetry.locallyObserved} · Forwarded: ${telemetry.forwarded} · Suppressed after freeze: ${telemetry.suppressedAfterFreeze}`)
    );

    const controls = element('div', 'scd-card scd-row');
    const selfClaim = element('button', 'scd-button', 'Claim next for Alpha') as HTMLButtonElement;
    selfClaim.addEventListener('click', () => this.demoClaim('self'));
    const opponentClaim = element('button', 'scd-button', 'Claim next for Player 1') as HTMLButtonElement;
    opponentClaim.addEventListener('click', () => this.demoClaim('opponent'));
    this.tooltips.register(selfClaim, 'Development only: confirm the next free field for yourself');
    this.tooltips.register(opponentClaim, 'Development only: confirm the next free field for the opponent');
    const reset = element('button', 'scd-button danger', 'Reset match') as HTMLButtonElement;
    reset.addEventListener('click', () => this.resetMatch());
    this.tooltips.register(reset, 'Clear the current local match and hide the board');
    controls.append(selfClaim, opponentClaim, reset);

    stack.append(status, gateway, controls);
    this.panelBody.appendChild(stack);
  }

  private renderChatTab(): void {
    if (!this.panelBody) return;
    const stack = element('div', 'scd-stack');
    const log = element('div', 'scd-card scd-stack');
    log.style.maxHeight = '330px';
    log.style.overflow = 'auto';
    if (this.duelChatMessages.length === 0) {
      log.appendChild(element('div', 'scd-muted', 'Development placeholder for the private Duel channel. It does not use the Skribbl game chat.'));
    } else {
      for (const message of this.duelChatMessages) {
        const line = element('div');
        const author = element('strong', '', `${message.author} `);
        author.style.color = message.side === 'self' ? 'var(--SCD_SELF)' : 'var(--SCD_OPPONENT)';
        line.append(author, document.createTextNode(message.message), element('small', 'scd-muted', ` · ${formatTime(message.occurredAt)}`));
        log.appendChild(line);
      }
    }

    const form = element('form', 'scd-row');
    const input = element('input') as HTMLInputElement;
    input.placeholder = 'Local development message…';
    input.maxLength = 300;
    input.style.cssText = 'flex:1;min-width:0;border:1px solid rgba(255,255,255,.18);border-radius:7px;background:rgba(0,0,0,.25);color:white;padding:8px';
    const send = element('button', 'scd-button primary', 'Send') as HTMLButtonElement;
    send.type = 'submit';
    this.tooltips.register(send, 'Send a private Duel message once the gateway is connected');
    form.append(input, send);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const message = input.value.trim();
      if (!message) return;
      this.duelChatMessages.push({
        id: `local-chat-${Date.now()}`,
        side: 'self',
        author: this.options.getSelfName(),
        message,
        occurredAt: Date.now()
      });
      input.value = '';
      this.renderPanel();
    });

    stack.append(log, form);
    this.panelBody.appendChild(stack);
  }

  private renderSettingsTab(): void {
    if (!this.panelBody) return;
    const stack = element('div', 'scd-stack');
    const board = element('div', 'scd-card scd-stack');
    board.appendChild(element('strong', '', 'Challenge board'));

    const visible = this.checkbox('Show board during a match', this.settings.board.visible, checked =>
      this.settingsStore.updateBoard({ visible: checked }));
    const collapsed = this.checkbox('Collapse board fields', this.settings.board.collapsed, checked =>
      this.settingsStore.updateBoard({ collapsed: checked }));
    const names = this.checkbox('Show field names', this.settings.board.showNames, checked =>
      this.settingsStore.updateBoard({ showNames: checked }));
    board.append(visible, collapsed, names);

    const anchorLabel = element('label', 'scd-label');
    anchorLabel.appendChild(element('span', '', 'Position mode'));
    const mode = element('select') as HTMLSelectElement;
    mode.style.cssText = 'background:#222631;color:white;border:1px solid rgba(255,255,255,.18);padding:6px;border-radius:6px';
    for (const [value, label] of [['anchor', 'Screen anchor'], ['custom', 'Custom coordinates']] as const) {
      const option = element('option') as HTMLOptionElement;
      option.value = value;
      option.textContent = label;
      option.selected = this.settings.board.mode === value;
      mode.appendChild(option);
    }
    mode.addEventListener('change', () => {
      this.settingsStore.updateBoard({ mode: mode.value === 'custom' ? 'custom' : 'anchor' });
      this.renderPanel();
    });
    this.tooltips.register(mode, 'Choose a fixed screen anchor or position the board with X/Y controls');
    anchorLabel.appendChild(mode);
    board.appendChild(anchorLabel);

    const anchorSelect = element('label', 'scd-label');
    anchorSelect.appendChild(element('span', '', 'Anchor'));
    const select = element('select') as HTMLSelectElement;
    select.style.cssText = mode.style.cssText;
    const anchors: ProductUiSettings['board']['anchor'][] = [
      'top-left', 'top-center', 'top-right', 'center-left',
      'center-right', 'bottom-left', 'bottom-center', 'bottom-right'
    ];
    for (const anchor of anchors) {
      const option = element('option') as HTMLOptionElement;
      option.value = anchor;
      option.textContent = anchor.replaceAll('-', ' ');
      option.selected = this.settings.board.anchor === anchor;
      select.appendChild(option);
    }
    select.disabled = this.settings.board.mode !== 'anchor';
    select.addEventListener('change', () => this.settingsStore.updateBoard({ anchor: select.value as ProductUiSettings['board']['anchor'] }));
    this.tooltips.register(select, 'Anchor the board to this part of the viewport');
    anchorSelect.appendChild(select);
    board.appendChild(anchorSelect);

    if (this.settings.board.mode === 'custom') {
      board.append(
        this.pixelRange('Horizontal position', this.settings.board.x, 0, Math.max(0, window.innerWidth - 80), value => this.settingsStore.updateBoard({ x: value })),
        this.pixelRange('Vertical position', this.settings.board.y, 0, Math.max(0, window.innerHeight - 80), value => this.settingsStore.updateBoard({ y: value }))
      );
    }

    board.append(
      this.range('Scale', this.settings.board.scale, 0.5, 1.6, 0.05, value => this.settingsStore.updateBoard({ scale: value })),
      this.range('Opacity', this.settings.board.opacity, 0.35, 1, 0.05, value => this.settingsStore.updateBoard({ opacity: value }))
    );

    const resetBoard = element('button', 'scd-button', 'Reset UI settings') as HTMLButtonElement;
    resetBoard.addEventListener('click', () => {
      this.settingsStore.reset();
      this.renderPanel();
    });
    this.tooltips.register(resetBoard, 'Restore the default panel and board settings');
    board.appendChild(resetBoard);

    const chat = element('div', 'scd-card scd-stack');
    chat.append(
      element('strong', '', 'Game-chat integration'),
      this.checkbox('Show confirmed completion messages', this.settings.completionMessages, checked =>
        this.settingsStore.update({ completionMessages: checked }))
    );

    stack.append(board, chat);
    this.panelBody.appendChild(stack);
  }

  private renderAboutTab(): void {
    if (!this.panelBody) return;
    const stack = element('div', 'scd-stack');
    const architecture = element('div', 'scd-card');
    architecture.append(
      element('strong', '', 'Current phase'),
      element('p', 'scd-muted', 'Challenge Manifest v1 → Draft Constraint Engine → Match State Contract → Gateway Contract v1 → UI Settings and overlays.'),
      element('p', 'scd-muted', `${this.manifest.entries.length} versioned challenges are available. Later additions remain compatible because boards store challenge ID and definition version snapshots.`)
    );
    const authentication = element('div', 'scd-card');
    authentication.append(
      element('strong', '', `Authentication v${AUTH_CLIENT_VERSION}`),
      element('p', 'scd-muted', this.authState.status === 'signed-in'
        ? `Signed in as ${this.authState.profile?.displayName ?? 'Discord user'}. The access token is supplied only to the authenticated Socket.IO handshake.`
        : 'Supabase Discord OAuth is connected on the client. A signed-in session is required for the Gateway.')
    );
    const freeze = element('div', 'scd-card');
    freeze.append(
      element('strong', '', 'What match freeze means'),
      element('p', 'scd-muted', 'The normal Skribbl lobby and local telemetry continue. Only Duel-server forwarding, board mutation and new claims are stopped after the win target is reached.')
    );
    const gateway = element('div', 'scd-card');
    gateway.append(
      element('strong', '', `Gateway Contract v${GATEWAY_CONTRACT_VERSION}`),
      element('p', 'scd-muted', `Client v${GATEWAY_CLIENT_VERSION} status: ${this.gatewayState.status}. Token verification, RLS profile lookup and WELCOME are implemented; matchmaking remains intentionally disabled.`)
    );
    stack.append(architecture, authentication, freeze, gateway);
    this.panelBody.appendChild(stack);
  }

  private checkbox(labelText: string, checked: boolean, onChange: (checked: boolean) => void): HTMLLabelElement {
    const label = element('label', 'scd-label');
    const text = element('span', '', labelText);
    const input = element('input') as HTMLInputElement;
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    label.append(text, input);
    return label;
  }

  private range(
    labelText: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void
  ): HTMLLabelElement {
    const label = element('label', 'scd-label');
    const text = element('span', '', `${labelText}: ${Math.round(value * 100)}%`);
    const input = element('input') as HTMLInputElement;
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => {
      const next = Number(input.value);
      text.textContent = `${labelText}: ${Math.round(next * 100)}%`;
      onChange(next);
    });
    label.append(text, input);
    return label;
  }

  private pixelRange(
    labelText: string,
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void
  ): HTMLLabelElement {
    const label = element('label', 'scd-label');
    const text = element('span', '', `${labelText}: ${Math.round(value)}px`);
    const input = element('input') as HTMLInputElement;
    input.type = 'range';
    input.min = String(min);
    input.max = String(Math.max(min, max));
    input.step = '1';
    input.value = String(Math.max(min, Math.min(max, value)));
    input.addEventListener('input', () => {
      const next = Number(input.value);
      text.textContent = `${labelText}: ${Math.round(next)}px`;
      onChange(next);
    });
    label.append(text, input);
    return label;
  }

  private loadPersistedMatch(): PersistedProductMatch | null {
    try {
      const raw = sessionStorage.getItem(this.matchStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PersistedProductMatch>;
      if (parsed.version !== 1 || !parsed.state) return null;
      return {
        version: 1,
        state: parsed.state,
        board: parsed.board && typeof parsed.board === 'object' ? parsed.board as DraftBoard : null
      };
    } catch {
      return null;
    }
  }

  private persistMatch(): void {
    try {
      if (this.matchState.phase === 'idle' && this.matchState.fields.length === 0) {
        sessionStorage.removeItem(this.matchStorageKey);
        return;
      }
      const value: PersistedProductMatch = {
        version: 1,
        state: this.matchState,
        board: this.currentBoard
      };
      sessionStorage.setItem(this.matchStorageKey, JSON.stringify(value));
    } catch (error) {
      console.warn('[Skribbl Duels Match Persistence] Persist failed', error);
    }
  }

  private resetMatch(): MatchState {
    this.currentBoard = null;
    try { sessionStorage.removeItem(this.matchStorageKey); } catch {}
    return this.matchStore.reset();
  }

  private openPanel(tab?: ProductUiSettings['panelTab']): void {
    this.settingsStore.update({
      panelOpen: true,
      panelTab: tab ?? this.activeTab
    });
  }

  private closePanel(): void {
    this.settingsStore.update({ panelOpen: false });
  }

  private togglePanel(): void {
    this.settingsStore.update({ panelOpen: !this.settings.panelOpen });
  }

  private generateBoard(request: DraftRequest): DraftResult {
    const result = generateDraftBoard(this.manifest, {
      ...request,
      capabilities: request.capabilities ?? { available: ALL_CAPABILITIES }
    });
    if (result.board) this.currentBoard = result.board;
    return result;
  }

  private startDemoMatch(format: 'casual' | 'ranked'): MatchState {
    const result = this.generateBoard({ format });
    if (!result.board) {
      throw new Error(result.issues.map(issue => issue.message).join('\n'));
    }
    const participants: DuelParticipant[] = [
      { playerId: 'self', displayName: this.options.getSelfName(), side: 'self' },
      { playerId: 'opponent', displayName: 'Player 1', side: 'opponent' }
    ];
    const state = this.matchStore.startMatch(`demo-${Date.now()}`, result.board, participants);
    this.settingsStore.updateBoard({ visible: true });
    this.openPanel('match');
    return state;
  }

  private demoClaim(side: DuelPlayerSide): void {
    if (this.matchState.phase !== 'running') return;
    const field = this.matchState.fields.find(item => item.status === 'available');
    if (!field) return;
    const claimId = `demo-${side}-${Date.now()}-${field.challengeId}`;
    this.matchStore.markPending(field.challengeId, `${claimId}-candidate`, side);
    this.matchStore.confirmClaim(field.challengeId, claimId, side);
    this.insertCompletion({
      claimId,
      side,
      playerName: side === 'self' ? this.options.getSelfName() : 'Player 1',
      challengeId: field.challengeId,
      challengeName: challengeName(this.manifest, field.challengeId),
      occurredAt: Date.now()
    });
  }

  private receiveOpponentCompletion(
    challengeId: string,
    claimId: string,
    playerName: string
  ): MatchState {
    this.matchStore.markPending(challengeId, `${claimId}-candidate`, 'opponent');
    const state = this.matchStore.confirmClaim(challengeId, claimId, 'opponent');
    this.insertCompletion({
      claimId,
      side: 'opponent',
      playerName,
      challengeId,
      challengeName: challengeName(this.manifest, challengeId),
      occurredAt: Date.now()
    });
    return state;
  }

  private handleChallengeEngineEvent(event: ChallengeEngineEvent): void {
    const runtime = event.runtime;
    if (!runtime || this.matchState.phase !== 'running') return;
    const onBoard = this.matchState.fields.some(field => field.challengeId === runtime.challengeId);
    if (!onBoard) return;

    if (event.type === 'CHALLENGE_COMPLETION_CANDIDATE' && runtime.completionCandidate) {
      this.matchStore.markPending(
        runtime.challengeId,
        runtime.completionCandidate.candidateId,
        'self',
        event.occurredAt
      );
      return;
    }

    if (event.type === 'CHALLENGE_CLAIMED' && runtime.claimId) {
      this.matchStore.confirmClaim(runtime.challengeId, runtime.claimId, 'self', event.occurredAt);
      this.insertCompletion({
        claimId: runtime.claimId,
        side: 'self',
        playerName: this.options.getSelfName(),
        challengeId: runtime.challengeId,
        challengeName: challengeName(this.manifest, runtime.challengeId),
        occurredAt: event.occurredAt
      });
      return;
    }

    if (event.type === 'CHALLENGE_LOST' || event.type === 'CHALLENGE_REOPENED') {
      this.matchStore.rejectPending(runtime.challengeId, event.reason ?? 'claim-not-accepted', event.occurredAt);
    }
  }

  private insertCompletion(message: CompletionMessage): void {
    this.chatAdapter.insert(message);
    this.duelChatMessages.push({
      id: `completion-${message.claimId}`,
      side: message.side,
      author: message.playerName,
      message: `completed '${message.challengeName}'`,
      occurredAt: message.occurredAt
    });
    if (this.activeTab === 'chat') this.renderPanel();
  }
}
