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
  type GatewayClientCapability,
  type GatewayClaimResolutionMessage,
  type GatewayDraftState,
  type GatewayInviteStatusMessage,
  type GatewayMatchmakingParticipant
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
  validateDuelDisplayName,
  type AuthSnapshot
} from '@skribbl-duels/auth-client';
import {
  CHALLENGE_ICON_ASSET_PATHS,
  EMBEDDED_ICON_ASSETS
} from './generatedIconAssets';
import { bindReliableButtonAction } from './reliableButtonAction';

interface ProductFoundationOptions {
  runtimeId: string;
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

interface WinMessage {
  matchId: string;
  playerName: string;
  elapsedMs: number;
}

interface DuelChatMessage {
  id: string;
  side: DuelPlayerSide | 'system';
  author: string;
  message: string;
  occurredAt: number;
}

interface PersistedProductMatch {
  version: 2;
  state: MatchState;
  board: DraftBoard | null;
}

type UiLanguage = 'de' | 'en';

interface Point3d {
  x: number;
  y: number;
  z: number;
}

interface IntroOrbitDefinition {
  radiusX: number;
  radiusY: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  speed: number;
  iconCount: 6 | 7;
}

const ISOLATED_POINTER_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'touchstart',
  'touchend',
  'click',
  'dblclick',
  'contextmenu',
  'wheel'
] as const;

const PROFILE_COPY = {
  en: {
    duelProfile: 'Duel profile',
    displayName: 'Duel display name',
    preferredLanguage: 'Preferred language',
    versusAvatar: 'Versus avatar',
    discordAvatar: 'Discord profile image',
    skribblAvatar: 'Current Skribbl avatar',
    save: 'Save profile',
    saving: 'Saving profile…',
    saved: 'Profile saved. Reconnecting authoritative profile…',
    specialControlled: 'Special avatar parts remain server-controlled.',
    specialEntitlement: 'Special avatar entitlement',
    invisibleEntitlement: 'Invisible avatar entitlement',
    invisibleNotEntitled: 'This profile is not entitled to invisible avatar parts.',
    nameTooShort: 'Duel display name must contain at least 3 characters.',
    nameTooLong: 'Duel display name must contain no more than 24 characters.',
    nameAsciiOnly: 'Only A-Z, a-z and 0-9 are allowed.',
    nameTaken: 'This Duel display name is already taken.'
  },
  de: {
    duelProfile: 'Duel-Profil',
    displayName: 'Duel-Anzeigename',
    preferredLanguage: 'Bevorzugte Sprache',
    versusAvatar: 'Versus-Avatar',
    discordAvatar: 'Discord-Profilbild',
    skribblAvatar: 'Aktueller Skribbl-Avatar',
    save: 'Profil speichern',
    saving: 'Profil wird gespeichert…',
    saved: 'Profil gespeichert. Autoritatives Profil wird neu verbunden…',
    specialControlled: 'Special-Avatarteile bleiben serverseitig kontrolliert.',
    specialEntitlement: 'Special-Avatar-Berechtigung',
    invisibleEntitlement: 'Unsichtbarer-Avatar-Berechtigung',
    invisibleNotEntitled: 'Dieses Profil ist nicht für unsichtbare Avatarteile berechtigt.',
    nameTooShort: 'Der Duel-Anzeigename muss mindestens 3 Zeichen lang sein.',
    nameTooLong: 'Der Duel-Anzeigename darf höchstens 24 Zeichen lang sein.',
    nameAsciiOnly: 'Erlaubt sind nur A–Z, a–z und 0–9.',
    nameTaken: 'Dieser Duel-Anzeigename ist bereits vergeben.'
  }
} as const;

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
    joinMatchmaking(format: 'casual' | 'ranked'): string;
    leaveMatchmaking(): string;
    createInvite(format: 'casual' | 'ranked'): string;
    acceptInvite(token: string): string;
    cancelInvite(inviteId: string): string;
    setReady(matchId: string, ready: boolean): void;
    pickDraftChallenge(matchId: string, challengeId: string, clientRevision: number): void;
    sendDuelChat(matchId: string, message: string): string;
    forfeitMatch(matchId: string): string;
    requestRematch(matchId: string): string;
    proposeDraw(matchId: string): string;
    respondToDraw(matchId: string, proposalId: string, accept: boolean): string;
    withdrawDraw(matchId: string, proposalId: string): string;
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
    finishDraw(): MatchState;
    canSendTelemetry(): boolean;
    getTelemetryStats(): ReturnType<MatchTelemetryGateway['getStats']>;
    setTelemetryTransport(transport: ((envelope: OutboundTelemetryEnvelope) => void | Promise<void>) | null): void;
  };
  settings: {
    get(): ProductUiSettings;
    update(update: Partial<ProductUiSettings>): ProductUiSettings;
    updateBoard(update: Partial<ProductUiSettings['board']>): ProductUiSettings;
    updateLauncher(update: Partial<ProductUiSettings['launcher']>): ProductUiSettings;
    reset(): ProductUiSettings;
  };
  ui: {
    open(tab?: ProductUiSettings['panelTab']): void;
    close(): void;
    toggle(): void;
    remount(): void;
  };
  dispose(reason?: string): void;
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
  if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea') {
    node.style.pointerEvents = 'auto';
    for (const eventName of ISOLATED_POINTER_EVENTS) {
      node.addEventListener(eventName, event => event.stopPropagation());
    }
  }
  return node;
}

function canConsumeWheel(node: Element, deltaY: number): boolean {
  if (!(node instanceof HTMLElement)) return false;
  const overflowY = getComputedStyle(node).overflowY;
  if (overflowY !== 'auto' && overflowY !== 'scroll') return false;
  if (node.scrollHeight <= node.clientHeight) return false;
  return deltaY < 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1;
}

function isolateScrollRoot(root: HTMLElement): void {
  root.style.overscrollBehavior = 'contain';
  root.addEventListener('wheel', event => {
    event.stopPropagation();
    const consumes = event.composedPath().some(target =>
      target instanceof Element && root.contains(target) && canConsumeWheel(target, event.deltaY)
    );
    if (!consumes) event.preventDefault();
  }, { passive: false });
  root.addEventListener('touchmove', event => event.stopPropagation(), { passive: false });
}

function isolatePointerRoot(root: HTMLElement): void {
  for (const eventName of ISOLATED_POINTER_EVENTS) {
    if (eventName === 'wheel') continue;
    root.addEventListener(eventName, event => event.stopPropagation());
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDurationWords(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  if (remainder > 0 || parts.length === 0) parts.push(`${remainder} ${remainder === 1 ? 'second' : 'seconds'}`);
  return parts.length <= 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

function profileLanguage(value: unknown): UiLanguage {
  return value === 'de' ? 'de' : 'en';
}

function displayNameValidationMessage(value: string, language: UiLanguage): string | null {
  const copy = PROFILE_COPY[language];
  switch (validateDuelDisplayName(value)) {
    case 'too-short': return copy.nameTooShort;
    case 'too-long': return copy.nameTooLong;
    case 'non-alphanumeric': return copy.nameAsciiOnly;
    default: return null;
  }
}

function profileUpdateErrorMessage(error: unknown, language: UiLanguage): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/duplicate|unique|already exists/i.test(message)) return PROFILE_COPY[language].nameTaken;
  return message;
}

function degrees(value: number): number {
  return value * Math.PI / 180;
}

function rotatePoint(point: Point3d, definition: IntroOrbitDefinition): Point3d {
  const xAngle = degrees(definition.rotateX);
  const yAngle = degrees(definition.rotateY);
  const zAngle = degrees(definition.rotateZ);
  const afterX = {
    x: point.x,
    y: point.y * Math.cos(xAngle) - point.z * Math.sin(xAngle),
    z: point.y * Math.sin(xAngle) + point.z * Math.cos(xAngle)
  };
  const afterY = {
    x: afterX.x * Math.cos(yAngle) + afterX.z * Math.sin(yAngle),
    y: afterX.y,
    z: -afterX.x * Math.sin(yAngle) + afterX.z * Math.cos(yAngle)
  };
  return {
    x: afterY.x * Math.cos(zAngle) - afterY.y * Math.sin(zAngle),
    y: afterY.x * Math.sin(zAngle) + afterY.y * Math.cos(zAngle),
    z: afterY.z
  };
}

function introOrbitPoint(angle: number, definition: IntroOrbitDefinition): Point3d {
  return rotatePoint({
    x: Math.cos(angle) * definition.radiusX,
    y: Math.sin(angle) * definition.radiusY,
    z: 0
  }, definition);
}

function projectIntroPoint(point: Point3d): Point3d {
  const perspective = 620;
  const perspectiveScale = perspective / (perspective - point.z);
  return {
    x: point.x * perspectiveScale,
    y: point.y * perspectiveScale,
    z: point.z
  };
}

function challengeName(manifest: ChallengeManifestSnapshot, id: string): string {
  return manifest.entries.find(entry => entry.id === id)?.name ?? id;
}

function challengeTooltip(manifest: ChallengeManifestSnapshot, id: string): string {
  const entry = manifest.entries.find(item => item.id === id);
  if (!entry) return id;
  return `${entry.name}\n${entry.description}`;
}

function wrapTooltipText(value: string, width = 50): string {
  return value.split('\n').flatMap(line => {
    const rows: string[] = [];
    let remaining = line;
    while (remaining.length > width) {
      const wordBoundary = remaining.lastIndexOf(' ', width);
      const cutAt = wordBoundary > 0 ? wordBoundary : width;
      rows.push(remaining.slice(0, cutAt));
      remaining = remaining.slice(cutAt).trimStart();
    }
    rows.push(remaining);
    return rows;
  }).join('\n');
}

class CompletionChatAdapter {
  private insertedClaimIds = new Set<string>();
  private pending: CompletionMessage[] = [];
  private pendingWins: WinMessage[] = [];
  private mountGuard: number | null = null;

  public constructor(
    private readonly enabled: () => boolean,
    private readonly runtimeId: string
  ) {}

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

  public insertWin(message: WinMessage): void {
    const messageId = `win:${message.matchId}`;
    if (this.insertedClaimIds.has(messageId)) return;
    this.insertedClaimIds.add(messageId);
    this.pendingWins.push(message);
    queueMicrotask(() => this.flush());
  }

  public reset(): void {
    this.insertedClaimIds.clear();
    this.pending = [];
    this.pendingWins = [];
    document.querySelectorAll('.skribbl-duels-completion').forEach(node => node.remove());
  }

  public stop(): void {
    if (this.mountGuard !== null) window.clearInterval(this.mountGuard);
    this.mountGuard = null;
    this.reset();
  }

  private ensureStyles(): void {
    if (document.getElementById('skribbl-duels-product-styles')) return;
    const style = document.createElement('style');
    style.id = 'skribbl-duels-product-styles';
    style.textContent = `
:root {
  --COLOR_CHAT_BG_LEAVE_ALT: #FFE5C4;
  --COLOR_CHAT_BG_LEAVE_BASE: #FFF4E8;
  --SCD_PANEL_BG: rgba(22, 24, 31, .97);
  --SCD_PANEL_BORDER: rgba(255, 255, 255, .16);
  --SCD_ACCENT: var(--COLOR_PANEL_BUTTON, #2a51d1);
  --SCD_ACCENT_HOVER: var(--COLOR_PANEL_BUTTON_HOVER, #1e44be);
  --SCD_ACCENT_ACTIVE: var(--COLOR_PANEL_BUTTON_ACTIVE, #1d40b4);
  --SCD_SELF: #8ee087;
  --SCD_OPPONENT: #ff9f72;
}
#game-chat .chat-content p.skribbl-duels-completion { padding: 2px 6px; box-sizing: border-box; }
#game-chat .chat-content p.skribbl-duels-completion.own.base { color: var(--COLOR_CHAT_TEXT_GUESSED) !important; background-color: var(--COLOR_CHAT_BG_GUESSED_BASE) !important; }
#game-chat .chat-content p.skribbl-duels-completion.own.alt { color: var(--COLOR_CHAT_TEXT_GUESSED) !important; background-color: var(--COLOR_CHAT_BG_GUESSED_ALT) !important; }
#game-chat .chat-content p.skribbl-duels-completion.opponent.base { color: var(--COLOR_CHAT_TEXT_LEAVE) !important; background-color: var(--COLOR_CHAT_BG_LEAVE_BASE) !important; }
#game-chat .chat-content p.skribbl-duels-completion.opponent.alt { color: var(--COLOR_CHAT_TEXT_LEAVE) !important; background-color: var(--COLOR_CHAT_BG_LEAVE_ALT) !important; }
#game-chat .chat-content p.skribbl-duels-completion.win.base { color: var(--COLOR_CHAT_TEXT_OWNER) !important; background-color: var(--COLOR_CHAT_BG_LEAVE_BASE) !important; }
#game-chat .chat-content p.skribbl-duels-completion.win.alt { color: var(--COLOR_CHAT_TEXT_OWNER) !important; background-color: var(--COLOR_CHAT_BG_LEAVE_ALT) !important; }
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
#skribbl-duels-home-button, #skribbl-duels-launcher, #skribbl-duels-panel, #skribbl-duels-stage, #skribbl-duels-intro, #skribbl-duels-board { box-sizing:border-box; }
#skribbl-duels-home-button *, #skribbl-duels-launcher *, #skribbl-duels-panel *, #skribbl-duels-stage *, #skribbl-duels-intro *, #skribbl-duels-board * { box-sizing:border-box; }
#skribbl-duels-home-button, #skribbl-duels-launcher,
#skribbl-duels-panel button, #skribbl-duels-panel input, #skribbl-duels-panel select, #skribbl-duels-panel textarea,
#skribbl-duels-stage button, #skribbl-duels-stage input, #skribbl-duels-stage select, #skribbl-duels-stage textarea,
#skribbl-duels-intro button, #skribbl-duels-board button { pointer-events:auto; }
.scd-icon { display:block;object-fit:contain;transition:transform .1s ease-in-out; }
.scd-icon:hover, button:not(:disabled):hover .scd-icon { transform:scale(1.1); }
.scd-icon-image { display:block;width:100%;height:100%;object-fit:contain; }
.scd-icon-button { display:grid;place-items:center;border:0;background:transparent;padding:0;cursor:pointer; }
.scd-icon-fallback { display:grid;place-items:center;font-weight:900; }
.button-skribbl-duels { display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:40px;margin-top:10px;border:0;border-radius:var(--BORDER_RADIUS,7px);background:var(--SCD_ACCENT);color:white;font-size:1.2em;font-weight:700;text-shadow:2px 2px 0 #0000002b;transition:background-color 80ms;cursor:pointer; }
.button-skribbl-duels:hover:not(:disabled) { background:var(--SCD_ACCENT_HOVER); }
.button-skribbl-duels:active:not(:disabled) { background:var(--SCD_ACCENT_ACTIVE);padding-top:2px; }
.button-skribbl-duels .scd-icon { width:32px;height:32px; }
.button-skribbl-duels .scd-icon,.scd-ready-state .scd-icon,.scd-ready-action .scd-icon { filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25)); }
#skribbl-duels-launcher { position:fixed;z-index:2147483644;border:0;background:transparent; }
#skribbl-duels-launcher .scd-icon { width:100%;height:100%;filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25)); }
.scd-modal-overlay { position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,.55);animation:scd-modal-opacity .21s ease-in-out; }
.scd-modal-wrapper { width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:12px;pointer-events:none;animation:scd-modal-position .21s ease-in-out; }
.scd-modal-container { width:min(760px,calc(100vw - 24px));max-height:min(760px,calc(100vh - 24px));display:flex;flex-direction:column;overflow:hidden;pointer-events:auto;background:var(--COLOR_PANEL_BG,var(--SCD_PANEL_BG));backdrop-filter:blur(4px);border-radius:10px;box-shadow:0 0 50px rgba(0,0,0,.15);color:white; }
#skribbl-duels-panel [data-role='body'],.scd-stage-shell,.scd-chat-log { overscroll-behavior:contain; }
#skribbl-duels-panel ::-webkit-scrollbar,#skribbl-duels-stage ::-webkit-scrollbar,#skribbl-duels-board ::-webkit-scrollbar { width:14px;height:14px;border-radius:7px;background-color:var(--COLOR_PANEL_LO); }
#skribbl-duels-panel ::-webkit-scrollbar-track,#skribbl-duels-stage ::-webkit-scrollbar-track,#skribbl-duels-board ::-webkit-scrollbar-track { border-radius:7px;background-color:var(--COLOR_PANEL_LO); }
#skribbl-duels-panel ::-webkit-scrollbar-thumb,#skribbl-duels-stage ::-webkit-scrollbar-thumb,#skribbl-duels-board ::-webkit-scrollbar-thumb { min-height:28px;border:0;border-radius:7px;background-color:var(--COLOR_PANEL_HI);background-clip:border-box; }
#skribbl-duels-panel ::-webkit-scrollbar-button,#skribbl-duels-stage ::-webkit-scrollbar-button,#skribbl-duels-board ::-webkit-scrollbar-button { display:none;width:0;height:0; }
#skribbl-duels-panel *,#skribbl-duels-stage *,#skribbl-duels-board * { scrollbar-color:var(--COLOR_PANEL_HI) var(--COLOR_PANEL_LO);scrollbar-width:auto; }
.scd-modal-header { display:grid;grid-template-columns:minmax(120px,1fr) auto minmax(120px,1fr);align-items:center;gap:10px;padding:8px 10px 4px; }
.scd-modal-title { font-size:1.8em;font-weight:700;text-align:center;white-space:nowrap; }
.scd-modal-account { min-width:0;display:flex;align-items:center;gap:7px;font-size:11px; }
.scd-modal-account .scd-auth-avatar { width:34px;height:34px; }
.scd-modal-actions { display:flex;align-items:center;justify-content:flex-end;gap:5px; }
.scd-modal-actions .scd-icon-button { width:38px;height:38px; }
.scd-modal-actions .scd-icon { width:34px;height:34px; }
.scd-modal-close { color:#aaa;font-size:28px;line-height:1; }
.scd-modal-close:hover { color:white; }
.scd-main-tabs { display:flex;justify-content:center;padding:4px 10px 8px; }
.scd-main-tabs .scd-tab { min-width:150px;font-weight:700; }
.scd-stage-shell { width:min(880px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:auto; }
.scd-versus { width:min(760px,100%);max-height:75vh;overflow:auto;display:flex;flex-direction:column;align-items:center;gap:14px;padding:18px;background:var(--COLOR_PANEL_BG,var(--SCD_PANEL_BG));border-radius:10px;color:white;box-shadow:0 0 50px rgba(0,0,0,.2); }
.scd-versus-players { width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:18px; }
.scd-versus-player { min-width:0;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center; }
.scd-versus-avatar { width:min(88px,15vw);aspect-ratio:1;border-radius:50%;object-fit:cover;display:grid;place-items:center;font-size:clamp(24px,4vw,40px);font-weight:900;box-shadow:0 8px 30px rgba(0,0,0,.24); }
.scd-versus-name { max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:1.35em;font-weight:800; }
.scd-versus-vs { font-size:clamp(28px,6vw,54px);font-weight:900;text-shadow:3px 3px 0 rgba(0,0,0,.3); }
.scd-ready-state { display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.72);font-size:12px; }
.scd-ready-state .scd-icon { width:28px;height:28px; }
.scd-ready-actions { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;width:min(420px,100%); }
.scd-ready-action { min-height:48px;display:flex;align-items:center;justify-content:center;gap:7px;font-weight:800; }
.scd-ready-action .scd-icon { width:30px;height:30px; }
.scd-draft-stage { width:min(780px,100%);display:flex;flex-direction:column;gap:10px; }
.scd-stage-board { width:min(640px,100%);align-self:center;background:var(--COLOR_PANEL_BG,var(--SCD_PANEL_BG));border-radius:10px;color:white;overflow:hidden; }
.scd-stage-board-header { display:flex;align-items:center;justify-content:center;min-height:38px;padding:7px 10px;font-size:13px;font-weight:800;text-align:center; }
.scd-stage-board-grid { display:grid;gap:4px;padding:8px; }
.scd-draft-controls { display:flex;flex-direction:column;gap:8px;padding:10px;background:var(--COLOR_PANEL_BG,var(--SCD_PANEL_BG));border-radius:10px;color:white; }
.scd-draft-controls .scd-draft-options { width:100%; }
.scd-draft-controls .scd-draft-option { display:flex;flex-direction:column;align-items:center;justify-content:center;aspect-ratio:2/1;border:0;border-radius:4px;background:var(--COLOR_PANEL_BG,var(--SCD_PANEL_BG));box-shadow:none;color:white;padding:8px;transition:transform .15s; }
.scd-draft-controls .scd-draft-option:hover:not(:disabled) { transform:scale(.96);background:color-mix(in srgb,var(--COLOR_PANEL_BG,var(--SCD_PANEL_BG)) 86%,white); }
.scd-draft-option .scd-field-icon { width:52px; }
.scd-draft-info { display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;font-size:12px; }
.scd-countdown-score { font-size:clamp(18px,3vw,30px);font-weight:900; }
.scd-countdown-flight { position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden; }
.scd-countdown-phase { position:absolute;left:50%;top:50%;display:flex;align-items:center;justify-content:center;gap:clamp(2px,1vw,10px);filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25));animation:scd-countdown-drop .94s both; }
.scd-countdown-phase .scd-icon { width:clamp(110px,24vw,240px);height:clamp(110px,24vw,240px);image-rendering:pixelated; }
.scd-countdown-phase.go .scd-icon { width:clamp(80px,18vw,180px);height:clamp(80px,18vw,180px); }
.scd-intro-card { position:relative;width:min(560px,92vw);height:min(560px,92vw);display:grid;place-items:center;pointer-events:auto;isolation:isolate;overflow:visible; }
.scd-intro-logo { position:relative;z-index:50;width:min(360px,65vw);height:min(360px,65vw);filter:drop-shadow(0 0 7px rgba(255,255,255,.2)) drop-shadow(0 0 14px rgba(255,255,255,.1));animation:scd-intro-float 1.8s ease-in-out infinite alternate;image-rendering:pixelated; }
.scd-intro-orbit-icon { position:absolute;left:50%;top:50%;width:44px;height:44px;pointer-events:none;will-change:transform,opacity;filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25));image-rendering:pixelated; }
@keyframes scd-modal-opacity { from { opacity:0; } to { opacity:1; } }
@keyframes scd-modal-position { from { transform:translateY(-21%); } to { transform:translateY(0); } }
@keyframes scd-intro-float { from { transform:translateY(-8px); } to { transform:translateY(8px); } }
@keyframes scd-countdown-drop {
  0% { opacity:0;transform:translate(-50%,-125vh) scale(.86);animation-timing-function:cubic-bezier(.16,1,.3,1); }
  55% { opacity:1;transform:translate(-50%,-50%) scale(1); }
  70% { opacity:1;transform:translate(-50%,-50%) scale(1);animation-timing-function:cubic-bezier(.7,0,.84,0); }
  100% { opacity:0;transform:translate(-50%,115vh) scale(.92); }
}
.scd-button { border:0;border-radius:7px;background:var(--SCD_ACCENT);color:white;padding:7px 10px;cursor:pointer; }
.scd-button:hover:not(:disabled),.scd-tab.active:hover:not(:disabled) { background:var(--SCD_ACCENT_HOVER); }
.scd-button:active:not(:disabled),.scd-tab.active:active:not(:disabled) { background:var(--SCD_ACCENT_ACTIVE); }
.scd-button.primary { color:#fff;font-weight:700; }
.scd-button.danger { background:#d68e27; }
.scd-button.danger:hover:not(:disabled) { background:#c4842a; }
.scd-button.danger:active:not(:disabled) { background:#b87824; }
.scd-field { position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;aspect-ratio:1/1;border:0;background:var(--COLOR_PANEL_BG,var(--SCD_PANEL_BG));color:white;border-radius:4px;padding:4px;overflow:hidden;box-shadow:none;transition:transform .15s; }
.scd-field.empty { background:var(--COLOR_PANEL_BG,var(--SCD_PANEL_BG));opacity:.42; }
.scd-field:not(.empty) { pointer-events:auto; }
.scd-field:not(.empty):hover { transform:scale(.9); }
.scd-field.drafted { animation:scd-field-reveal .24s ease-out; }
.scd-field.final-slot { outline:2px solid rgba(255,255,255,.36);outline-offset:-2px; }
.scd-field.pending { outline:2px solid #ffd95f;outline-offset:-2px; }
.scd-field.self { background: color-mix(in srgb,var(--COLOR_PANEL_BG,var(--SCD_PANEL_BG)) 72%,#56ce27); }
.scd-field.opponent { background: color-mix(in srgb,var(--COLOR_PANEL_BG,var(--SCD_PANEL_BG)) 72%,#ce4f0a); }
.scd-field-icon { display:grid;place-items:center;width:56%;aspect-ratio:1/1;border-radius:0;background:transparent;font-size:clamp(12px,2.2vw,22px);font-weight:900;text-shadow:none;filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25));image-rendering:pixelated; }
.scd-field-icon .scd-icon-image { image-rendering:pixelated; }
.scd-field-name { display:block;width:100%;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;font-size:10px;line-height:1.15;font-weight:700; }
.scd-final-slot-name { animation:scd-slot-flicker .18s linear infinite; }
.scd-tab.active { background: var(--SCD_ACCENT); }
.scd-muted { color: rgba(255,255,255,.6); }
.scd-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.scd-queue-row { display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(70px,.5fr);gap:10px; }
.scd-queue-button { width:100%;border:0;border-radius:var(--BORDER_RADIUS,7px);color:white;font-weight:700;text-shadow:2px 2px 0 #0000002b;cursor:pointer;transition:background-color 80ms; }
.scd-queue-casual { min-height:54px;background:#2c8de7;font-size:1.2em; }
.scd-queue-casual:hover:not(:disabled) { background:#1671c5; }
.scd-queue-casual:active:not(:disabled) { background:#1361a9;padding-top:2px; }
.scd-queue-ranked { min-height:54px;background:#53e237;font-size:1.45em; }
.scd-queue-ranked:hover:not(:disabled) { background:#38c41c; }
.scd-queue-ranked:active:not(:disabled) { background:#30aa19;padding-top:2px; }
.scd-invite-button { min-height:54px;background:#2c8de7;display:flex;align-items:center;justify-content:center;gap:.25em;font-size:1.45em; }
.scd-invite-button:hover:not(:disabled) { background:#1671c5; }
.scd-invite-button:active:not(:disabled) { background:#1361a9;padding-top:2px; }
.scd-invite-button img { width:1.2em;height:1.2em;filter:var(--DROPSHADOW); }
.scd-invite-info { display:flex;align-items:baseline;justify-content:flex-start;gap:12px;min-width:0;flex-wrap:wrap; }
.scd-invite-controls { display:grid;grid-template-columns:minmax(0,1fr) 44px auto;align-items:stretch;gap:8px;min-width:0; }
#skribbl-duels-panel .scd-invite-link { height:42px;min-width:0;padding:.35em .6em;resize:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:text; }
.scd-copy-button { width:44px;height:42px;border:0;border-radius:7px;background:var(--COLOR_BUTTON_NORMAL_BG,#2c8de7);color:white;padding:7px;cursor:pointer;display:grid;place-items:center; }
.scd-copy-button:hover:not(:disabled) { background:var(--COLOR_BUTTON_NORMAL_BG_HOVER,#1671c5); }
.scd-copy-button:active:not(:disabled) { background:var(--COLOR_BUTTON_NORMAL_BG_ACTIVE,#1361a9);padding-top:9px; }
.scd-copy-button:disabled { opacity:.45;cursor:not-allowed; }
.scd-copy-button img { width:1.2em;height:1.2em;filter:var(--DROPSHADOW); }
.scd-invite-cancel { height:42px;min-height:42px;font-size:1.45em;line-height:1; }
.scd-queue-button:disabled { opacity:.45;cursor:not-allowed; }
.scd-stack { display: flex; flex-direction: column; gap: 9px; }
.scd-card { background:var(--COLOR_PANEL_BG);border-radius:8px;padding:10px; }
.scd-label { display:grid;grid-template-columns:minmax(0,1fr) minmax(160px,45%);align-items:center;gap:10px;color:white; }
.scd-label input[type='range'] { flex:1; }
.scd-auth-profile { display:flex;align-items:center;gap:10px;min-width:0; }
.scd-auth-avatar { width:42px;height:42px;border-radius:50%;object-fit:cover;background:rgba(255,255,255,.1);flex:none; }
.scd-auth-copy { min-width:0;flex:1; }
.scd-auth-name { font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.scd-auth-email { color:rgba(255,255,255,.58);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.scd-auth-error { color:#ffb0b0;font-size:11px;white-space:pre-wrap; }
.scd-profile-field { display:flex;flex-direction:column;gap:4px; }
.scd-profile-field .scd-label { min-width:0; }
.scd-profile-field input { min-width:0;max-width:100%; }
.scd-profile-error { color:var(--COLOR_CHAT_TEXT_LEAVE);font-size:12px;font-weight:800;white-space:pre-wrap; }
.scd-skribbl-avatar { position:relative;width:100%;height:100%;image-rendering:pixelated; }
.scd-skribbl-avatar .color,.scd-skribbl-avatar .eyes,.scd-skribbl-avatar .mouth { position:absolute;width:100%;height:100%;background-size:1000% 1000%; }
.scd-skribbl-avatar .color { background-image:url('https://skribbl.io/img/avatar/color_atlas.gif'); }
.scd-skribbl-avatar .eyes { background-image:url('https://skribbl.io/img/avatar/eyes_atlas.gif'); }
.scd-skribbl-avatar .mouth { background-image:url('https://skribbl.io/img/avatar/mouth_atlas.gif'); }
.scd-skribbl-avatar .special { position:absolute;left:-33%;top:-33%;width:166%;height:166%;background-image:url('https://skribbl.io/img/avatar/special_atlas.gif');background-size:1000% 1000%; }
.scd-avatar-fallback,.scd-avatar-discord { background:rgba(255,255,255,.1); }
.scd-avatar-discord { overflow:hidden; }
.scd-avatar-skribbl { overflow:visible !important;border-radius:0; }
.scd-versus-avatar.scd-avatar-skribbl { box-shadow:none; }
.scd-versus-avatar.scd-avatar-skribbl .scd-skribbl-avatar { width:72%;height:72%; }
.scd-result-avatar.scd-avatar-skribbl .scd-skribbl-avatar,.scd-win-player.scd-avatar-skribbl .scd-skribbl-avatar { width:100%;height:100%; }
.scd-draft-picks { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px; }
.scd-draft-pick { min-width:0;padding:5px 7px;border-radius:6px;background:rgba(255,255,255,.06);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.scd-draft-pick.self { border-left:3px solid var(--SCD_SELF); }
.scd-draft-pick.opponent { border-left:3px solid var(--SCD_OPPONENT); }
.scd-draft-options { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px; }
.scd-draft-option { min-width:0;min-height:76px;text-align:center;font-size:13px;line-height:1.2; }
.scd-draft-option-key { display:block;margin-top:5px;color:rgba(255,255,255,.62);font-size:10px;font-weight:400; }
.scd-draft-board { display:grid;gap:4px; }
.scd-chat-log { max-height:330px;overflow:auto;min-width:0;transition:mask-image .12s;-webkit-transition:-webkit-mask-image .12s; }
.scd-chat-log.has-overflow:not(.at-top) { mask-image:linear-gradient(to bottom,transparent 0,#000 18%,#000 100%);-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 18%,#000 100%); }
.scd-chat-line { min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word; }
.scd-chat-line.system { padding:6px 8px;border-left:3px solid var(--SCD_ACCENT);background:rgba(255,255,255,.055); }
.scd-chat-form { position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;font:inherit;margin:0;padding:0 .2em; }
.scd-chat-input-shell { position:relative;min-width:0;display:flex; }
.scd-chat-characters { font-weight:700;position:absolute;right:1em;font-size:.9em;color:var(--COLOR_CHAT_INPUT_COUNT);top:1em;opacity:0;pointer-events:none;transition:top 70ms ease-in-out,opacity 70ms ease-in-out; }
.scd-chat-characters.visible { top:.5em;opacity:1; }
#skribbl-duels-panel .scd-chat-form input { height:2.2em;width:100%;padding:.2em 3em .2em .5em; }
.scd-match-actions { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
.scd-draw-proposal { border-left:3px solid var(--SCD_ACCENT); }
.scd-result-card { display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;column-gap:16px;row-gap:8px;overflow:hidden; }
.scd-result-visual { position:relative;grid-row:1/3;width:48px;aspect-ratio:1/1;display:grid;place-items:center;isolation:isolate; }
.scd-result-visual > .scd-icon { width:48px;height:48px; }
.scd-result-avatar { position:relative;z-index:1;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;font-size:24px;font-weight:900; }
.avatar .owner { position:absolute;width:50%;height:50%;left:-5%;top:-22%;z-index:2;background-image:url('/img/crown.gif');background-position:center;background-size:contain;background-repeat:no-repeat; }
.scd-result-trophy,.scd-win-trophy { z-index:-1;position:absolute;width:100%;height:100%;left:50%;background-image:url('/img/trophy.gif');background-size:cover;filter:drop-shadow(0 0 8px rgba(0,0,0,.25)); }
.scd-result-title { width:100%;color:var(--COLOR_CHAT_TEXT_OWNER,#ffa844);font-size:1.15em;text-align:center;justify-self:stretch; }
.scd-result-score { width:100%;font-weight:700;text-align:center;justify-self:stretch; }
.scd-result-actions { grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px; }
.scd-result-actions .scd-button { background:var(--COLOR_PANEL_BUTTON,#2a51d1);border-color:transparent;color:#fff;font-weight:700; }
.scd-result-actions .scd-button:hover:not(:disabled) { background:var(--COLOR_PANEL_BUTTON_HOVER,#1e44be); }
.scd-result-actions .scd-button:active:not(:disabled) { background:var(--COLOR_PANEL_BUTTON_ACTIVE,#1d40b4); }
.scd-result-actions .scd-result-return { background:#d68e27; }
.scd-result-actions .scd-result-return:hover:not(:disabled) { background:#c4842a; }
.scd-result-actions .scd-result-return:active:not(:disabled) { background:#b87824; }
.scd-result-actions .scd-result-new { background:#53e237; }
.scd-result-actions .scd-result-new:hover:not(:disabled) { background:#38c41c; }
.scd-result-actions .scd-result-new:active:not(:disabled) { background:#30aa19; }
.scd-result-actions .scd-result-rematch { background:#2c8de7; }
.scd-result-actions .scd-result-rematch:hover:not(:disabled) { background:#1671c5; }
.scd-result-actions .scd-result-rematch:active:not(:disabled) { background:#1361a9; }
.scd-result-actions .scd-button:disabled { opacity:.45;cursor:not-allowed; }
.scd-win-animation { position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;pointer-events:none;overflow:hidden;background:radial-gradient(circle,rgba(42,81,209,.28),rgba(0,0,0,.7));animation:scd-win-fade 3.4s both; }
.scd-win-card { position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:8px;color:white;font-size:clamp(28px,6vw,58px);font-weight:900;text-align:center;text-shadow:3px 3px 0 rgba(0,0,0,.35); }
.scd-win-visual { position:relative;width:clamp(96px,18vw,170px);height:clamp(96px,18vw,170px);display:grid;place-items:center;isolation:isolate; }
.scd-win-player { position:relative;z-index:1;width:68%;height:68%;border-radius:50%;display:grid;place-items:center;font-size:clamp(34px,7vw,72px);animation:player_winner 3.2s both;filter:drop-shadow(0 0 8px rgba(0,0,0,.25)); }
.typo-toast-container { position:fixed;left:0;right:0;top:0;height:0;overflow:visible;z-index:2147483647;display:flex;flex-direction:column;align-items:center;gap:1rem;padding-top:1rem; }
.scd-duel-toast { padding:1rem 3rem 1rem 1rem;background-color:var(--COLOR_PANEL_HI);border-radius:5px;color:var(--COLOR_PANEL_TEXT);filter:drop-shadow(0 5px 10px rgba(0,0,0,.3));min-width:clamp(20rem,20rem,80%);position:relative;animation:scd-toast-in .15s ease-out;display:flex;flex-direction:column;align-items:flex-start;white-space:pre-wrap;gap:.5rem;pointer-events:auto; }
.scd-duel-toast.clickable { cursor:pointer;transition:background-color 80ms; }
.scd-duel-toast.clickable:hover { background:var(--COLOR_BUTTON_NORMAL_BG); }
.scd-duel-toast.closing { animation:scd-toast-out .15s ease-out forwards; }
.scd-duel-toast .close-toast { position:absolute;right:.5rem;top:0;font-weight:900;opacity:.7;cursor:pointer;font-size:2rem; }
.scd-duel-toast .typo-toast-confirm { width:100%;display:flex;flex-direction:row;gap:1rem; }
.scd-duel-toast .typo-toast-confirm .scd-button { min-width:7rem; }
.scd-toast-profile { display:flex;align-items:center;gap:.55rem;min-width:0; }
.scd-toast-profile strong { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.scd-toast-avatar { position:relative;width:32px !important;height:32px !important;border-radius:50%;display:grid;place-items:center;flex:none;font-size:16px;font-weight:900; }
.scd-toast-avatar.scd-avatar-skribbl .scd-skribbl-avatar { width:100%;height:100%; }
#skribbl-duels-panel input::placeholder,#skribbl-duels-panel textarea::placeholder,#skribbl-duels-stage input::placeholder,#skribbl-duels-stage textarea::placeholder { color:var(--COLOR_PANEL_TEXT_PLACEHOLDER); }
#skribbl-duels-panel input,#skribbl-duels-panel select,#skribbl-duels-panel textarea,#skribbl-duels-stage input,#skribbl-duels-stage select,#skribbl-duels-stage textarea { font:inherit;flex:0 0 auto;height:32px;width:100%;min-width:0;color:var(--COLOR_INPUT_TEXT);background-color:var(--COLOR_INPUT_BG);border:1px solid var(--COLOR_INPUT_BORDER);border-radius:var(--BORDER_RADIUS);padding:.2em .5em;transition:background-color .12s ease,border-color .12s ease;box-sizing:border-box; }
#skribbl-duels-panel input:focus,#skribbl-duels-panel select:focus,#skribbl-duels-panel textarea:focus,#skribbl-duels-stage input:focus,#skribbl-duels-stage select:focus,#skribbl-duels-stage textarea:focus { outline:0;background-color:var(--COLOR_INPUT_HOVER);border-color:var(--COLOR_INPUT_BORDER_FOCUS);box-shadow:0 0 10px -4px var(--COLOR_INPUT_BORDER_FOCUS); }
#skribbl-duels-panel input:hover:not(:disabled),#skribbl-duels-panel select:hover:not(:disabled),#skribbl-duels-panel textarea:hover:not(:disabled),#skribbl-duels-stage input:hover:not(:disabled),#skribbl-duels-stage select:hover:not(:disabled),#skribbl-duels-stage textarea:hover:not(:disabled) { background-color:var(--COLOR_INPUT_HOVER); }
#skribbl-duels-panel input:disabled,#skribbl-duels-panel select:disabled,#skribbl-duels-panel textarea:disabled,#skribbl-duels-stage input:disabled,#skribbl-duels-stage select:disabled,#skribbl-duels-stage textarea:disabled { cursor:not-allowed;opacity:.7; }
#skribbl-duels-panel input:invalid,#skribbl-duels-panel select:invalid,#skribbl-duels-panel textarea:invalid,#skribbl-duels-stage input:invalid,#skribbl-duels-stage select:invalid,#skribbl-duels-stage textarea:invalid { border-color:red; }
#skribbl-duels-panel input[type='range']:focus,#skribbl-duels-stage input[type='range']:focus { box-shadow:none; }
#skribbl-duels-panel input[type='checkbox'],#skribbl-duels-stage input[type='checkbox'] { appearance:none;-webkit-appearance:none;-moz-appearance:none;margin:0;padding:0;width:1.15em;height:1.15em;transition:none;display:grid;place-content:center;justify-self:end; }
#skribbl-duels-panel input[type='checkbox']::before,#skribbl-duels-stage input[type='checkbox']::before { content:'';width:0;height:0;border-radius:var(--BORDER_RADIUS);transition:width 50ms ease-in-out,height 50ms ease-in-out;box-shadow:inset 1em 1em var(--COLOR_INPUT_TEXT); }
#skribbl-duels-panel input[type='checkbox']:checked::before,#skribbl-duels-stage input[type='checkbox']:checked::before { width:1em;height:1em; }
@keyframes scd-field-reveal { from { opacity:0;transform:scale(.72) rotate(-4deg); } to { opacity:1;transform:scale(1) rotate(0); } }
@keyframes scd-slot-flicker { 0% { opacity:.45;transform:translateY(-2px); } 50% { opacity:1;transform:translateY(2px); } 100% { opacity:.45;transform:translateY(-2px); } }
@keyframes scd-win-fade { 0%,78% { opacity:1; } 100% { opacity:0; } }
@keyframes player_winner { 0% { transform:rotate(0) scale(1,1) translate(0,0); } 5%,8% { transform:rotate(0) scale(1.2,.8) translate(0,0); } 14%,16% { transform:rotate(20deg) scale(.8,1.2) translate(10%,-50%); } 24%,26% { transform:rotate(0) scale(1.4,.7) translate(0,0); } 28%,38% { transform:rotate(0) scale(1,1) translate(0,0); } 42% { transform:rotate(0) scale(1.2,.8) translate(0,0); } 48%,50% { transform:rotate(-20deg) scale(.8,1.2) translate(-10%,-50%); } 58%,60% { transform:rotate(0) scale(1.4,.7) translate(0,0); } 62%,100% { transform:rotate(0) scale(1,1) translate(0,0); } }
@keyframes scd-toast-in { from { transform:translateY(-50vh);opacity:0; } to { transform:translateY(0);opacity:1; } }
@keyframes scd-toast-out { from { transform:translateY(0);opacity:1; } to { transform:translateY(-50vh);opacity:0; } }
@media (max-width:620px) {
  .scd-modal-header { grid-template-columns:1fr auto; }
  .scd-modal-title { display:none; }
  .scd-versus-players { gap:8px; }
  .scd-versus-avatar { width:min(68px,19vw); }
  .scd-queue-row { grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
  .scd-invite-button { grid-column:1 / -1; }
  .scd-invite-controls { grid-template-columns:44px minmax(0,1fr); }
  .scd-invite-link { grid-column:1 / -1; }
  .scd-invite-cancel { min-width:0; }
  .scd-label { grid-template-columns:minmax(0,1fr); }
  .scd-label input[type='checkbox'] { justify-self:start; }
}
@media (prefers-reduced-motion:reduce) {
  .scd-intro-logo,.scd-countdown-phase,.scd-field.drafted,.scd-final-slot-name,.scd-win-animation,.scd-win-player,.scd-duel-toast { animation:none !important; }
}
`;
    (document.head ?? document.documentElement).appendChild(style);
  }

  private flush(): void {
    if (!this.enabled() || (this.pending.length === 0 && this.pendingWins.length === 0)) return;
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
      paragraph.dataset.scdRuntimeId = this.runtimeId;
      paragraph.dataset.skribblDuelsClaimId = message.claimId;
      const bold = document.createElement('b');
      bold.textContent = `${message.playerName} has completed '${message.challengeName}'!`;
      paragraph.append(bold, document.createElement('span'));
      target.appendChild(paragraph);
      target.scrollTop = target.scrollHeight;
    }

    while (this.pendingWins.length > 0) {
      const message = this.pendingWins.shift();
      if (!message) break;
      const messageId = `win:${message.matchId}`;
      if (target.querySelector(`[data-skribbl-duels-claim-id="${CSS.escape(messageId)}"]`)) continue;
      const parity = (target.children.length + 1) % 2 === 0 ? 'alt' : 'base';
      const paragraph = document.createElement('p');
      paragraph.className = `skribbl-duels-completion win ${parity}`;
      paragraph.dataset.scdRuntimeId = this.runtimeId;
      paragraph.dataset.skribblDuelsClaimId = messageId;
      paragraph.appendChild(element(
        'b',
        '',
        `${message.playerName} won after ${formatDurationWords(message.elapsedMs)}!`
      ));
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

  public constructor(private readonly runtimeId: string) {}

  public start(): void {
    document.addEventListener('pointerover', this.pointerOver, true);
    document.documentElement.addEventListener('pointerleave', this.pointerLeave);
  }

  public stop(): void {
    document.removeEventListener('pointerover', this.pointerOver, true);
    document.documentElement.removeEventListener('pointerleave', this.pointerLeave);
    this.hide();
  }

  public register(target: HTMLElement, title: string, lock?: 'X' | 'Y'): void {
    target.dataset.scdTooltip = wrapTooltipText(title);
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
    tooltip.dataset.scdRuntimeId = this.runtimeId;
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

  private readonly matchStorageKey = 'skribblDuelsProductMatchSessionV2';
  private currentBoard: DraftBoard | null = null;
  private homeButton: HTMLButtonElement | null = null;
  private launcher: HTMLButtonElement | null = null;
  private panel: HTMLDivElement | null = null;
  private panelBody: HTMLDivElement | null = null;
  private panelAccount: HTMLDivElement | null = null;
  private panelMainTab: HTMLButtonElement | null = null;
  private stage: HTMLDivElement | null = null;
  private stageBody: HTMLDivElement | null = null;
  private intro: HTMLDivElement | null = null;
  private board: HTMLDivElement | null = null;
  private boardGrid: HTMLDivElement | null = null;
  private winAnimation: HTMLDivElement | null = null;
  private mountGuard: number | null = null;
  private draftSlotTimer: number | null = null;
  private introTimer: number | null = null;
  private introAnimationFrame: number | null = null;
  private countdownAnimationFrame: number | null = null;
  private countdownVisualEndsAt = 0;
  private countdownGoUntil = 0;
  private winAnimationTimer: number | null = null;
  private settings: ProductUiSettings;
  private matchState: MatchState;
  private chatAdapter: CompletionChatAdapter;
  private duelChatMessages: DuelChatMessage[] = [];
  private activeTab: ProductUiSettings['panelTab'];
  private readonly tooltips: ProductTooltipManager;
  private readonly authClient = new SupabaseDiscordAuthClient();
  private readonly gatewayClient: SocketIoGatewayClient;
  private authState: AuthSnapshot;
  private gatewayState: GatewayConnectionSnapshot;
  private readonly unsubscribers: Array<() => void> = [];
  private lastGatewayMatchId: string | null = null;
  private matchStartTimer: number | null = null;
  private matchmakingError: string | null = null;
  private readySubmissionMatchId: string | null = null;
  private readySubmissionTimer: number | null = null;
  private cancellationSubmissionMatchId: string | null = null;
  private cancellationSubmissionTimer: number | null = null;
  private readyDeadlineRecoveryAt = 0;
  private draftSubmissionKey: string | null = null;
  private lastConclusionMessageMatchId: string | null = null;
  private pendingConclusionMessageMatchId: string | null = null;
  private conclusionPresentationTimer: number | null = null;
  private lastWinAnimationMatchId: string | null = null;
  private forfeitAfterReconnectMatchId: string | null = null;
  private readonly processedGatewayChatIds = new Set<string>();
  private readonly processedClaimResolutionIds = new Set<string>();
  private readonly submittedClaimCandidateIds = new Set<string>();
  private deferredTelemetryEvents: TelemetryEvent[] = [];
  private awaitingTelemetryResumeCursor = false;
  private restoreDuelChatFocus = false;
  private duelChatScrollTop = 0;
  private duelChatStickToBottom = true;
  private matchActionError: string | null = null;
  private readonly chatNotificationStartedAt = Date.now();
  private readonly draftKeydown = (event: KeyboardEvent) => this.handleDraftKeydown(event);
  private readonly duelChatKeydown = (event: KeyboardEvent) => this.handleDuelChatKeydown(event);
  private readonly visibilityRecovery = () => this.reconcileAfterVisibilityRecovery();
  private pendingRestoredMatchId: string | null;
  private readonly suppressExternalConclusionForMatchIds = new Set<string>();
  private pendingInviteToken: string | null = new URLSearchParams(window.location.search).get('scd-invite');
  private inviteAcceptanceSubmitted = false;
  private inviteAuthPrompted = false;
  private copiedInviteId: string | null = null;
  private destroyed = false;

  public constructor(private readonly options: ProductFoundationOptions) {
    this.tooltips = new ProductTooltipManager(options.runtimeId);
    this.manifest = createChallengeManifest({
      definitionsVersion: options.definitionsVersion,
      definitions: options.challengeDefinitions
    }, 'en');
    const persisted = this.loadPersistedMatch();
    this.pendingRestoredMatchId = persisted?.state.matchId ?? null;
    this.currentBoard = persisted?.board ?? null;
    this.matchStore = new MatchStateStore(persisted?.state);
    this.awaitingTelemetryResumeCursor = persisted?.state.phase === 'running'
      && persisted.state.matchId !== null;
    this.telemetryGateway = new MatchTelemetryGateway(this.matchStore);
    const restoredSettings = this.settingsStore.get();
    this.settings = restoredSettings.panelOpen
      ? this.settingsStore.update({ panelOpen: false })
      : restoredSettings;
    this.matchState = this.matchStore.getState();
    this.activeTab = this.settings.panelTab;
    this.chatAdapter = new CompletionChatAdapter(
      () => this.settings.completionMessages,
      options.runtimeId
    );
    this.authState = this.authClient.getState();
    this.gatewayClient = new SocketIoGatewayClient({
      endpoint: GATEWAY_URL,
      clientVersion: GATEWAY_CLIENT_VERSION,
      capabilities: GATEWAY_CAPABILITIES
    });
    this.telemetryGateway.setTransport(envelope => {
      this.gatewayClient.queueTelemetryEnvelope(envelope);
    });
    this.gatewayState = this.gatewayClient.getState();
  }

  public start(): ProductPublicApi {
    this.installRuntimeIsolationStyle();
    this.removeForeignRuntimeDom();
    this.chatAdapter.start();
    this.tooltips.start();
    document.addEventListener('keydown', this.draftKeydown, true);
    document.addEventListener('visibilitychange', this.visibilityRecovery, true);
    window.addEventListener('keydown', this.duelChatKeydown, true);
    window.addEventListener('focus', this.visibilityRecovery, false);
    this.unsubscribers.push(this.gatewayClient.subscribe(state => {
      const previous = this.gatewayState;
      const matchChanged = previous.match?.matchId !== state.match?.matchId
        || previous.match?.revision !== state.match?.revision;
      const chatChanged = previous.duelChatMessages.length !== state.duelChatMessages.length;
      const presentationChanged = matchChanged
        || chatChanged
        || previous.status !== state.status
        || previous.error !== state.error
        || previous.queue?.requestId !== state.queue?.requestId
        || previous.queue?.position !== state.queue?.position
        || previous.invite?.inviteId !== state.invite?.inviteId
        || previous.invite?.status !== state.invite?.status
        || previous.invite?.token !== state.invite?.token
        || previous.identity?.displayName !== state.identity?.displayName;
      if (matchChanged) this.matchActionError = null;
      this.gatewayState = state;
      this.handleInviteGatewayState(previous, state);
      this.handleGatewayMatchState(state);
      this.handleGatewayRealtimeState(state);
      this.flushForfeitAfterReconnect(state);
      if (presentationChanged) this.renderVisibility();
      if (matchChanged) {
        this.renderStage();
        this.renderBoard();
      }
      if (this.settings.panelOpen && presentationChanged) this.renderPanel();
    }));
    this.unsubscribers.push(this.authClient.subscribe(state => {
      this.authState = state;
      this.gatewayClient.setAccessToken(
        state.status === 'signed-in' ? state.accessToken : null
      );
      this.handleInviteAuthenticationState();
      this.renderStage();
      if (this.settings.panelOpen) this.renderPanel();
    }));
    void this.authClient.start();
    this.unsubscribers.push(this.settingsStore.subscribe(settings => {
      const tabChanged = this.activeTab !== settings.panelTab;
      this.settings = settings;
      this.activeTab = settings.panelTab;
      this.renderVisibility();
      this.renderBoardPosition();
      this.renderLauncherPosition();
      this.renderStage();
      this.renderBoard();
      if (tabChanged || settings.panelOpen) this.renderPanel();
    }));
    this.unsubscribers.push(this.matchStore.subscribe(event => {
      if (event.type !== 'MATCH_FINISHED' || !event.state.matchId) return;
      this.scheduleConclusionPresentation(event.state, event.occurredAt);
    }));
    this.unsubscribers.push(this.matchStore.subscribeState(state => {
      this.matchState = state;
      this.persistMatch();
      this.renderVisibility();
      this.renderStage();
      this.renderBoard();
      if (this.settings.panelOpen) this.renderPanel();
    }));
    this.unsubscribers.push(this.options.challengeEngine.subscribe(event => this.handleChallengeEngineEvent(event)));
    this.unsubscribers.push(this.options.subscribeTelemetry(event => this.observeDuelTelemetry(event)));

    this.ensureMounted();
    this.draftSlotTimer = window.setInterval(() => this.tickDraftSlotAnimation(), 90);
    this.mountGuard = window.setInterval(() => {
      this.removeForeignRuntimeDom();
      this.ensureMounted();
      this.tickGatewayClock();
      if (this.matchState.phase === 'countdown') this.updateBoardScore();
    }, 700);

    const api: ProductPublicApi = {
      version: '0.54.0',
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
        reconnect: () => this.gatewayClient.reconnect(),
        joinMatchmaking: format => this.beginMatchmaking(format),
        leaveMatchmaking: () => this.cancelMatchmaking(),
        createInvite: format => this.gatewayClient.createInvite(format),
        acceptInvite: token => this.gatewayClient.acceptInvite(token),
        cancelInvite: inviteId => this.gatewayClient.cancelInvite(inviteId),
        setReady: (matchId, ready) => this.gatewayClient.setReady(matchId, ready),
        pickDraftChallenge: (matchId, challengeId, clientRevision) =>
          this.gatewayClient.pickDraftChallenge(matchId, challengeId, clientRevision),
        sendDuelChat: (matchId, message) => this.gatewayClient.sendDuelChat(matchId, message),
        forfeitMatch: matchId => this.gatewayClient.forfeitMatch(matchId),
        requestRematch: matchId => this.gatewayClient.requestRematch(matchId),
        proposeDraw: matchId => this.gatewayClient.proposeDraw(matchId),
        respondToDraw: (matchId, proposalId, accept) =>
          this.gatewayClient.respondToDraw(matchId, proposalId, accept),
        withdrawDraw: (matchId, proposalId) => this.gatewayClient.withdrawDraw(matchId, proposalId)
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
            playerName ?? this.duelDisplayName('opponent')
          ),
        finish: winner => this.matchStore.finishMatch(winner),
        finishDraw: () => this.matchStore.finishDraw(),
        canSendTelemetry: () => this.matchStore.canForwardTelemetry(),
        getTelemetryStats: () => this.telemetryGateway.getStats(),
        setTelemetryTransport: transport => this.telemetryGateway.setTransport(transport)
      },
      settings: {
        get: () => this.settingsStore.get(),
        update: update => this.settingsStore.update(update),
        updateBoard: update => this.settingsStore.updateBoard(update),
        updateLauncher: update => this.settingsStore.updateLauncher(update),
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
      },
      dispose: reason => this.destroy(reason)
    };
    window.skribblDuelsProduct = api;
    return api;
  }

  public destroy(reason = 'runtime-disposed'): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.abortLocalMatch(reason);
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    if (this.mountGuard !== null) window.clearInterval(this.mountGuard);
    if (this.draftSlotTimer !== null) window.clearInterval(this.draftSlotTimer);
    this.mountGuard = null;
    this.draftSlotTimer = null;
    this.chatAdapter.stop();
    this.tooltips.stop();
    document.removeEventListener('keydown', this.draftKeydown, true);
    document.removeEventListener('visibilitychange', this.visibilityRecovery, true);
    window.removeEventListener('keydown', this.duelChatKeydown, true);
    window.removeEventListener('focus', this.visibilityRecovery, false);
    this.gatewayClient.stop();
    this.authClient.stop();
    this.launcher?.remove();
    this.panel?.remove();
    this.stage?.remove();
    this.intro?.remove();
    this.homeButton?.remove();
    this.board?.remove();
    this.winAnimation?.remove();
    document.querySelectorAll<HTMLElement>('.scd-duel-toast').forEach(toast => {
      if (toast.dataset.scdRuntimeId === this.options.runtimeId) toast.remove();
    });
    if (this.introTimer !== null) window.clearTimeout(this.introTimer);
    this.introTimer = null;
    if (this.winAnimationTimer !== null) window.clearTimeout(this.winAnimationTimer);
    this.winAnimationTimer = null;
    this.clearReadySubmission();
    this.clearCancellationSubmission();
    this.stopIntroAnimation();
    this.stopCountdownAnimation();
    this.homeButton = null;
    this.launcher = null;
    this.panel = null;
    this.panelBody = null;
    this.panelAccount = null;
    this.panelMainTab = null;
    this.stage = null;
    this.stageBody = null;
    this.intro = null;
    this.board = null;
    this.boardGrid = null;
    this.winAnimation = null;
    const isolation = document.getElementById('skribbl-duels-runtime-isolation');
    if (isolation?.dataset.scdRuntimeId === this.options.runtimeId) isolation.remove();
    if (window.skribblDuelsProduct?.version === '0.54.0') delete window.skribblDuelsProduct;
  }

  private installRuntimeIsolationStyle(): void {
    document.getElementById('skribbl-duels-runtime-isolation')?.remove();
    const style = document.createElement('style');
    style.id = 'skribbl-duels-runtime-isolation';
    style.dataset.scdRuntimeId = this.options.runtimeId;
    const runtime = this.options.runtimeId;
    style.textContent = `
#scd-raw-recorder-panel:not([data-scd-runtime-id='${runtime}']),
#skribbl-duels-home-button:not([data-scd-runtime-id='${runtime}']),
#skribbl-duels-launcher:not([data-scd-runtime-id='${runtime}']),
#skribbl-duels-panel:not([data-scd-runtime-id='${runtime}']),
#skribbl-duels-stage:not([data-scd-runtime-id='${runtime}']),
#skribbl-duels-intro:not([data-scd-runtime-id='${runtime}']),
#skribbl-duels-board:not([data-scd-runtime-id='${runtime}']) { display:none !important; }
`;
    (document.head ?? document.documentElement).appendChild(style);
  }

  private removeForeignRuntimeDom(): void {
    for (const selector of [
      '#scd-raw-recorder-panel',
      '#skribbl-duels-home-button',
      '#skribbl-duels-launcher',
      '#skribbl-duels-panel',
      '#skribbl-duels-stage',
      '#skribbl-duels-intro',
      '#skribbl-duels-board'
    ]) {
      document.querySelectorAll<HTMLElement>(selector).forEach(node => {
        if (node.dataset.scdRuntimeId !== this.options.runtimeId) node.remove();
      });
    }
  }

  private ensureMounted(): void {
    if (this.destroyed) return;
    const target = document.body ?? document.documentElement;
    if (!target) return;
    let mounted = false;
    const homeAnchor = document.querySelector<HTMLElement>('#home .button-create');
    if (!this.homeButton) { this.homeButton = this.createHomeButton(); mounted = true; }
    if (homeAnchor && !this.homeButton.isConnected) {
      homeAnchor.insertAdjacentElement('afterend', this.homeButton);
      mounted = true;
    }
    if (!this.launcher) { this.launcher = this.createLauncher(); mounted = true; }
    if (!this.panel) { this.panel = this.createPanel(); mounted = true; }
    if (!this.stage) { this.stage = this.createStage(); mounted = true; }
    if (!this.board) { this.board = this.createBoard(); mounted = true; }
    if (!this.launcher.isConnected) { target.appendChild(this.launcher); mounted = true; }
    if (!this.panel.isConnected) { target.appendChild(this.panel); mounted = true; }
    if (!this.stage.isConnected) { target.appendChild(this.stage); mounted = true; }
    if (!this.board.isConnected) { target.appendChild(this.board); mounted = true; }
    if (!mounted) return;
    this.renderVisibility();
    this.renderBoardPosition();
    this.renderLauncherPosition();
    this.renderPanel();
    this.renderStage();
    this.renderBoard();
  }

  private createHomeButton(): HTMLButtonElement {
    const button = element('button', 'button-skribbl-duels') as HTMLButtonElement;
    button.id = 'skribbl-duels-home-button';
    button.dataset.scdRuntimeId = this.options.runtimeId;
    button.type = 'button';
    button.append(
      this.createIconAsset('challenge-icons/skribbl-duels-logo.gif', 'SD', 'Skribbl Duels logo'),
      element('span', '', 'Skribbl Duels')
    );
    button.addEventListener('click', () => this.openWithIntroduction());
    return button;
  }

  private createLauncher(): HTMLButtonElement {
    const launcher = element('button', 'scd-icon-button') as HTMLButtonElement;
    launcher.id = 'skribbl-duels-launcher';
    launcher.dataset.scdRuntimeId = this.options.runtimeId;
    launcher.type = 'button';
    const icon = this.createIconAsset('challenge-icons/skribbl-duels-logo.gif', 'SD', 'Skribbl Duels');
    launcher.appendChild(icon);
    launcher.addEventListener('click', () => this.handleLauncherClick());
    this.tooltips.register(launcher, 'Open Skribbl Duels', 'X');
    return launcher;
  }

  private createPanel(): HTMLDivElement {
    const panel = element('div', 'scd-modal-overlay');
    panel.id = 'skribbl-duels-panel';
    panel.dataset.scdRuntimeId = this.options.runtimeId;
    isolateScrollRoot(panel);
    panel.addEventListener('click', event => {
      if (event.target === panel) this.closePanel();
    });

    const wrapper = element('div', 'scd-modal-wrapper');
    const modal = element('div', 'scd-modal-container');
    isolatePointerRoot(modal);

    const header = element('div', 'scd-modal-header');
    this.panelAccount = element('div', 'scd-modal-account');
    const title = element('div', 'scd-modal-title', 'Skribbl Duels');
    const actions = element('div', 'scd-modal-actions');
    const settings = element('button', 'scd-icon-button') as HTMLButtonElement;
    settings.type = 'button';
    settings.appendChild(this.createIconAsset('challenge-icons/settings.gif', '⚙', 'Settings'));
    settings.addEventListener('click', () => this.openPanel('settings'));
    this.tooltips.register(settings, 'Settings', 'Y');
    const about = element('button', 'scd-icon-button') as HTMLButtonElement;
    about.type = 'button';
    about.appendChild(this.createIconAsset('challenge-icons/about.gif', '?', 'About'));
    about.addEventListener('click', () => this.openPanel('about'));
    this.tooltips.register(about, 'About and help', 'Y');
    const close = element('button', 'scd-icon-button scd-modal-close', '×') as HTMLButtonElement;
    close.type = 'button';
    close.addEventListener('click', () => this.closePanel());
    this.tooltips.register(close, 'Close Skribbl Duels', 'Y');
    actions.append(settings, about, close);
    header.append(this.panelAccount, title, actions);

    const tabs = element('div', 'scd-main-tabs');
    tabs.dataset.role = 'tabs';
    this.panelMainTab = element('button', 'scd-button scd-tab') as HTMLButtonElement;
    this.panelMainTab.type = 'button';
    this.panelMainTab.addEventListener('click', () => this.openPanel(this.mainPanelTab()));
    tabs.appendChild(this.panelMainTab);

    this.panelBody = element('div');
    this.panelBody.dataset.role = 'body';
    this.panelBody.style.cssText = 'padding:10px;overflow:auto;max-height:660px';
    modal.append(header, tabs, this.panelBody);
    wrapper.appendChild(modal);
    panel.appendChild(wrapper);
    return panel;
  }

  private createStage(): HTMLDivElement {
    const stage = element('div', 'scd-modal-overlay');
    stage.id = 'skribbl-duels-stage';
    stage.dataset.scdRuntimeId = this.options.runtimeId;
    isolateScrollRoot(stage);
    const wrapper = element('div', 'scd-modal-wrapper');
    this.stageBody = element('div', 'scd-stage-shell');
    isolatePointerRoot(this.stageBody);
    wrapper.appendChild(this.stageBody);
    stage.appendChild(wrapper);
    return stage;
  }

  private createIconAsset(src: string, fallbackText: string, label: string): HTMLSpanElement {
    const wrapper = element('span', 'scd-icon');
    wrapper.setAttribute('role', 'img');
    wrapper.setAttribute('aria-label', label);
    const image = element('img', 'scd-icon-image') as HTMLImageElement;
    image.alt = '';
    image.style.cssText = 'display:block;width:100%;height:100%';
    image.addEventListener('error', () => {
      image.remove();
      wrapper.classList.add('scd-icon-fallback');
      wrapper.textContent = fallbackText;
    }, { once: true });
    wrapper.appendChild(image);
    image.src = EMBEDDED_ICON_ASSETS[src] ?? src;
    return wrapper;
  }

  private createChallengeIcon(challengeId: string, className = 'scd-field-icon'): HTMLSpanElement {
    const name = challengeName(this.manifest, challengeId);
    const assetPath = CHALLENGE_ICON_ASSET_PATHS[challengeId];
    const icon = assetPath
      ? this.createIconAsset(assetPath, name.slice(0, 1).toUpperCase(), name)
      : element('span', 'scd-icon scd-icon-fallback', name.slice(0, 1).toUpperCase());
    icon.classList.add(...className.split(' ').filter(Boolean));
    icon.dataset.challengeId = challengeId;
    return icon;
  }

  private createSkribblAvatar(
    avatarData: readonly [number, number, number, number],
    label: string
  ): HTMLDivElement {
    const avatar = element('div', 'avatar fit scd-skribbl-avatar');
    avatar.setAttribute('role', 'img');
    avatar.setAttribute('aria-label', label);
    avatar.dataset.skribblAvatar = avatarData.join(',');
    const layerNames = ['color', 'eyes', 'mouth', 'special'] as const;
    avatarData.forEach((rawIndex, layerIndex) => {
      const layer = element('div', layerNames[layerIndex]);
      const index = Math.trunc(rawIndex);
      if (index < 0) {
        layer.style.display = 'none';
      } else {
        layer.style.backgroundPosition = `${-(index % 10) * 100}% ${-Math.floor(index / 10) * 100}%`;
      }
      avatar.appendChild(layer);
    });
    return avatar;
  }

  private startIntroAnimation(card: HTMLDivElement): void {
    this.stopIntroAnimation();
    const randomAngle = (center: number, spread: number): number => center + (Math.random() - .5) * spread;
    const definitions: IntroOrbitDefinition[] = [
      {
        radiusX: 238,
        radiusY: 166,
        rotateX: randomAngle(67, 12),
        rotateY: randomAngle(-20, 12),
        rotateZ: randomAngle(-8, 10),
        speed: randomAngle(.00063, .00012),
        iconCount: 7
      },
      {
        radiusX: 222,
        radiusY: 152,
        rotateX: randomAngle(31, 12),
        rotateY: randomAngle(52, 12),
        rotateZ: randomAngle(24, 10),
        speed: -randomAngle(.00056, .00012),
        iconCount: 6
      }
    ];

    const challengeIds = this.manifest.entries.map(entry => entry.id);
    for (let index = challengeIds.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [challengeIds[index], challengeIds[swapIndex]] = [challengeIds[swapIndex]!, challengeIds[index]!];
    }
    const orbitIcons: Array<{
      node: HTMLSpanElement;
      definition: IntroOrbitDefinition;
      phase: number;
      spinSpeed: number;
      baseScale: number;
    }> = [];
    let challengeIndex = 0;
    for (const definition of definitions) {
      for (let iconIndex = 0; iconIndex < definition.iconCount; iconIndex += 1) {
        const challengeId = challengeIds[challengeIndex++]!;
        const node = this.createChallengeIcon(challengeId, 'scd-intro-orbit-icon');
        node.style.width = `${Math.round(randomAngle(44, 12))}px`;
        node.style.height = node.style.width;
        card.appendChild(node);
        orbitIcons.push({
          node,
          definition,
          phase: iconIndex / definition.iconCount * Math.PI * 2 + randomAngle(0, .18),
          spinSpeed: randomAngle(.025, .04),
          baseScale: randomAngle(1, .18)
        });
      }
    }

    const startedAt = performance.now();
    const animate = (now: number): void => {
      if (!this.intro?.isConnected || !card.isConnected) {
        this.introAnimationFrame = null;
        return;
      }
      const pixelScale = card.getBoundingClientRect().width / 520;
      for (const icon of orbitIcons) {
        const angle = icon.phase + (now - startedAt) * icon.definition.speed;
        const point = projectIntroPoint(introOrbitPoint(angle, icon.definition));
        const depthExtent = Math.max(icon.definition.radiusX, icon.definition.radiusY);
        const normalizedDepth = Math.max(0, Math.min(1, (point.z + depthExtent) / (depthExtent * 2)));
        const perspectiveScale = (.58 + normalizedDepth * .82) * icon.baseScale;
        const rotation = (now - startedAt) * icon.spinSpeed + icon.phase * 180 / Math.PI;
        icon.node.style.zIndex = String(point.z < 0
          ? 5 + Math.round(normalizedDepth * 40)
          : 51 + Math.round(normalizedDepth * 40));
        icon.node.style.opacity = String(.58 + normalizedDepth * .42);
        icon.node.style.transform = [
          'translate(-50%,-50%)',
          `translate(${(point.x * pixelScale).toFixed(2)}px,${(point.y * pixelScale).toFixed(2)}px)`,
          `scale(${perspectiveScale.toFixed(3)})`,
          `rotate(${rotation.toFixed(2)}deg)`
        ].join(' ');
      }
      this.introAnimationFrame = window.requestAnimationFrame(animate);
    };
    this.introAnimationFrame = window.requestAnimationFrame(animate);
  }

  private stopIntroAnimation(): void {
    if (this.introAnimationFrame !== null) window.cancelAnimationFrame(this.introAnimationFrame);
    this.introAnimationFrame = null;
  }

  private openWithIntroduction(): void {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let seen = false;
    try { seen = sessionStorage.getItem('skribblDuelsIntroSeenV1') === '1'; } catch {}
    if (seen || reducedMotion) {
      this.openPanel(this.mainPanelTab());
      return;
    }
    try { sessionStorage.setItem('skribblDuelsIntroSeenV1', '1'); } catch {}
    this.intro?.remove();
    const intro = element('div', 'scd-modal-overlay');
    intro.id = 'skribbl-duels-intro';
    intro.dataset.scdRuntimeId = this.options.runtimeId;
    isolateScrollRoot(intro);
    const wrapper = element('div', 'scd-modal-wrapper');
    const card = element('div', 'scd-intro-card');
    const logo = this.createIconAsset(
      'challenge-icons/skribbl-duels-logo.gif',
      'SD',
      'Skribbl Duels'
    );
    logo.classList.add('scd-intro-logo');
    card.appendChild(logo);
    wrapper.appendChild(card);
    intro.appendChild(wrapper);
    (document.body ?? document.documentElement).appendChild(intro);
    this.intro = intro;
    this.startIntroAnimation(card);
    if (this.introTimer !== null) window.clearTimeout(this.introTimer);
    this.introTimer = window.setTimeout(() => {
      this.introTimer = null;
      this.stopIntroAnimation();
      this.intro?.remove();
      this.intro = null;
      this.openPanel(this.mainPanelTab());
    }, 4_000);
  }

  private mainPanelTab(): 'duel' | 'match' {
    const gatewayPhase = this.gatewayState.match?.state.phase;
    const active = gatewayPhase === 'running'
      || this.matchState.phase === 'running'
      || this.matchState.phase === 'finished';
    return active ? 'match' : 'duel';
  }

  private currentStagePhase(): 'ready-check' | 'draft' | 'countdown' | null {
    const phase = this.gatewayState.match?.state.phase;
    if (phase === 'running' && this.serverNow() < this.countdownGoUntil) return 'countdown';
    if (phase === 'countdown') {
      const endsAt = this.gatewayState.match?.state.countdownEndsAt;
      if (endsAt !== null && endsAt !== undefined && this.serverNow() >= endsAt + 950) return null;
    }
    return phase === 'ready-check' || phase === 'draft' || phase === 'countdown'
      ? phase
      : null;
  }

  private reconcileAfterVisibilityRecovery(): void {
    if (document.hidden || this.destroyed) return;
    const snapshot = this.gatewayState.match;
    const board = snapshot?.state.draft?.board
      ? structuredClone(snapshot.state.draft.board) as DraftBoard
      : this.currentBoard;
    if (snapshot && board) {
      const phase = snapshot.state.phase;
      const countdownEndsAt = snapshot.state.countdownEndsAt;
      if (phase === 'countdown' && countdownEndsAt !== null && this.serverNow() >= countdownEndsAt) {
        this.startGatewayMatchLocally(snapshot, board, countdownEndsAt);
      } else if ((phase === 'running' || phase === 'finished') && snapshot.state.startedAt !== null) {
        this.startGatewayMatchLocally(snapshot, board, snapshot.state.startedAt);
      }
      if ((phase === 'running' || phase === 'finished') && this.serverNow() >= this.countdownGoUntil) {
        this.countdownGoUntil = 0;
        this.stopCountdownAnimation();
      }
    }
    if (this.gatewayState.status === 'error') this.gatewayClient.reconnect();
    this.ensureMounted();
    this.renderVisibility();
    this.renderStage();
    this.renderBoard();
  }

  private handleLauncherClick(): void {
    if (this.currentStagePhase()) return;
    const mainTab = this.mainPanelTab();
    if (this.settings.panelOpen && this.activeTab === mainTab) {
      this.closePanel();
      return;
    }
    this.openPanel(mainTab);
  }

  private createBoard(): HTMLDivElement {
    const board = element('div');
    board.id = 'skribbl-duels-board';
    board.dataset.scdRuntimeId = this.options.runtimeId;
    board.style.cssText = [
      'position:fixed',
      'z-index:2147483643',
      'width:330px',
      'background:var(--COLOR_PANEL_BG,var(--SCD_PANEL_BG))',
      'border:0',
      'border-radius:10px',
      'box-shadow:0 10px 34px rgba(0,0,0,.4)',
      'color:white',
      'transform-origin:top right',
      'overflow:hidden',
      'pointer-events:none'
    ].join(';');

    const header = element('div');
    header.style.cssText = 'display:flex;align-items:center;gap:6px;padding:7px 8px';
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
    const stagePhase = this.currentStagePhase();
    if (this.panel) this.panel.style.display = this.settings.panelOpen && !stagePhase ? 'block' : 'none';
    if (this.stage) this.stage.style.display = stagePhase ? 'block' : 'none';
    if (this.board) {
      const hasMatchBoard = this.matchState.phase !== 'idle' && this.matchState.fields.length > 0;
      this.board.style.display = this.settings.board.visible && hasMatchBoard && !stagePhase
        ? 'block'
        : 'none';
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

  private renderLauncherPosition(): void {
    if (!this.launcher) return;
    const settings = this.settings.launcher;
    const size = Math.max(36, Math.min(120, settings.size));
    const gap = 12;
    this.launcher.style.width = `${size}px`;
    this.launcher.style.height = `${size}px`;
    this.launcher.style.left = '';
    this.launcher.style.right = '';
    this.launcher.style.top = '';
    this.launcher.style.bottom = '';
    this.launcher.style.transform = '';
    if (settings.mode === 'custom') {
      this.launcher.style.left = `${Math.max(0, Math.min(window.innerWidth - size, settings.x))}px`;
      this.launcher.style.top = `${Math.max(0, Math.min(window.innerHeight - size, settings.y))}px`;
      return;
    }
    switch (settings.anchor) {
      case 'top-left':
        this.launcher.style.left = `${gap}px`;
        this.launcher.style.top = `${gap}px`;
        break;
      case 'top-center':
        this.launcher.style.left = '50%';
        this.launcher.style.top = `${gap}px`;
        this.launcher.style.transform = 'translateX(-50%)';
        break;
      case 'top-right':
        this.launcher.style.right = `${gap}px`;
        this.launcher.style.top = `${gap}px`;
        break;
      case 'center-left':
        this.launcher.style.left = `${gap}px`;
        this.launcher.style.top = '50%';
        this.launcher.style.transform = 'translateY(-50%)';
        break;
      case 'center-right':
        this.launcher.style.right = `${gap}px`;
        this.launcher.style.top = '50%';
        this.launcher.style.transform = 'translateY(-50%)';
        break;
      case 'bottom-left':
        this.launcher.style.left = `${gap}px`;
        this.launcher.style.bottom = `${gap}px`;
        break;
      case 'bottom-center':
        this.launcher.style.left = '50%';
        this.launcher.style.bottom = `${gap}px`;
        this.launcher.style.transform = 'translateX(-50%)';
        break;
      case 'bottom-right':
        this.launcher.style.right = `${gap}px`;
        this.launcher.style.bottom = `${gap}px`;
        break;
    }
  }

  private renderBoard(): void {
    if (!this.boardGrid || !this.board) return;
    const gatewayMatch = this.gatewayState.match;
    const gatewayDraft = gatewayMatch?.state.phase === 'draft' ? gatewayMatch.state.draft : null;
    if (gatewayDraft) {
      const columns = gatewayMatch?.state.format === 'casual' ? 3 : 5;
      this.boardGrid.style.gridTemplateColumns = `repeat(${columns},minmax(0,1fr))`;
      this.boardGrid.replaceChildren(...this.createDraftProgressFields(gatewayDraft, this.settings.board.showNames));
      const score = this.board.querySelector<HTMLElement>('[data-role="score"]');
      if (score && gatewayMatch) {
        const selfAccountId = this.gatewayState.identity?.accountId;
        const self = gatewayMatch.state.participants.find(participant => participant.accountId === selfAccountId);
        const opponent = gatewayMatch.state.participants.find(participant => participant.accountId !== selfAccountId);
        score.textContent = `${self?.displayName ?? this.options.getSelfName()} · 0:0 · ${opponent?.displayName ?? 'Opponent'}`;
      }
      return;
    }
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
        this.tooltips.register(node, challengeTooltip(this.manifest, field.challengeId));
        if (field.status === 'pending') node.classList.add('pending');
        if (field.status === 'claimed' && field.owner) node.classList.add(field.owner);
        node.appendChild(this.createChallengeIcon(field.challengeId));
        if (this.settings.board.showNames) {
          node.appendChild(element('span', 'scd-field-name', challengeName(this.manifest, field.challengeId)));
        }
        this.boardGrid.appendChild(node);
      }
    }

    this.updateBoardScore();
  }

  private renderStage(): void {
    if (!this.stageBody) return;
    const match = this.gatewayState.match;
    const phase = this.currentStagePhase();
    this.stageBody.replaceChildren();
    if (!match || !phase) {
      this.stopCountdownAnimation();
      return;
    }
    if (phase === 'ready-check') {
      this.renderVersusStage(match);
      return;
    }
    if (phase === 'draft') {
      this.renderDraftStage(match);
      return;
    }
    this.renderCountdownStage(match);
  }

  private renderVersusStage(
    match: NonNullable<GatewayConnectionSnapshot['match']>
  ): void {
    if (!this.stageBody) return;
    const selfAccountId = this.gatewayState.identity?.accountId ?? null;
    const self = match.state.participants.find(participant => participant.accountId === selfAccountId);
    const opponent = match.state.participants.find(participant => participant.accountId !== selfAccountId);
    const versus = element('div', 'scd-versus');
    versus.appendChild(element(
      'strong',
      '',
      match.state.format === 'casual' ? 'Casual 3×3' : 'Ranked 5×5'
    ));
    const players = element('div', 'scd-versus-players');
    players.append(
      this.createVersusPlayer(self?.displayName ?? this.options.getSelfName(), Boolean(self?.ready), self ?? null),
      element('div', 'scd-versus-vs', 'VS'),
      this.createVersusPlayer(opponent?.displayName ?? 'Opponent', Boolean(opponent?.ready), opponent ?? null)
    );
    const deadline = element('div', 'scd-muted');
    this.registerDeadline(deadline, match.state.readyDeadlineAt, 'Ready check · ', 's');
    const actions = element('div', 'scd-ready-actions');
    const accepting = this.readySubmissionMatchId === match.matchId && !self?.ready;
    const cancelling = this.cancellationSubmissionMatchId === match.matchId;
    const ready = element('button', 'scd-button primary scd-ready-action') as HTMLButtonElement;
    ready.type = 'button';
    ready.append(
      this.createIconAsset('challenge-icons/checkmark.gif', '✓', 'Ready'),
      element('span', '', self?.ready ? 'Ready' : accepting ? 'Accepting…' : 'Ready')
    );
    ready.disabled = Boolean(self?.ready) || accepting || cancelling;
    ready.setAttribute('aria-busy', accepting ? 'true' : 'false');
    bindReliableButtonAction(ready, () => this.submitReadyCheck(match.matchId));
    const cancel = element('button', 'scd-button danger scd-ready-action') as HTMLButtonElement;
    cancel.type = 'button';
    cancel.append(
      this.createIconAsset('challenge-icons/crossmark.gif', '×', 'Cancel'),
      element('span', '', cancelling ? 'Cancelling…' : 'Cancel')
    );
    cancel.disabled = cancelling;
    cancel.setAttribute('aria-busy', cancelling ? 'true' : 'false');
    bindReliableButtonAction(cancel, () => this.cancelReadyCheck(match.matchId));
    actions.append(ready, cancel);
    versus.append(players, deadline, actions);
    if (this.matchmakingError) versus.appendChild(element('div', 'scd-auth-error', this.matchmakingError));
    this.stageBody.appendChild(versus);
  }

  private createVersusPlayer(
    displayName: string,
    ready: boolean,
    participant: GatewayMatchmakingParticipant | null
  ): HTMLDivElement {
    const player = element('div', 'scd-versus-player');
    const avatar = this.createParticipantAvatar(displayName, participant, 'scd-versus-avatar');
    const status = element('div', 'scd-ready-state');
    status.append(
      this.createIconAsset(
        ready ? 'challenge-icons/checkmark.gif' : 'challenge-icons/crossmark.gif',
        ready ? '✓' : '×',
        ready ? 'Ready' : 'Not ready'
      ),
      element('span', '', ready ? 'Ready' : 'Not ready')
    );
    player.append(
      avatar,
      element('div', 'scd-versus-name', displayName),
      status
    );
    return player;
  }

  private createParticipantAvatar(
    displayName: string,
    participant: GatewayMatchmakingParticipant | null,
    className = 'scd-result-avatar'
  ): HTMLDivElement {
    const avatar = element(
      'div',
      `avatar fit scd-avatar-fallback ${className}`,
      displayName.slice(0, 1).toUpperCase()
    );
    const avatarUrl = participant?.avatarSource === 'discord' ? participant.avatarUrl : null;
    if (avatarUrl) {
      avatar.classList.remove('scd-avatar-fallback');
      avatar.classList.add('scd-avatar-discord');
      const image = element('img') as HTMLImageElement;
      image.src = avatarUrl;
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      image.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
      image.addEventListener('load', () => {
        avatar.textContent = '';
        avatar.appendChild(image);
      }, { once: true });
      image.addEventListener('error', () => {
        image.remove();
        avatar.classList.remove('scd-avatar-discord');
        avatar.classList.add('scd-avatar-fallback');
      }, { once: true });
      avatar.appendChild(image);
    }
    if (!avatarUrl && participant?.avatarSource === 'skribbl' && participant.skribblAvatar) {
      avatar.textContent = '';
      avatar.classList.remove('scd-avatar-fallback');
      avatar.classList.add('scd-avatar-skribbl');
      avatar.appendChild(this.createSkribblAvatar(
        participant.skribblAvatar,
        `${displayName} Skribbl avatar`
      ));
    }
    return avatar;
  }

  private renderDraftStage(
    match: NonNullable<GatewayConnectionSnapshot['match']>
  ): void {
    if (!this.stageBody) return;
    const draft = match.state.draft;
    if (!draft) {
      this.stageBody.appendChild(element('div', 'scd-auth-error', 'The Gateway draft snapshot is incomplete. Reconnect before making a selection.'));
      return;
    }
    const selfAccountId = this.gatewayState.identity?.accountId ?? null;
    const self = match.state.participants.find(participant => participant.accountId === selfAccountId);
    const opponent = match.state.participants.find(participant => participant.accountId !== selfAccountId);
    const shell = element('div', 'scd-draft-stage');
    shell.appendChild(this.createStageBoard(
      draft,
      match.state.format,
      `${self?.displayName ?? this.options.getSelfName()} · 0:0 · ${opponent?.displayName ?? 'Opponent'}`
    ));

    const controls = element('div', 'scd-draft-controls');
    const options = element('div', 'scd-draft-options');
    const info = element('div', 'scd-draft-info');
    if (draft.status === 'selecting') {
      const current = match.state.participants.find(participant => participant.accountId === draft.turnAccountId);
      const ownTurn = draft.turnAccountId === selfAccountId;
      if (ownTurn) {
        draft.offeredChallengeIds.forEach((challengeId, index) => {
          const entry = this.manifest.entries.find(item => item.id === challengeId);
          if (!entry) return;
          const button = element('button', 'scd-draft-option') as HTMLButtonElement;
          button.type = 'button';
          button.dataset.challengeId = entry.id;
          button.disabled = this.draftSubmissionKey === `${match.matchId}:${match.revision}`;
          button.append(
            this.createChallengeIcon(entry.id),
            element('span', 'scd-field-name', entry.name),
            element('span', 'scd-draft-option-key', index === 0 ? '← Arrow Left' : 'Arrow Right →')
          );
          button.addEventListener('click', () => this.submitDraftSelection(index));
          this.tooltips.register(button, `${entry.name}\n${entry.description}`);
          options.appendChild(button);
        });
      } else {
        for (let index = 0; index < 2; index += 1) {
          const waiting = element('button', 'scd-draft-option') as HTMLButtonElement;
          waiting.type = 'button';
          waiting.disabled = true;
          waiting.append(
            element('span', 'scd-field-icon', '?'),
            element('span', 'scd-field-name', 'Opponent selection')
          );
          options.appendChild(waiting);
        }
      }
      const deadline = element('div', ownTurn ? '' : 'scd-muted');
      this.registerDeadline(
        deadline,
        draft.selectionDeadlineAt,
        ownTurn ? 'Your selection · ' : `${current?.displayName ?? 'Opponent'} is selecting · `,
        's remaining'
      );
      info.appendChild(deadline);
    } else if (draft.status === 'finalizing') {
      const status = element('div');
      this.registerDeadline(status, draft.finalRevealAt, 'Server is selecting the final challenge · ', 's', 1);
      info.appendChild(status);
    } else {
      info.appendChild(element('div', '', 'Draft complete · preparing match'));
    }
    info.appendChild(element(
      'div',
      'scd-muted',
      `${match.state.format === 'casual' ? 'Casual 3×3' : 'Ranked 5×5'} draft against ${opponent?.displayName ?? 'Opponent'}`
    ));
    if (options.childElementCount > 0) controls.appendChild(options);
    controls.appendChild(info);
    shell.appendChild(controls);
    this.stageBody.appendChild(shell);
  }

  private renderCountdownStage(
    match: NonNullable<GatewayConnectionSnapshot['match']>
  ): void {
    if (!this.stageBody) return;
    const draft = match.state.draft;
    if (!draft) return;
    const score = element('span', 'scd-countdown-score');
    const countdownEndsAt = match.state.countdownEndsAt ?? this.countdownVisualEndsAt;
    this.registerDeadline(score, countdownEndsAt, 'Match starts in ', 's');
    const shell = element('div', 'scd-draft-stage');
    shell.appendChild(this.createStageBoard(draft, match.state.format, score));
    const flight = element('div', 'scd-countdown-flight');
    flight.dataset.scdCountdownEndsAt = String(countdownEndsAt);
    shell.appendChild(flight);
    this.stageBody.appendChild(shell);
    this.startCountdownAnimation();
  }

  private startCountdownAnimation(): void {
    if (this.countdownAnimationFrame !== null) return;
    const animate = (): void => {
      const flight = this.stage?.querySelector<HTMLElement>('[data-scd-countdown-ends-at]');
      if (!flight) {
        this.countdownAnimationFrame = null;
        return;
      }
      const countdownEndsAt = Number(flight.dataset.scdCountdownEndsAt);
      const remainingMs = countdownEndsAt - this.serverNow();
      const phase = remainingMs > 5_000
        ? 'waiting'
        : remainingMs > 0
          ? String(Math.ceil(remainingMs / 1000))
          : 'GO';
      if (flight.dataset.scdCountdownPhase !== phase) {
        flight.dataset.scdCountdownPhase = phase;
        flight.replaceChildren();
        if (phase !== 'waiting') {
          const phaseNode = element('div', `scd-countdown-phase${phase === 'GO' ? ' go' : ''}`);
          const assetPaths = phase === 'GO'
            ? [
              'challenge-icons/countdown_G.gif',
              'challenge-icons/countdown_O.gif',
              'challenge-icons/countdown_ExclamationMark.gif'
            ]
            : [`challenge-icons/countdown_${phase}.gif`];
          assetPaths.forEach((assetPath, index) => phaseNode.appendChild(this.createIconAsset(
            assetPath,
            phase === 'GO' ? ['G', 'O', '!'][index]! : phase,
            phase === 'GO' ? 'GO!' : phase
          )));
          flight.appendChild(phaseNode);
        }
      }
      if (this.serverNow() >= this.countdownGoUntil) {
        this.countdownAnimationFrame = null;
        this.renderVisibility();
        this.renderStage();
        return;
      }
      this.countdownAnimationFrame = window.requestAnimationFrame(animate);
    };
    this.countdownAnimationFrame = window.requestAnimationFrame(animate);
  }

  private stopCountdownAnimation(): void {
    if (this.countdownAnimationFrame !== null) window.cancelAnimationFrame(this.countdownAnimationFrame);
    this.countdownAnimationFrame = null;
  }

  private createStageBoard(
    draft: GatewayDraftState,
    format: 'casual' | 'ranked',
    score: string | HTMLElement
  ): HTMLDivElement {
    const board = element('div', 'scd-stage-board');
    const header = element('div', 'scd-stage-board-header');
    header.append(typeof score === 'string' ? document.createTextNode(score) : score);
    const grid = element('div', 'scd-stage-board-grid');
    grid.style.gridTemplateColumns = `repeat(${format === 'casual' ? 3 : 5},minmax(0,1fr))`;
    grid.append(...this.createDraftProgressFields(draft, this.settings.board.showNames));
    board.append(header, grid);
    return board;
  }

  private createDraftProgressFields(draft: GatewayDraftState, showNames: boolean): HTMLDivElement[] {
    const nodes: HTMLDivElement[] = [];
    for (let fieldIndex = 0; fieldIndex < draft.requiredPickCount; fieldIndex += 1) {
      const pick = draft.picks[fieldIndex];
      if (pick) {
        const node = element('div', 'scd-field drafted');
        const name = challengeName(this.manifest, pick.challengeId);
        const icon = this.createChallengeIcon(pick.challengeId);
        node.appendChild(icon);
        if (showNames) node.appendChild(element('span', 'scd-field-name', name));
        const source = pick.source === 'server-random' ? 'Selected randomly by the server' : 'Drafted';
        this.tooltips.register(node, `${source}: ${name}\n${challengeTooltip(this.manifest, pick.challengeId)}`);
        nodes.push(node);
        continue;
      }
      if (draft.status === 'finalizing' && fieldIndex === draft.picks.length) {
        const challengeId = this.currentDraftSlotChallengeId(draft);
        const name = challengeId ? challengeName(this.manifest, challengeId) : 'Server draw';
        const node = element('div', 'scd-field final-slot');
        const icon = challengeId
          ? this.createChallengeIcon(challengeId, 'scd-field-icon scd-final-slot-icon')
          : element('span', 'scd-field-icon scd-final-slot-icon', '?');
        const label = element('span', 'scd-field-name scd-final-slot-name', name);
        node.append(icon, label);
        this.tooltips.register(node, 'The server is randomly selecting the final parity field.');
        nodes.push(node);
        continue;
      }
      nodes.push(element('div', 'scd-field empty'));
    }
    return nodes;
  }

  private currentDraftSlotChallengeId(draft: GatewayDraftState): string | null {
    if (draft.status !== 'finalizing' || draft.finalCandidateChallengeIds.length === 0) return null;
    const index = Math.floor(this.serverNow() / 90) % draft.finalCandidateChallengeIds.length;
    return draft.finalCandidateChallengeIds[index] ?? null;
  }

  private tickDraftSlotAnimation(): void {
    const draft = this.gatewayState.match?.state.phase === 'draft'
      ? this.gatewayState.match.state.draft
      : null;
    if (!draft || draft.status !== 'finalizing') return;
    const challengeId = this.currentDraftSlotChallengeId(draft);
    if (!challengeId) return;
    const name = challengeName(this.manifest, challengeId);
    document.querySelectorAll<HTMLElement>('.scd-final-slot-name').forEach(node => {
      node.textContent = name;
    });
    document.querySelectorAll<HTMLElement>('.scd-final-slot-icon').forEach(node => {
      if (node.dataset.challengeId === challengeId) return;
      node.replaceWith(this.createChallengeIcon(
        challengeId,
        'scd-field-icon scd-final-slot-icon'
      ));
    });
  }

  private renderPanel(): void {
    if (!this.panel || !this.panelBody) return;
    const previousScrollTop = this.panelBody.scrollTop;
    const previousChatLog = this.panelBody.querySelector<HTMLElement>('[data-scd-chat-log="true"]');
    if (previousChatLog) {
      this.duelChatScrollTop = previousChatLog.scrollTop;
      this.duelChatStickToBottom = previousChatLog.scrollHeight - previousChatLog.scrollTop
        <= previousChatLog.clientHeight + 24;
    }
    const mainTab = this.mainPanelTab();
    const displayedTab = this.activeTab === 'settings' || this.activeTab === 'about'
      ? this.activeTab
      : mainTab;
    this.renderPanelAccountSummary();
    if (this.panelMainTab) {
      this.panelMainTab.textContent = mainTab === 'match' ? 'Match' : 'Duels';
      this.panelMainTab.dataset.tab = mainTab;
      this.panelMainTab.classList.toggle('active', displayedTab === mainTab);
    }
    this.panelBody.replaceChildren();
    switch (displayedTab) {
      case 'duel': this.renderDuelTab(); break;
      case 'match': this.renderMatchTab(); break;
      case 'settings': this.renderSettingsTab(); break;
      case 'about': this.renderAboutTab(); break;
    }
    this.panelBody.scrollTop = previousScrollTop;
  }

  private renderPanelAccountSummary(): void {
    if (!this.panelAccount) return;
    this.panelAccount.replaceChildren();
    const profile = this.authState.profile;
    if (this.authState.status === 'signed-in' && profile) {
      const duelDisplayName = this.gatewayState.identity?.displayName ?? profile.displayName;
      if (profile.avatarUrl) {
        const avatar = element('img', 'scd-auth-avatar') as HTMLImageElement;
        avatar.src = profile.avatarUrl;
        avatar.alt = '';
        avatar.referrerPolicy = 'no-referrer';
        this.panelAccount.appendChild(avatar);
      } else {
        const avatar = element('div', 'scd-auth-avatar', duelDisplayName.slice(0, 1).toUpperCase());
        avatar.style.cssText += ';display:grid;place-items:center;font-weight:900';
        this.panelAccount.appendChild(avatar);
      }
      const copy = element('div', 'scd-auth-copy');
      copy.append(
        element('div', 'scd-auth-name', duelDisplayName),
        element('div', 'scd-muted', `Discord: ${profile.username}`)
      );
      this.panelAccount.appendChild(copy);
      return;
    }
    this.panelAccount.append(
      element('div', 'scd-icon-fallback scd-auth-avatar', 'SD'),
      element('div', 'scd-muted', this.authState.status === 'initializing' ? 'Loading account…' : 'Discord sign-in required')
    );
  }

  private renderDuelTab(): void {
    if (!this.panelBody) return;
    const stack = element('div', 'scd-stack');
    if (this.gatewayState.match?.state.phase === 'draft') {
      stack.appendChild(this.createMatchmakingCard());
      this.panelBody.appendChild(stack);
      return;
    }
    const account = element('div', 'scd-card scd-stack');
    account.appendChild(element('strong', '', 'Skribbl Duels account'));
    if (this.authState.status === 'signed-in' && this.authState.profile) {
      const duelDisplayName = this.gatewayState.identity?.displayName ?? this.authState.profile.displayName;
      const profile = element('div', 'scd-auth-profile');
      if (this.authState.profile.avatarUrl) {
        const avatar = element('img', 'scd-auth-avatar') as HTMLImageElement;
        avatar.src = this.authState.profile.avatarUrl;
        avatar.alt = '';
        avatar.referrerPolicy = 'no-referrer';
        profile.appendChild(avatar);
      } else {
        const fallback = element('div', 'scd-auth-avatar', duelDisplayName.slice(0, 1).toUpperCase());
        fallback.style.cssText += ';display:grid;place-items:center;font-weight:900';
        profile.appendChild(fallback);
      }
      const copy = element('div', 'scd-auth-copy');
      copy.append(
        element('div', 'scd-auth-name', duelDisplayName),
        element('div', 'scd-auth-email', `Discord: ${this.authState.profile.username}`)
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
    if (this.gatewayState.error && this.gatewayState.status !== 'connected') {
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

    const matchmaking = this.createMatchmakingCard();

    stack.append(account, gatewayConnection, matchmaking);
    this.panelBody.appendChild(stack);
  }

  private createMatchmakingCard(): HTMLDivElement {
    const card = element('div', 'scd-card scd-stack');
    card.appendChild(element('strong', '', 'Homepage matchmaking'));
    const homepage = this.isHomepageVisible();
    const gatewayMatch = this.gatewayState.match;
    const queue = this.gatewayState.queue;
    const invite = this.gatewayState.invite;
    const connected = this.gatewayState.status === 'connected';
    const selfAccountId = this.gatewayState.identity?.accountId ?? null;

    if (!homepage) {
      card.appendChild(element('div', 'scd-muted', 'Matchmaking is available only on the Skribbl homepage. Return home before entering a queue.'));
    }
    if (this.matchmakingError) card.appendChild(element('div', 'scd-auth-error', this.matchmakingError));
    if (connected && this.gatewayState.error && this.gatewayState.error !== this.matchmakingError) {
      card.appendChild(element('div', 'scd-auth-error', this.gatewayState.error));
    }

    if (gatewayMatch) {
      const state = gatewayMatch.state;
      const opponent = state.participants.find(participant => participant.accountId !== selfAccountId);
      if (state.phase === 'ready-check' || state.phase === 'draft' || state.phase === 'countdown') {
        card.appendChild(element('div', 'scd-muted', 'The match start is active in the central Versus, Draft or Countdown view.'));
        return card;
      }
      if (state.phase === 'running') {
        card.append(
          element('div', '', `${state.format === 'casual' ? 'Casual 3×3' : 'Ranked 5×5'} match against ${opponent?.displayName ?? 'opponent'}`),
          element('div', 'scd-muted', `Started synchronously at ${formatTime(state.startedAt ?? this.serverNow())} · challenge board active`)
        );
        const open = element('button', 'scd-button primary', 'Open match') as HTMLButtonElement;
        open.type = 'button';
        open.addEventListener('click', () => this.openPanel('match'));
        card.appendChild(open);
        return card;
      }
      if (state.phase === 'finished' && state.conclusion) {
        const conclusion = state.conclusion;
        const summary = conclusion.outcome === 'draw'
          ? 'The Duel ended in a mutually agreed Draw.'
          : `${state.participants.find(item => item.accountId === conclusion.winnerAccountId)?.displayName ?? 'A player'} won${
              conclusion.reason === 'player-forfeit'
                ? ' by forfeit'
                : conclusion.reason === 'player-disconnect'
                  ? ' after the opponent disconnected'
                  : ''
            }.`;
        card.appendChild(element('div', '', summary));
        const open = element('button', 'scd-button primary', 'Open result') as HTMLButtonElement;
        open.type = 'button';
        open.addEventListener('click', () => this.openPanel('match'));
        card.appendChild(open);
        return card;
      }
      card.appendChild(element('div', 'scd-muted', `Previous match was cancelled: ${this.gatewayState.lastMatchEvent?.event.reason ?? 'superseded'}.`));
    }

    if (queue) {
      card.append(
        element('div', '', `Queued for ${queue.format === 'casual' ? 'Casual 3×3' : 'Ranked 5×5'}`),
        element('div', 'scd-muted', `Queue position: ${queue.position ?? '-'} · Waiting for a player in a separate Skribbl lobby flow.`)
      );
      const cancel = element('button', 'scd-button danger', 'Leave queue') as HTMLButtonElement;
      cancel.addEventListener('click', () => this.cancelMatchmaking());
      card.appendChild(cancel);
      return card;
    }

    if (invite?.status === 'waiting') {
      const info = element('div', 'scd-invite-info');
      info.append(
        element('div', '', `${invite.format === 'casual' ? 'Casual 3×3' : 'Ranked 5×5'} invite is ready`),
        element('div', 'scd-muted', `Single-use link · expires at ${formatTime(invite.expiresAt)}`)
      );
      const actions = element('div', 'scd-invite-controls');
      const link = element('input', 'scd-invite-link') as HTMLInputElement;
      link.type = 'text';
      link.readOnly = true;
      link.value = invite.token ? this.inviteUrl(invite.token) : '';
      link.placeholder = invite.token ? '' : 'Invite link unavailable after Gateway restart';
      link.setAttribute('aria-label', 'Single-use Duel invite link');
      const selectLink = (): void => link.select();
      link.addEventListener('focus', selectLink);
      link.addEventListener('click', selectLink);
      link.addEventListener('mouseup', event => {
        event.preventDefault();
        link.select();
      });
      const copy = element('button', 'scd-copy-button') as HTMLButtonElement;
      copy.type = 'button';
      copy.disabled = !invite.token;
      copy.addEventListener('click', () => void this.copyInviteLink(invite));
      copy.setAttribute('aria-label', 'Copy invite link');
      const copyIcon = document.createElement('img');
      copyIcon.src = '/img/link.svg';
      copyIcon.alt = '';
      copy.appendChild(copyIcon);
      this.tooltips.register(copy, 'Copy the single-use Duel invite link');
      const cancel = element('button', 'scd-button danger scd-invite-cancel', 'Cancel') as HTMLButtonElement;
      cancel.type = 'button';
      cancel.addEventListener('click', () => {
        if (invite.expiresAt <= this.serverNow()) {
          this.gatewayClient.dismissInvite(invite.inviteId);
          return;
        }
        this.gatewayClient.cancelInvite(invite.inviteId);
      });
      actions.append(link, copy, cancel);
      card.append(info, actions);
      if (!invite.token) {
        card.appendChild(element('div', 'scd-muted', 'The Gateway restored this invite after a restart. Cancel it and create a fresh link to copy its token again.'));
      }
      return card;
    }

    const row = element('div', 'scd-queue-row');
    const casual = element('button', 'scd-queue-button scd-queue-casual', 'Casual 3×3') as HTMLButtonElement;
    const ranked = element('button', 'scd-queue-button scd-queue-ranked', 'Ranked 5×5') as HTMLButtonElement;
    const inviteButton = element('button', 'scd-queue-button scd-invite-button') as HTMLButtonElement;
    inviteButton.type = 'button';
    const inviteIcon = document.createElement('img');
    inviteIcon.src = '/img/link.svg';
    inviteIcon.alt = '';
    inviteButton.append(inviteIcon, element('span', '', 'Invite'));
    casual.disabled = !homepage || !connected;
    ranked.disabled = !homepage || !connected;
    inviteButton.disabled = !homepage;
    casual.addEventListener('click', () => this.beginMatchmaking('casual'));
    ranked.addEventListener('click', () => this.beginMatchmaking('ranked'));
    inviteButton.addEventListener('click', () => void this.beginInviteCreation());
    this.tooltips.register(casual, 'Reset old match state and enter the server Casual queue');
    this.tooltips.register(ranked, 'Reset old match state and enter the server Ranked queue');
    this.tooltips.register(inviteButton, 'Create a single-use link for a real authenticated opponent');
    row.append(casual, ranked, inviteButton);
    card.appendChild(row);
    card.appendChild(element('div', 'scd-muted', connected
      ? 'The current Gateway test can supply a simulated queued opponent; the browser never invents the opponent itself.'
      : 'Connect the authenticated Gateway before entering matchmaking.'));
    return card;
  }

  private submitDraftSelection(index: 0 | 1 | number): void {
    const match = this.gatewayState.match;
    const selfAccountId = this.gatewayState.identity?.accountId;
    const draft = match?.state.phase === 'draft' ? match.state.draft : null;
    if (!match || !draft || draft.status !== 'selecting' || draft.turnAccountId !== selfAccountId) return;
    const challengeId = draft.offeredChallengeIds[index];
    if (!challengeId) return;
    const submissionKey = `${match.matchId}:${match.revision}`;
    if (this.draftSubmissionKey === submissionKey) return;
    try {
      this.gatewayClient.pickDraftChallenge(match.matchId, challengeId, match.revision);
      this.draftSubmissionKey = submissionKey;
      this.stage?.querySelectorAll<HTMLButtonElement>('.scd-draft-option').forEach(button => {
        button.disabled = true;
      });
    } catch (error) {
      this.matchmakingError = error instanceof Error ? error.message : String(error);
      this.renderStage();
    }
  }

  private handleDraftKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
    const target = event.target;
    if (target instanceof HTMLElement && (
      target.isContentEditable
      || target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
    )) return;
    const match = this.gatewayState.match;
    const draft = match?.state.phase === 'draft' ? match.state.draft : null;
    if (!match || !draft || draft.status !== 'selecting') return;
    if (draft.turnAccountId !== this.gatewayState.identity?.accountId) return;
    event.preventDefault();
    event.stopPropagation();
    this.submitDraftSelection(event.key === 'ArrowLeft' ? 0 : 1);
  }

  private renderMatchTab(): void {
    if (!this.panelBody) return;
    const self = this.matchState.participants.find(participant => participant.side === 'self');
    const opponent = this.matchState.participants.find(participant => participant.side === 'opponent');
    const stack = element('div', 'scd-stack');
    if (this.matchState.phase === 'finished') {
      stack.appendChild(this.createFinishedMatchSummary());
      this.panelBody.appendChild(stack);
      this.renderChatTab();
      return;
    }
    const status = element('div', 'scd-card scd-stack');
    status.append(
      element('strong', '', this.matchState.outcome === 'draw'
        ? 'Status: agreed Draw'
        : this.matchState.outcome === 'win'
          ? `Status: ${this.duelDisplayName(this.matchState.winner ?? 'opponent')} won`
          : `Status: ${this.matchState.phase}`),
      element('div', '', `${self?.displayName ?? this.options.getSelfName()} · ${this.matchState.scores.self}:${this.matchState.scores.opponent} · ${opponent?.displayName ?? 'Opponent'}`),
      element('div', 'scd-muted', 'Challenge claims are confirmed by the authoritative Gateway.')
    );
    stack.append(status);
    const gatewayMatch = this.gatewayState.match?.matchId === this.matchState.matchId
      ? this.gatewayState.match
      : null;
    if (this.matchState.phase === 'running'
        && this.pendingRestoredMatchId === this.matchState.matchId
        && this.gatewayState.status !== 'connected') {
      const restoring = element('div', 'scd-card scd-stack');
      restoring.append(
        element('strong', '', 'Restoring authoritative Match…'),
        element('div', 'scd-muted', 'Waiting for the Gateway result before Match actions are enabled.')
      );
      stack.appendChild(restoring);
    } else if (this.matchState.phase === 'running' && this.gatewayState.status !== 'connected') {
      const recovery = element('div', 'scd-card scd-stack');
      recovery.append(
        element('strong', '', 'Gateway connection interrupted'),
        element(
          'div',
          'scd-muted',
          'Challenge telemetry is retained while the Gateway reconnects. You can retry now or reconnect once to forfeit and end the match.'
        )
      );
      const actions = element('div', 'scd-match-actions');
      const reconnect = element('button', 'scd-button', 'Reconnect') as HTMLButtonElement;
      reconnect.type = 'button';
      reconnect.disabled = this.gatewayState.status === 'connecting';
      reconnect.addEventListener('click', () => this.gatewayClient.reconnect());
      const endMatch = element(
        'button',
        'scd-button danger',
        this.forfeitAfterReconnectMatchId ? 'Ending match…' : 'End Match'
      ) as HTMLButtonElement;
      endMatch.type = 'button';
      endMatch.disabled = this.forfeitAfterReconnectMatchId !== null;
      endMatch.addEventListener('click', async () => {
        if (!this.matchState.matchId) return;
        const confirmed = await this.showConfirmToast(
          'End this Duel?',
          'Skribbl Duels will reconnect once and forfeit. If the Gateway remains unavailable, the server closes the match after its reconnect grace period.',
          { confirm: 'End Match', cancel: 'Cancel' }
        );
        if (!confirmed || !this.matchState.matchId) return;
        this.forfeitAfterReconnectMatchId = this.matchState.matchId;
        this.gatewayClient.reconnect();
        this.renderPanel();
      });
      actions.append(reconnect, endMatch);
      recovery.appendChild(actions);
      const actionError = this.matchActionError ?? this.gatewayState.error;
      if (actionError) recovery.appendChild(element('div', 'scd-auth-error', actionError));
      stack.appendChild(recovery);
    } else if (gatewayMatch?.state.phase === 'running') {
      const proposal = gatewayMatch.state.drawProposal;
      const selfAccountId = this.gatewayState.identity?.accountId;
      const controls = element('div', 'scd-card scd-stack');
      controls.appendChild(element('strong', '', 'Match conclusion'));
      if (!proposal) {
        const actions = element('div', 'scd-match-actions');
        const propose = element('button', 'scd-button primary', 'Propose Draw') as HTMLButtonElement;
        propose.type = 'button';
        propose.addEventListener('click', () => this.runMatchAction(() =>
          this.gatewayClient.proposeDraw(gatewayMatch.matchId), propose));
        const forfeit = element('button', 'scd-button danger', 'Forfeit Duel') as HTMLButtonElement;
        forfeit.type = 'button';
        forfeit.addEventListener('click', async () => {
          const confirmed = await this.showConfirmToast(
            'Forfeit Duel?',
            'Your opponent will win immediately.',
            { confirm: 'Forfeit', cancel: 'Cancel' }
          );
          if (!confirmed) return;
          this.runMatchAction(() => this.gatewayClient.forfeitMatch(gatewayMatch.matchId), forfeit);
        });
        actions.append(propose, forfeit);
        controls.appendChild(actions);
      } else {
        const proposalCard = element('div', 'scd-card scd-stack scd-draw-proposal');
        const proposer = gatewayMatch.state.participants.find(item =>
          item.accountId === proposal.proposerAccountId
        );
        const ownProposal = proposal.proposerAccountId === selfAccountId;
        proposalCard.appendChild(element(
          'div',
          '',
          ownProposal
            ? 'Waiting for the opponent to accept the Draw.'
            : `${proposer?.displayName ?? 'Opponent'} proposed a Draw.`
        ));
        const deadline = element('div', 'scd-muted');
        this.registerDeadline(deadline, proposal.expiresAt, 'Proposal expires in ', 's');
        proposalCard.appendChild(deadline);
        const actions = element('div', 'scd-match-actions');
        if (ownProposal) {
          const withdraw = element('button', 'scd-button', 'Withdraw proposal') as HTMLButtonElement;
          withdraw.type = 'button';
          withdraw.addEventListener('click', () => this.runMatchAction(() =>
            this.gatewayClient.withdrawDraw(gatewayMatch.matchId, proposal.proposalId), withdraw));
          actions.appendChild(withdraw);
        } else {
          const accept = element('button', 'scd-button primary', 'Accept Draw') as HTMLButtonElement;
          accept.type = 'button';
          accept.addEventListener('click', () => this.runMatchAction(() =>
            this.gatewayClient.respondToDraw(gatewayMatch.matchId, proposal.proposalId, true), accept));
          const reject = element('button', 'scd-button danger', 'Reject') as HTMLButtonElement;
          reject.type = 'button';
          reject.addEventListener('click', () => this.runMatchAction(() =>
            this.gatewayClient.respondToDraw(gatewayMatch.matchId, proposal.proposalId, false), reject));
          actions.append(accept, reject);
        }
        proposalCard.appendChild(actions);
        controls.appendChild(proposalCard);
      }
      const actionError = this.matchActionError ?? this.gatewayState.error;
      if (actionError) controls.appendChild(element('div', 'scd-auth-error', actionError));
      stack.appendChild(controls);
    } else if (this.matchState.matchId?.startsWith('demo-') && this.matchState.phase === 'running') {
      const controls = element('div', 'scd-card scd-row');
      const selfClaim = element('button', 'scd-button', `Claim next for ${this.duelDisplayName('self')}`) as HTMLButtonElement;
      selfClaim.addEventListener('click', () => this.demoClaim('self'));
      const opponentClaim = element('button', 'scd-button', `Claim next for ${this.duelDisplayName('opponent')}`) as HTMLButtonElement;
      opponentClaim.addEventListener('click', () => this.demoClaim('opponent'));
      const reset = element('button', 'scd-button danger', 'Reset match') as HTMLButtonElement;
      reset.addEventListener('click', () => this.resetMatch());
      controls.append(selfClaim, opponentClaim, reset);
      stack.appendChild(controls);
    }
    this.panelBody.appendChild(stack);
    this.renderChatTab();
  }

  private createFinishedMatchSummary(): HTMLDivElement {
    const card = element('div', 'scd-card scd-result-card');
    const gatewayMatch = this.gatewayState.match?.matchId === this.matchState.matchId
      ? this.gatewayState.match
      : null;
    const selfAccountId = this.gatewayState.identity?.accountId;
    const winnerSide = this.matchState.winner;
    const winnerName = winnerSide ? this.duelDisplayName(winnerSide) : null;
    const winnerParticipant = winnerSide && gatewayMatch
      ? gatewayMatch.state.participants.find(participant =>
          winnerSide === 'self'
            ? participant.accountId === selfAccountId
            : participant.accountId !== selfAccountId) ?? null
      : null;
    const visual = element('div', 'scd-result-visual');
    if (winnerName) {
      const avatar = this.createParticipantAvatar(winnerName, winnerParticipant);
      avatar.appendChild(element('span', 'owner'));
      visual.append(avatar, element('span', 'scd-result-trophy'));
    } else {
      visual.appendChild(this.createIconAsset(
        'challenge-icons/skribbl-duels-logo.gif',
        'SD',
        'Agreed Draw'
      ));
    }

    const elapsedMs = Math.max(
      0,
      (this.matchState.finishedAt ?? Date.now()) - (this.matchState.startedAt ?? this.matchState.finishedAt ?? Date.now())
    );
    const title = element(
      'strong',
      'scd-result-title',
      winnerName
        ? `${winnerName} won after ${formatDurationWords(elapsedMs)}`
        : `Agreed Draw after ${formatDurationWords(elapsedMs)}`
    );
    const self = this.matchState.participants.find(participant => participant.side === 'self');
    const opponent = this.matchState.participants.find(participant => participant.side === 'opponent');
    const score = element(
      'div',
      'scd-result-score',
      `${self?.displayName ?? this.options.getSelfName()} · ${this.matchState.scores.self}:${this.matchState.scores.opponent} · ${opponent?.displayName ?? 'Opponent'}`
    );
    const actions = element('div', 'scd-result-actions');
    const returnButton = element('button', 'scd-button primary scd-result-return', 'Return') as HTMLButtonElement;
    returnButton.type = 'button';
    returnButton.addEventListener('click', () => {
      this.resetMatch();
      this.openPanel('duel');
    });
    const newMatch = element('button', 'scd-button primary scd-result-new', 'New Match') as HTMLButtonElement;
    newMatch.type = 'button';
    const homepageAvailable = this.isHomepageVisible();
    newMatch.disabled = !this.matchState.format || !homepageAvailable || this.gatewayState.status !== 'connected';
    if (!homepageAvailable) newMatch.title = 'Leave the active Skribbl lobby and return to the homepage first.';
    newMatch.addEventListener('click', () => {
      const format = this.matchState.format;
      if (format) this.beginMatchmaking(format);
    });
    const rematch = element('button', 'scd-button primary scd-result-rematch', 'Rematch') as HTMLButtonElement;
    rematch.type = 'button';
    const ownRematchReady = Boolean(selfAccountId
      && gatewayMatch?.state.rematchReadyAccountIds.includes(selfAccountId));
    rematch.disabled = !gatewayMatch
      || gatewayMatch.state.phase !== 'finished'
      || ownRematchReady
      || !homepageAvailable
      || this.gatewayState.status !== 'connected';
    if (!homepageAvailable) rematch.title = 'Leave the active Skribbl lobby and return to the homepage first.';
    if (ownRematchReady) rematch.textContent = 'Rematch requested';
    rematch.addEventListener('click', () => {
      if (!gatewayMatch || !this.isHomepageVisible()) return;
      this.runMatchAction(() => this.gatewayClient.requestRematch(gatewayMatch.matchId), rematch);
    });
    actions.append(returnButton, newMatch, rematch);
    card.append(visual, title, score, actions);
    const error = this.matchActionError ?? this.gatewayState.error;
    if (error) card.appendChild(element('div', 'scd-auth-error', error));
    return card;
  }

  private runMatchAction(action: () => string, button: HTMLButtonElement): void {
    this.matchActionError = null;
    button.disabled = true;
    try {
      action();
    } catch (error) {
      button.disabled = false;
      this.matchActionError = error instanceof Error ? error.message : String(error);
      this.renderPanel();
    }
  }

  private renderChatTab(): void {
    if (!this.panelBody) return;
    const stack = element('div', 'scd-stack');
    const log = element('div', 'scd-card scd-stack scd-chat-log');
    log.dataset.scdChatLog = 'true';
    if (this.duelChatMessages.length === 0) {
      log.appendChild(element('div', 'scd-muted', 'Private Duel channel. Messages are visible only to both matched players.'));
    } else {
      for (const message of this.duelChatMessages) {
        const winnerMessage = message.side === 'system' && message.id.startsWith('conclusion-')
          && this.matchState.outcome === 'win';
        const line = element('div', `scd-chat-line${message.side === 'system' ? ' system' : ''}${winnerMessage ? ' winner' : ''}`);
        const author = element('strong', '', `${message.author} `);
        author.style.color = winnerMessage
          ? 'var(--COLOR_CHAT_TEXT_OWNER,#ffa844)'
          : message.side === 'self'
          ? 'var(--SCD_SELF)'
          : message.side === 'opponent'
            ? 'var(--SCD_OPPONENT)'
            : 'var(--SCD_ACCENT)';
        line.append(author, document.createTextNode(message.message), element('small', 'scd-muted', ` · ${formatTime(message.occurredAt)}`));
        log.appendChild(line);
      }
    }
    log.addEventListener('scroll', () => {
      this.duelChatScrollTop = log.scrollTop;
      this.duelChatStickToBottom = log.scrollHeight - log.scrollTop <= log.clientHeight + 24;
      log.classList.toggle('has-overflow', log.scrollHeight > log.clientHeight + 1);
      log.classList.toggle('at-top', log.scrollTop <= 1);
    }, { passive: true });

    const form = element('form', 'scd-chat-form');
    const inputShell = element('div', 'scd-chat-input-shell');
    const input = element('input') as HTMLInputElement;
    input.dataset.scdDuelChatInput = 'true';
    const gatewayChatActive = this.gatewayState.status === 'connected'
      && this.gatewayState.match?.matchId === this.matchState.matchId
      && this.gatewayState.match.state.phase !== 'cancelled';
    input.placeholder = gatewayChatActive ? 'Private Duel message…' : 'Duel chat requires an active Gateway match';
    input.disabled = !gatewayChatActive;
    // Keep enough UTF-16 room for 300 astral Unicode code points; input handling
    // enforces the actual Contract limit.
    input.maxLength = 600;
    const count = element('span', 'scd-chat-characters', '0');
    const updateCount = (): void => {
      const codePoints = Array.from(input.value);
      if (codePoints.length > 300) input.value = codePoints.slice(0, 300).join('');
      count.textContent = String(Array.from(input.value).length);
      count.classList.toggle('visible', document.activeElement === input || input.value.length > 0);
    };
    input.addEventListener('input', updateCount);
    input.addEventListener('focus', updateCount);
    input.addEventListener('blur', updateCount);
    inputShell.append(input, count);
    const send = element('button', 'scd-button primary', 'Send') as HTMLButtonElement;
    send.type = 'submit';
    send.disabled = !gatewayChatActive;
    this.tooltips.register(send, 'Send a private Duel message once the gateway is connected');
    form.append(inputShell, send);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const message = input.value.trim();
      const matchId = this.gatewayState.match?.matchId;
      if (!message || !gatewayChatActive || !matchId) return;
      this.restoreDuelChatFocus = document.activeElement === input;
      try {
        this.duelChatStickToBottom = true;
        this.gatewayClient.sendDuelChat(matchId, message);
        input.value = '';
        updateCount();
        log.scrollTop = log.scrollHeight;
      } catch (error) {
        this.restoreDuelChatFocus = false;
        this.matchmakingError = error instanceof Error ? error.message : String(error);
        this.renderPanel();
      }
    });

    stack.append(log, form);
    this.panelBody.appendChild(stack);
    queueMicrotask(() => {
      if (!log.isConnected) return;
      log.scrollTop = this.duelChatStickToBottom ? log.scrollHeight : this.duelChatScrollTop;
      log.classList.toggle('has-overflow', log.scrollHeight > log.clientHeight + 1);
      log.classList.toggle('at-top', log.scrollTop <= 1);
    });
    if (this.restoreDuelChatFocus) {
      this.restoreDuelChatFocus = false;
      queueMicrotask(() => {
        this.panel?.querySelector<HTMLInputElement>('[data-scd-duel-chat-input="true"]')?.focus();
      });
    }
  }

  private handleDuelChatKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.scdDuelChatInput !== 'true') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      target.blur();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    target.form?.requestSubmit();
  }

  private renderSettingsTab(): void {
    if (!this.panelBody) return;
    const stack = element('div', 'scd-stack');
    const identity = this.gatewayState.identity;
    if (this.authState.status === 'signed-in' && identity) {
      const initialLanguage = profileLanguage(identity.preferredLanguage);
      const copy = PROFILE_COPY[initialLanguage];
      const profile = element('form', 'scd-card scd-stack') as HTMLFormElement;
      profile.noValidate = true;
      profile.appendChild(element('strong', '', copy.duelProfile));

      const nameField = element('div', 'scd-profile-field');
      const nameLabel = element('label', 'scd-label');
      const name = element('input') as HTMLInputElement;
      name.value = identity.displayName;
      name.minLength = 3;
      name.maxLength = 24;
      name.pattern = '[A-Za-z0-9]{3,24}';
      name.autocomplete = 'off';
      name.spellcheck = false;
      name.required = true;
      nameLabel.append(element('span', '', copy.displayName), name);
      const nameError = element('div', 'scd-profile-error');
      nameError.hidden = true;
      nameField.append(nameLabel, nameError);

      const languageLabel = element('label', 'scd-label');
      const language = element('select') as HTMLSelectElement;
      for (const [value, label] of [['en', 'English'], ['de', 'Deutsch']] as const) {
        const option = element('option') as HTMLOptionElement;
        option.value = value;
        option.textContent = label;
        option.selected = (identity.preferredLanguage ?? 'en') === value;
        language.appendChild(option);
      }
      languageLabel.append(element('span', '', copy.preferredLanguage), language);

      const avatarLabel = element('label', 'scd-label');
      const avatarSource = element('select') as HTMLSelectElement;
      for (const [value, label] of [['discord', copy.discordAvatar], ['skribbl', copy.skribblAvatar]] as const) {
        const option = element('option') as HTMLOptionElement;
        option.value = value;
        option.textContent = label;
        option.selected = (identity.avatarSource ?? 'discord') === value;
        avatarSource.appendChild(option);
      }
      avatarLabel.append(element('span', '', copy.versusAvatar), avatarSource);

      const entitlementText = [
        identity.specialAvatarId
          ? `${copy.specialEntitlement}: ${identity.specialAvatarId}`
          : copy.specialControlled,
        ...(identity.invisibleAvatarEntitled ? [`${copy.invisibleEntitlement}: enabled`] : [])
      ].join(' · ');
      const feedback = element('div', 'scd-muted', entitlementText);
      const save = element('button', 'scd-button primary', copy.save) as HTMLButtonElement;
      save.type = 'submit';
      const validateName = (): string | null => {
        const message = displayNameValidationMessage(name.value, profileLanguage(language.value));
        nameError.textContent = message ?? '';
        nameError.hidden = message === null;
        name.setAttribute('aria-invalid', String(message !== null));
        return message;
      };
      name.addEventListener('input', () => validateName());
      language.addEventListener('change', () => validateName());
      profile.addEventListener('submit', event => {
        event.preventDefault();
        if (validateName()) {
          name.focus();
          return;
        }
        let currentAvatar: [number, number, number, number] | null = null;
        try {
          const raw = localStorage.getItem('ava');
          const parsed = raw ? JSON.parse(raw) : null;
          if (Array.isArray(parsed) && parsed.length === 4 && parsed.every(Number.isInteger)) {
            currentAvatar = parsed.map(Number) as [number, number, number, number];
          }
        } catch { currentAvatar = null; }
        if (avatarSource.value === 'skribbl'
            && currentAvatar?.some(value => value < -1)
            && !identity.invisibleAvatarEntitled) {
          nameError.textContent = PROFILE_COPY[profileLanguage(language.value)].invisibleNotEntitled;
          nameError.hidden = false;
          return;
        }
        save.disabled = true;
        feedback.textContent = PROFILE_COPY[profileLanguage(language.value)].saving;
        void this.authClient.updateDuelProfile({
          displayName: name.value,
          preferredLanguage: language.value === 'de' ? 'de' : 'en',
          avatarSource: avatarSource.value === 'skribbl' ? 'skribbl' : 'discord',
          skribblAvatar: currentAvatar,
          specialAvatarId: avatarSource.value === 'skribbl' ? (identity.specialAvatarId ?? null) : null
        }).then(() => {
          feedback.textContent = PROFILE_COPY[profileLanguage(language.value)].saved;
          this.gatewayClient.reconnect();
        }).catch(error => {
          nameError.textContent = profileUpdateErrorMessage(error, profileLanguage(language.value));
          nameError.hidden = false;
          name.setAttribute('aria-invalid', 'true');
          save.disabled = false;
        });
      });
      profile.append(nameField, languageLabel, avatarLabel, feedback, save);
      stack.appendChild(profile);
    }
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

    const quickAccess = element('div', 'scd-card scd-stack');
    quickAccess.appendChild(element('strong', '', 'Quick access button'));
    const launcherModeLabel = element('label', 'scd-label');
    launcherModeLabel.appendChild(element('span', '', 'Position mode'));
    const launcherMode = element('select') as HTMLSelectElement;
    for (const [value, label] of [['anchor', 'Screen anchor'], ['custom', 'Custom coordinates']] as const) {
      const option = element('option') as HTMLOptionElement;
      option.value = value;
      option.textContent = label;
      option.selected = this.settings.launcher.mode === value;
      launcherMode.appendChild(option);
    }
    launcherMode.addEventListener('change', () => {
      this.settingsStore.updateLauncher({ mode: launcherMode.value === 'custom' ? 'custom' : 'anchor' });
      this.renderPanel();
    });
    launcherModeLabel.appendChild(launcherMode);
    quickAccess.appendChild(launcherModeLabel);

    const launcherAnchorLabel = element('label', 'scd-label');
    launcherAnchorLabel.appendChild(element('span', '', 'Anchor'));
    const launcherAnchor = element('select') as HTMLSelectElement;
    for (const anchor of anchors) {
      const option = element('option') as HTMLOptionElement;
      option.value = anchor;
      option.textContent = anchor.replaceAll('-', ' ');
      option.selected = this.settings.launcher.anchor === anchor;
      launcherAnchor.appendChild(option);
    }
    launcherAnchor.disabled = this.settings.launcher.mode !== 'anchor';
    launcherAnchor.addEventListener('change', () => this.settingsStore.updateLauncher({
      anchor: launcherAnchor.value as ProductUiSettings['launcher']['anchor']
    }));
    launcherAnchorLabel.appendChild(launcherAnchor);
    quickAccess.appendChild(launcherAnchorLabel);
    if (this.settings.launcher.mode === 'custom') {
      quickAccess.append(
        this.pixelRange('Horizontal position', this.settings.launcher.x, 0, Math.max(0, window.innerWidth - this.settings.launcher.size), value => this.settingsStore.updateLauncher({ x: value })),
        this.pixelRange('Vertical position', this.settings.launcher.y, 0, Math.max(0, window.innerHeight - this.settings.launcher.size), value => this.settingsStore.updateLauncher({ y: value }))
      );
    }
    quickAccess.appendChild(this.pixelRange(
      'Button size',
      this.settings.launcher.size,
      36,
      120,
      value => this.settingsStore.updateLauncher({ size: value })
    ));

    const resetBoard = element('button', 'scd-button', 'Reset UI settings') as HTMLButtonElement;
    resetBoard.addEventListener('click', () => {
      this.settingsStore.reset();
      this.renderPanel();
    });
    this.tooltips.register(resetBoard, 'Restore the default panel, board and Quick Access settings');
    quickAccess.appendChild(resetBoard);

    const chat = element('div', 'scd-card scd-stack');
    chat.append(
      element('strong', '', 'Game-chat integration'),
      this.checkbox('Show confirmed completion messages', this.settings.completionMessages, checked =>
        this.settingsStore.update({ completionMessages: checked })),
      this.checkbox('Show Match Chat toast notifications', this.settings.chatNotifications, checked =>
        this.settingsStore.update({ chatNotifications: checked })),
      this.checkbox('Play Win animation', this.settings.winAnimation, checked =>
        this.settingsStore.update({ winAnimation: checked }))
    );

    stack.append(board, quickAccess, chat);
    this.panelBody.appendChild(stack);
  }

  private renderAboutTab(): void {
    if (!this.panelBody) return;
    const stack = element('div', 'scd-stack');
    const rules = element('div', 'scd-card');
    rules.append(
      element('strong', '', 'How Skribbl Duels works'),
      element('p', 'scd-muted', 'Casual uses a 3×3 board; the first player to claim five challenges wins. Ranked uses a 5×5 board and requires thirteen claims.'),
      element('p', 'scd-muted', 'Both players draft the board from two choices at a time. The Gateway selects the final parity field and starts one synchronized ten-second countdown.')
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
      element('p', 'scd-muted', 'The normal Skribbl lobby and local telemetry continue. Duel-server forwarding, board mutation and new claims stop after a win, Forfeit or mutual Draw.')
    );
    const gateway = element('div', 'scd-card');
    gateway.append(
      element('strong', '', `Gateway Contract v${GATEWAY_CONTRACT_VERSION}`),
      element('p', 'scd-muted', `Client v${GATEWAY_CLIENT_VERSION} status: ${this.gatewayState.status}. The Gateway owns matchmaking, draft, countdown, claims, immediate Forfeit and explicitly accepted Draw proposals.`)
    );
    stack.append(rules, authentication, freeze, gateway);
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
      if (parsed.version !== 2 || !parsed.state) return null;
      return {
        version: 2,
        state: parsed.state,
        board: parsed.board && typeof parsed.board === 'object' ? parsed.board as DraftBoard : null
      };
    } catch {
      return null;
    }
  }

  private isHomepageVisible(): boolean {
    if (window.location.pathname !== '/') return false;
    const home = document.querySelector<HTMLElement>('#home');
    if (!home) return false;
    const style = getComputedStyle(home);
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && home.getClientRects().length > 0;
  }

  private beginMatchmaking(format: 'casual' | 'ranked'): string {
    this.matchmakingError = null;
    if (!this.isHomepageVisible()) {
      this.matchmakingError = 'Matchmaking can only start from the visible Skribbl homepage.';
      this.renderPanel();
      throw new Error(this.matchmakingError);
    }
    this.abortLocalMatch('new-matchmaking-request');
    try {
      const requestId = this.gatewayClient.joinMatchmaking(format);
      this.openPanel('duel');
      return requestId;
    } catch (error) {
      this.matchmakingError = error instanceof Error ? error.message : String(error);
      this.renderPanel();
      throw error;
    }
  }

  private async beginInviteCreation(): Promise<void> {
    this.matchmakingError = null;
    if (!this.isHomepageVisible()) {
      this.showSimpleToast('Invite unavailable', 'Return to the visible Skribbl homepage first.');
      return;
    }
    if (this.authState.status !== 'signed-in') {
      const connect = await this.showConfirmToast(
        'Discord authentication required',
        'Both players need a linked Discord account before a Duel invite can be created or accepted.',
        { confirm: 'Connect Discord', cancel: 'Cancel' }
      );
      if (connect) await this.authClient.signInWithDiscord();
      return;
    }
    if (this.gatewayState.status !== 'connected') {
      this.showSimpleToast('Gateway not connected', 'Reconnect the authenticated Gateway, then create the invite again.');
      return;
    }
    if (this.gatewayState.match) {
      this.showSimpleToast('Match already active', 'Return from or finish the current Duel before creating a new invite.');
      return;
    }
    const format = await this.showInviteFormatToast();
    if (!format) return;
    try {
      this.gatewayClient.createInvite(format);
    } catch (error) {
      this.matchmakingError = error instanceof Error ? error.message : String(error);
      this.renderPanel();
    }
  }

  private handleInviteGatewayState(
    previous: GatewayConnectionSnapshot,
    state: GatewayConnectionSnapshot
  ): void {
    const invite = state.invite;
    if (invite?.status === 'waiting' && invite.token
        && (previous.invite?.inviteId !== invite.inviteId || this.copiedInviteId !== invite.inviteId)) {
      this.copiedInviteId = invite.inviteId;
      void this.copyInviteLink(invite);
    }
    if (state.match && this.pendingInviteToken) {
      this.pendingInviteToken = null;
      this.inviteAcceptanceSubmitted = false;
      const url = new URL(window.location.href);
      url.searchParams.delete('scd-invite');
      window.history.replaceState(window.history.state, '', url);
      return;
    }
    if (this.inviteAcceptanceSubmitted
        && this.pendingInviteToken
        && state.error
        && state.error !== previous.error) {
      this.showSimpleToast('Invite could not be accepted', state.error, 6_000);
      this.pendingInviteToken = null;
      this.inviteAcceptanceSubmitted = false;
      const url = new URL(window.location.href);
      url.searchParams.delete('scd-invite');
      window.history.replaceState(window.history.state, '', url);
      return;
    }
    if (state.status === 'connected'
        && this.pendingInviteToken
        && !this.inviteAcceptanceSubmitted
        && !state.match) {
      this.inviteAcceptanceSubmitted = true;
      try {
        this.gatewayClient.acceptInvite(this.pendingInviteToken);
        this.showSimpleToast('Duel invite', 'Invite submitted. Waiting for the authoritative Ready check…');
      } catch (error) {
        this.inviteAcceptanceSubmitted = false;
        this.showSimpleToast('Invite could not be accepted', error instanceof Error ? error.message : String(error));
      }
    }
  }

  private handleInviteAuthenticationState(): void {
    if (!this.pendingInviteToken
        || this.authState.status === 'initializing'
        || this.authState.status === 'signed-in'
        || this.inviteAuthPrompted) return;
    this.inviteAuthPrompted = true;
    void this.showConfirmToast(
      'Discord authentication required',
      'This Duel link is single-use. Connect Discord to authenticate with the Gateway, or cancel the invite.',
      { confirm: 'Connect Discord', cancel: 'Cancel invite' }
    ).then(async connect => {
      if (connect) {
        await this.authClient.signInWithDiscord();
        return;
      }
      this.pendingInviteToken = null;
      const url = new URL(window.location.href);
      url.searchParams.delete('scd-invite');
      window.history.replaceState(window.history.state, '', url);
    });
  }

  private async copyInviteLink(invite: GatewayInviteStatusMessage): Promise<void> {
    if (!invite.token) return;
    const inviteUrl = this.inviteUrl(invite.token);
    let copied = false;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      copied = true;
    } catch {
      const input = document.createElement('textarea');
      input.value = inviteUrl;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      copied = document.execCommand('copy');
      input.remove();
    }
    this.showSimpleToast(
      copied ? 'Duel invite copied' : 'Duel invite ready',
      copied
        ? 'Send the single-use link to one authenticated friend.'
        : 'Automatic clipboard access was blocked. Use Copy link in the Duels Hub.'
    );
  }

  private inviteUrl(token: string): string {
    const url = new URL('/', window.location.origin);
    url.searchParams.set('scd-invite', token);
    return url.toString();
  }

  private cancelMatchmaking(): string {
    this.matchmakingError = null;
    try {
      const requestId = this.gatewayClient.leaveMatchmaking();
      this.abortLocalMatch('matchmaking-cancelled');
      return requestId;
    } catch (error) {
      this.matchmakingError = error instanceof Error ? error.message : String(error);
      this.renderPanel();
      throw error;
    }
  }

  private submitReadyCheck(matchId: string): void {
    const snapshot = this.gatewayState.match;
    const selfAccountId = this.gatewayState.identity?.accountId;
    const self = snapshot?.state.participants.find(participant => participant.accountId === selfAccountId);
    if (!snapshot
        || snapshot.matchId !== matchId
        || snapshot.state.phase !== 'ready-check'
        || self?.ready
        || this.readySubmissionMatchId === matchId
        || this.cancellationSubmissionMatchId === matchId) return;
    this.matchmakingError = null;
    this.clearReadySubmission();
    this.readySubmissionMatchId = matchId;
    this.renderStage();
    try {
      this.gatewayClient.setReady(matchId, true);
    } catch (error) {
      this.clearReadySubmission();
      this.matchmakingError = error instanceof Error ? error.message : String(error);
      this.renderStage();
      return;
    }
    this.readySubmissionTimer = window.setTimeout(() => {
      this.readySubmissionTimer = null;
      if (this.readySubmissionMatchId !== matchId) return;
      const current = this.gatewayState.match;
      const currentSelf = current?.state.participants.find(participant =>
        participant.accountId === this.gatewayState.identity?.accountId
      );
      if (!current || current.matchId !== matchId || current.state.phase !== 'ready-check' || currentSelf?.ready) {
        this.readySubmissionMatchId = null;
        return;
      }
      this.readySubmissionMatchId = null;
      this.matchmakingError = 'Ready confirmation timed out. Please try again.';
      this.renderStage();
    }, 4_000);
  }

  private cancelReadyCheck(matchId: string): void {
    const snapshot = this.gatewayState.match;
    if (!snapshot
        || snapshot.matchId !== matchId
        || snapshot.state.phase !== 'ready-check'
        || this.cancellationSubmissionMatchId === matchId) return;
    this.matchmakingError = null;
    this.clearCancellationSubmission();
    this.cancellationSubmissionMatchId = matchId;
    this.renderStage();
    try {
      this.cancelMatchmaking();
      this.settingsStore.update({ panelOpen: true, panelTab: 'duel' });
    } catch (error) {
      this.clearCancellationSubmission();
      this.matchmakingError = error instanceof Error ? error.message : String(error);
      this.renderStage();
      return;
    }
    this.cancellationSubmissionTimer = window.setTimeout(() => {
      this.cancellationSubmissionTimer = null;
      if (this.cancellationSubmissionMatchId !== matchId) return;
      const current = this.gatewayState.match;
      if (!current || current.matchId !== matchId || current.state.phase !== 'ready-check') {
        this.cancellationSubmissionMatchId = null;
        return;
      }
      this.cancellationSubmissionMatchId = null;
      this.matchmakingError = 'Ready-check cancellation timed out. Reconnecting…';
      this.renderStage();
      this.gatewayClient.reconnect();
    }, 4_000);
  }

  private clearReadySubmission(): void {
    if (this.readySubmissionTimer !== null) window.clearTimeout(this.readySubmissionTimer);
    this.readySubmissionTimer = null;
    this.readySubmissionMatchId = null;
  }

  private clearCancellationSubmission(): void {
    if (this.cancellationSubmissionTimer !== null) window.clearTimeout(this.cancellationSubmissionTimer);
    this.cancellationSubmissionTimer = null;
    this.cancellationSubmissionMatchId = null;
  }

  private handleGatewayMatchState(state: GatewayConnectionSnapshot): void {
    const snapshot = state.match;
    if (state.error) {
      this.clearReadySubmission();
      this.clearCancellationSubmission();
      this.matchmakingError = state.error;
    }
    if (!snapshot) {
      this.clearReadySubmission();
      this.clearCancellationSubmission();
      this.readyDeadlineRecoveryAt = 0;
      if (!state.queue) {
        const previousMatchId = this.lastGatewayMatchId;
        if (previousMatchId !== null
            && state.status === 'connected'
            && this.matchState.matchId === previousMatchId
            && this.matchState.phase !== 'idle'
            && this.matchState.phase !== 'finished') {
          this.abortLocalMatch('gateway-match-no-longer-authoritative');
          this.showSimpleToast(
            'Duel ended while disconnected',
            'The Gateway no longer has an active result snapshot. Local Challenge tracking has been stopped.',
            6_000
          );
        } else if (previousMatchId !== null && state.status !== 'connected') {
          this.abortLocalMatch('gateway-match-connection-lost');
        }
        this.lastGatewayMatchId = null;
      }
      return;
    }
    if (snapshot.matchId === this.pendingRestoredMatchId) {
      if (snapshot.state.phase === 'finished') {
        this.suppressExternalConclusionForMatchIds.add(snapshot.matchId);
      }
      this.pendingRestoredMatchId = null;
    }
    if (snapshot.matchId !== this.lastGatewayMatchId) {
      this.clearReadySubmission();
      this.clearCancellationSubmission();
      this.readyDeadlineRecoveryAt = 0;
      const restoresPersistedMatch = snapshot.matchId === this.matchState.matchId
        && this.currentBoard?.boardId === snapshot.state.draft?.board?.boardId;
      if (!restoresPersistedMatch) {
        this.abortLocalMatch('gateway-match-superseded-local-state');
      }
      this.lastGatewayMatchId = snapshot.matchId;
    }
    if (snapshot.state.phase !== 'ready-check') {
      this.clearReadySubmission();
      this.clearCancellationSubmission();
      this.readyDeadlineRecoveryAt = 0;
    } else {
      const selfAccountId = state.identity?.accountId;
      const self = snapshot.state.participants.find(participant => participant.accountId === selfAccountId);
      if (self?.ready) this.clearReadySubmission();
    }
    if (this.currentStagePhase() && this.settings.panelOpen) {
      this.settingsStore.update({ panelOpen: false });
    }
    if (snapshot.state.phase === 'cancelled') {
      this.abortLocalMatch('gateway-match-cancelled');
      return;
    }
    const gatewayBoard = snapshot.state.draft?.board;
    let validatedBoard: DraftBoard | null = null;
    if (gatewayBoard && this.currentBoard?.boardId !== gatewayBoard.boardId) {
      const board: DraftBoard = structuredClone(gatewayBoard);
      const issues = validateDraftBoard(board, this.manifest, { available: ALL_CAPABILITIES });
      if (issues.length > 0) {
        this.matchmakingError = `Gateway board validation failed: ${issues.map(issue => issue.message).join(' ')}`;
        return;
      }
      this.currentBoard = board;
      validatedBoard = board;
    }
    const board = validatedBoard ?? this.currentBoard;
    if (snapshot.state.phase === 'countdown' && board && snapshot.state.countdownEndsAt !== null) {
      this.prepareGatewayCountdown(snapshot, board);
      return;
    }
    if ((snapshot.state.phase === 'running' || snapshot.state.phase === 'finished')
        && board && snapshot.state.startedAt !== null) {
      this.clearMatchStartTimer();
      this.startGatewayMatchLocally(snapshot, board, snapshot.state.startedAt);
      this.synchronizeGatewayClaims(snapshot);
      this.resumeDeferredTelemetry(snapshot.matchId);
      this.flushPendingClaimCandidates();
    }
  }

  private handleGatewayRealtimeState(state: GatewayConnectionSnapshot): void {
    const ack = state.telemetryAck;
    if (ack) {
      this.telemetryGateway.synchronizeSequence(ack.matchId, ack.lastSequence);
      this.resumeDeferredTelemetry(ack.matchId);
      this.flushPendingClaimCandidates();
    }
    for (const message of state.duelChatMessages) {
      if (this.processedGatewayChatIds.has(message.messageId)) continue;
      if (message.matchId !== this.matchState.matchId) continue;
      this.processedGatewayChatIds.add(message.messageId);
      const ownMessage = message.authorAccountId === state.identity?.accountId;
      this.duelChatMessages.push({
        id: message.messageId,
        side: ownMessage ? 'self' : 'opponent',
        author: message.authorDisplayName,
        message: message.message,
        occurredAt: message.occurredAt
      });
      if (ownMessage) this.duelChatStickToBottom = true;
      if (!ownMessage
          && this.settings.chatNotifications
          && message.occurredAt >= this.chatNotificationStartedAt - 5_000
          && (!this.settings.panelOpen || this.mainPanelTab() !== 'match' || document.hidden)) {
        this.showChatToast(message.authorAccountId, message.authorDisplayName, message.message);
      }
    }
    const resolution = state.lastClaimResolution;
    if (resolution) this.handleGatewayClaimResolution(resolution);
  }

  private showChatToast(authorAccountId: string, author: string, message: string): void {
    const participant = this.gatewayState.match?.state.participants.find(item =>
      item.accountId === authorAccountId
    ) ?? null;
    const profile = element('div', 'scd-toast-profile');
    profile.append(
      this.createParticipantAvatar(author, participant, 'scd-toast-avatar'),
      element('strong', '', author)
    );
    this.showSimpleToast(profile, message, 3_500, () => {
      this.openPanel('match');
      queueMicrotask(() => {
        this.panel?.querySelector<HTMLInputElement>('[data-scd-duel-chat-input="true"]')?.focus();
      });
    });
  }

  private showSimpleToast(
    title: string | HTMLElement,
    message: string,
    timeout = 3_500,
    onClick?: () => void
  ): void {
    let container = document.querySelector<HTMLElement>('.typo-toast-container');
    if (!container) {
      container = element('div', 'typo-toast-container');
      container.dataset.scdRuntimeId = this.options.runtimeId;
      (document.body ?? document.documentElement).prepend(container);
    }
    const toast = element('div', 'typo-toast scd-duel-toast');
    toast.dataset.scdRuntimeId = this.options.runtimeId;
    const close = (): void => {
      if (!toast.isConnected || toast.classList.contains('closing')) return;
      toast.classList.add('closing');
      window.setTimeout(() => toast.remove(), 150);
    };
    const closeButton = element('span', 'close-toast', '×');
    closeButton.addEventListener('click', event => {
      event.stopPropagation();
      close();
    });
    const titleNode = typeof title === 'string' ? element('h3', '', title) : title;
    toast.append(
      titleNode,
      closeButton,
      element('span', '', message)
    );
    if (onClick) {
      toast.classList.add('clickable');
      toast.addEventListener('click', () => {
        onClick();
        close();
      });
    }
    container.appendChild(toast);
    window.setTimeout(close, timeout);
  }

  private showInviteFormatToast(): Promise<'casual' | 'ranked' | null> {
    let container = document.querySelector<HTMLElement>('.typo-toast-container');
    if (!container) {
      container = element('div', 'typo-toast-container');
      container.dataset.scdRuntimeId = this.options.runtimeId;
      (document.body ?? document.documentElement).prepend(container);
    }
    return new Promise(resolve => {
      const toast = element('div', 'typo-toast scd-duel-toast');
      toast.dataset.scdRuntimeId = this.options.runtimeId;
      let settled = false;
      const settle = (format: 'casual' | 'ranked' | null): void => {
        if (settled) return;
        settled = true;
        toast.classList.add('closing');
        window.setTimeout(() => toast.remove(), 150);
        resolve(format);
      };
      const closeButton = element('span', 'close-toast', '×');
      closeButton.setAttribute('role', 'button');
      closeButton.tabIndex = 0;
      closeButton.addEventListener('click', () => settle(null));
      const actions = element('div', 'typo-toast-confirm');
      const casual = element('button', 'scd-button', 'Casual 3×3') as HTMLButtonElement;
      const ranked = element('button', 'scd-button', 'Ranked 5×5') as HTMLButtonElement;
      casual.type = 'button';
      ranked.type = 'button';
      casual.addEventListener('click', () => settle('casual'));
      ranked.addEventListener('click', () => settle('ranked'));
      actions.append(casual, ranked);
      toast.append(
        element('h3', '', 'Choose invite format'),
        closeButton,
        element('span', '', 'The invited player will enter the normal 30-second Ready check.'),
        actions
      );
      container.appendChild(toast);
      casual.focus();
    });
  }

  private showConfirmToast(
    title: string,
    content: string,
    naming: { confirm: string; cancel: string },
    timeout = 30_000
  ): Promise<boolean> {
    let container = document.querySelector<HTMLElement>('.typo-toast-container');
    if (!container) {
      container = element('div', 'typo-toast-container');
      container.dataset.scdRuntimeId = this.options.runtimeId;
      (document.body ?? document.documentElement).prepend(container);
    }

    return new Promise(resolve => {
      const toast = element('div', 'typo-toast scd-duel-toast');
      toast.dataset.scdRuntimeId = this.options.runtimeId;
      let settled = false;
      let timeoutTimer: number | null = null;
      const settle = (result: boolean): void => {
        if (settled) return;
        settled = true;
        if (timeoutTimer !== null) window.clearTimeout(timeoutTimer);
        toast.classList.add('closing');
        window.setTimeout(() => toast.remove(), 150);
        resolve(result);
      };
      timeoutTimer = window.setTimeout(() => settle(false), timeout);

      const closeButton = element('span', 'close-toast', '×');
      closeButton.setAttribute('role', 'button');
      closeButton.setAttribute('aria-label', naming.cancel);
      closeButton.tabIndex = 0;
      closeButton.addEventListener('click', () => settle(false));
      closeButton.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') settle(false);
      });

      const actions = element('div', 'typo-toast-confirm');
      const confirm = element('button', 'scd-button danger', naming.confirm) as HTMLButtonElement;
      confirm.type = 'button';
      confirm.addEventListener('click', () => settle(true));
      const cancel = element('button', 'scd-button', naming.cancel) as HTMLButtonElement;
      cancel.type = 'button';
      cancel.addEventListener('click', () => settle(false));
      actions.append(confirm, cancel);
      toast.append(element('h3', '', title), closeButton, element('span', '', content), actions);
      container.appendChild(toast);
      confirm.focus();
    });
  }

  private handleGatewayClaimResolution(resolution: GatewayClaimResolutionMessage): void {
    const key = `${resolution.matchId}:${resolution.ownerAccountId}:${resolution.candidateId}:${resolution.revision}:${resolution.accepted}`;
    if (this.processedClaimResolutionIds.has(key) || resolution.matchId !== this.matchState.matchId) return;
    this.processedClaimResolutionIds.add(key);
    const selfAccountId = this.gatewayState.identity?.accountId;
    const side: DuelPlayerSide = resolution.ownerAccountId === selfAccountId ? 'self' : 'opponent';
    const runtime = this.options.challengeEngine.getInstances().find(item =>
      item.challengeId === resolution.challengeId
    );
    if (!resolution.accepted || !resolution.claimId) {
      if (side === 'self' && runtime?.status === 'completion-pending') {
        this.options.challengeEngine.resolveCompletion(runtime.instanceId, {
          outcome: 'reopen',
          reason: resolution.reason ?? 'gateway-claim-rejected',
          resolvedAt: resolution.occurredAt
        });
      } else {
        this.matchStore.rejectPending(
          resolution.challengeId,
          resolution.reason ?? 'gateway-claim-rejected',
          resolution.occurredAt
        );
      }
      return;
    }

    if (side === 'self' && runtime?.status === 'completion-pending') {
      this.options.challengeEngine.resolveCompletion(runtime.instanceId, {
        outcome: 'claimed',
        claimId: resolution.claimId,
        reason: 'gateway-authoritative-claim',
        resolvedAt: resolution.occurredAt
      });
    } else {
      this.matchStore.confirmClaim(
        resolution.challengeId,
        resolution.claimId,
        side,
        resolution.occurredAt
      );
      this.insertCompletionOnce({
        claimId: resolution.claimId,
        side,
        playerName: this.duelDisplayName(side),
        challengeId: resolution.challengeId,
        challengeName: challengeName(this.manifest, resolution.challengeId),
        occurredAt: resolution.occurredAt
      });
    }
    if (runtime) this.options.challengeEngine.deactivate(runtime.instanceId, 'gateway-field-claimed');
  }

  private synchronizeGatewayClaims(
    snapshot: NonNullable<GatewayConnectionSnapshot['match']>
  ): void {
    const selfAccountId = this.gatewayState.identity?.accountId;
    for (const claim of [...snapshot.state.claims].sort((left, right) => left.revision - right.revision)) {
      const side: DuelPlayerSide = claim.ownerAccountId === selfAccountId ? 'self' : 'opponent';
      this.matchStore.confirmClaim(claim.challengeId, claim.claimId, side, claim.occurredAt);
      this.insertCompletionOnce({
        claimId: claim.claimId,
        side,
        playerName: this.duelDisplayName(side),
        challengeId: claim.challengeId,
        challengeName: challengeName(this.manifest, claim.challengeId),
        occurredAt: claim.occurredAt
      }, false);
      const runtime = this.options.challengeEngine.getInstances().find(item =>
        item.challengeId === claim.challengeId
      );
      if (runtime) this.options.challengeEngine.deactivate(runtime.instanceId, 'gateway-snapshot-field-claimed');
    }
    const conclusion = snapshot.state.conclusion;
    if (snapshot.state.phase === 'finished' && conclusion) {
      if (conclusion.outcome === 'draw') {
        this.matchStore.finishDraw(conclusion.reason, conclusion.occurredAt);
      } else if (conclusion.winnerAccountId) {
        const winner: DuelPlayerSide = conclusion.winnerAccountId === selfAccountId ? 'self' : 'opponent';
        this.matchStore.finishMatch(winner, conclusion.reason, conclusion.occurredAt);
      }
      this.scheduleConclusionPresentation(
        this.matchStore.getState(),
        conclusion.occurredAt
      );
    }
  }

  private flushForfeitAfterReconnect(state: GatewayConnectionSnapshot): void {
    const matchId = this.forfeitAfterReconnectMatchId;
    if (!matchId || state.status !== 'connected') return;
    if (!state.match || state.match.matchId !== matchId) {
      this.forfeitAfterReconnectMatchId = null;
      this.abortLocalMatch('interrupted-match-no-longer-resumable');
      return;
    }
    if (state.match.state.phase !== 'running') {
      this.forfeitAfterReconnectMatchId = null;
      return;
    }
    try {
      this.gatewayClient.forfeitMatch(matchId);
      this.forfeitAfterReconnectMatchId = null;
      this.matchActionError = null;
    } catch (error) {
      this.matchActionError = error instanceof Error ? error.message : String(error);
    }
  }

  private prepareGatewayCountdown(
    snapshot: NonNullable<GatewayConnectionSnapshot['match']>,
    board: DraftBoard
  ): void {
    const countdownEndsAt = snapshot.state.countdownEndsAt;
    if (countdownEndsAt === null) return;
    this.countdownVisualEndsAt = countdownEndsAt;
    this.countdownGoUntil = countdownEndsAt + 950;
    const participants = this.gatewayParticipants(snapshot);
    if (countdownEndsAt <= this.serverNow()) {
      this.startGatewayMatchLocally(snapshot, board, countdownEndsAt);
      return;
    }
    const alreadyPrepared = this.matchState.matchId === snapshot.matchId
      && this.matchState.boardId === board.boardId
      && this.matchState.phase === 'countdown'
      && this.matchState.countdownEndsAt === countdownEndsAt;
    if (!alreadyPrepared) {
      this.matchStore.prepareMatchCountdown(
        snapshot.matchId,
        board,
        participants,
        countdownEndsAt,
        this.serverNow()
      );
      this.settingsStore.updateBoard({ visible: true });
    }
    this.clearMatchStartTimer();
    this.matchStartTimer = window.setTimeout(() => {
      this.matchStartTimer = null;
      const current = this.gatewayState.match;
      if (!current || current.matchId !== snapshot.matchId || current.state.phase === 'cancelled') return;
      this.startGatewayMatchLocally(current, board, countdownEndsAt);
    }, Math.max(0, countdownEndsAt - this.serverNow()));
  }

  private startGatewayMatchLocally(
    snapshot: NonNullable<GatewayConnectionSnapshot['match']>,
    board: DraftBoard,
    startedAt: number
  ): void {
    if (this.matchState.matchId === snapshot.matchId
        && (this.matchState.phase === 'running' || this.matchState.phase === 'finished')) {
      this.reconcileBoardChallenges(snapshot.matchId, board, startedAt);
      const ack = this.gatewayState.telemetryAck;
      if (ack?.matchId === snapshot.matchId) {
        this.telemetryGateway.synchronizeSequence(ack.matchId, ack.lastSequence);
      }
      this.resumeDeferredTelemetry(snapshot.matchId);
      this.flushPendingClaimCandidates();
      return;
    }
    const participants = this.gatewayParticipants(snapshot);
    if (this.matchState.matchId === snapshot.matchId && this.matchState.phase === 'countdown') {
      this.matchStore.startPreparedMatch(snapshot.matchId, startedAt);
    } else {
      this.matchStore.startMatch(snapshot.matchId, board, participants, startedAt);
    }
    this.activateBoardChallenges(snapshot.matchId, board, startedAt, 'gateway-match-started');
    this.awaitingTelemetryResumeCursor = false;
    this.deferredTelemetryEvents = [];
    const ack = this.gatewayState.telemetryAck;
    if (ack?.matchId === snapshot.matchId) {
      this.telemetryGateway.synchronizeSequence(ack.matchId, ack.lastSequence);
    }
    this.settingsStore.updateBoard({ visible: true });
    this.settingsStore.update({ panelOpen: false, panelTab: 'match' });
  }

  private duelDisplayName(side: DuelPlayerSide): string {
    const localParticipant = this.matchState.participants.find(participant => participant.side === side);
    if (localParticipant) return localParticipant.displayName;
    const selfAccountId = this.gatewayState.identity?.accountId;
    const gatewayParticipant = this.gatewayState.match?.state.participants.find(participant =>
      side === 'self'
        ? participant.accountId === selfAccountId
        : participant.accountId !== selfAccountId
    );
    if (gatewayParticipant) return gatewayParticipant.displayName;
    if (side === 'self') {
      return this.gatewayState.identity?.displayName
        ?? this.authState.profile?.displayName
        ?? this.options.getSelfName();
    }
    return 'Opponent';
  }

  private gatewayParticipants(
    snapshot: NonNullable<GatewayConnectionSnapshot['match']>
  ): DuelParticipant[] {
    const selfAccountId = this.gatewayState.identity?.accountId;
    return snapshot.state.participants.map(participant => ({
      playerId: participant.accountId,
      displayName: participant.displayName,
      side: participant.accountId === selfAccountId ? 'self' : 'opponent'
    }));
  }

  private registerDeadline(
    node: HTMLElement,
    deadlineAt: number | null,
    prefix: string,
    suffix: string,
    decimals = 0
  ): void {
    const deadline = deadlineAt ?? this.serverNow();
    node.dataset.scdDeadline = String(deadline);
    node.dataset.scdDeadlinePrefix = prefix;
    node.dataset.scdDeadlineSuffix = suffix;
    node.dataset.scdDeadlineDecimals = String(decimals);
    this.updateDeadlineNode(node);
  }

  private updateDeadlineNode(node: HTMLElement): void {
    const deadline = Number(node.dataset.scdDeadline);
    const decimals = Number(node.dataset.scdDeadlineDecimals ?? '0');
    if (!Number.isFinite(deadline) || !Number.isInteger(decimals) || decimals < 0) return;
    const seconds = Math.max(0, (deadline - this.serverNow()) / 1000);
    const value = decimals === 0 ? String(Math.ceil(seconds)) : seconds.toFixed(decimals);
    node.textContent = `${node.dataset.scdDeadlinePrefix ?? ''}${value}${node.dataset.scdDeadlineSuffix ?? ''}`;
  }

  private tickGatewayClock(): void {
    for (const root of [this.panel, this.stage]) {
      root?.querySelectorAll<HTMLElement>('[data-scd-deadline]').forEach(node => {
        this.updateDeadlineNode(node);
      });
    }
    const snapshot = this.gatewayState.match;
    const deadline = snapshot?.state.phase === 'ready-check'
      ? snapshot.state.readyDeadlineAt
      : null;
    const now = this.serverNow();
    const invite = this.gatewayState.invite;
    if (invite?.status === 'waiting' && now >= invite.expiresAt) {
      this.gatewayClient.dismissInvite(invite.inviteId);
    }
    if (snapshot?.state.phase === 'ready-check'
        && deadline !== null
        && deadline !== undefined
        && now >= deadline + 1_000
        && now >= this.readyDeadlineRecoveryAt) {
      this.readyDeadlineRecoveryAt = now + 5_000;
      this.clearReadySubmission();
      this.clearCancellationSubmission();
      this.matchmakingError = 'Ready check expired. Reconnecting…';
      this.renderStage();
      this.gatewayClient.reconnect();
    }
  }

  private updateBoardScore(): void {
    const score = this.board?.querySelector<HTMLElement>('[data-role="score"]');
    if (!score) return;
    const self = this.matchState.participants.find(participant => participant.side === 'self');
    const opponent = this.matchState.participants.find(participant => participant.side === 'opponent');
    if (this.matchState.phase === 'countdown') {
      const remaining = Math.max(
        0,
        Math.ceil(((this.matchState.countdownEndsAt ?? this.serverNow()) - this.serverNow()) / 1000)
      );
      score.textContent = `${self?.displayName ?? this.options.getSelfName()} · 0:0 · ${opponent?.displayName ?? 'Opponent'} · ${remaining}s`;
      return;
    }
    score.textContent = this.matchState.phase === 'finished'
      ? `${self?.displayName ?? this.options.getSelfName()} · ${this.matchState.scores.self}:${this.matchState.scores.opponent} · ${opponent?.displayName ?? 'Opponent'} · frozen`
      : `${self?.displayName ?? this.options.getSelfName()} · ${this.matchState.scores.self}:${this.matchState.scores.opponent} · ${opponent?.displayName ?? 'Opponent'}`;
  }

  private activateBoardChallenges(
    matchId: string,
    board: DraftBoard,
    startedAt: number,
    reason: string
  ): void {
    this.options.challengeEngine.reset(reason);
    for (const field of board.fields) {
      this.options.challengeEngine.activate({
        instanceId: `duel-${matchId}-field-${field.fieldIndex}`,
        challengeId: field.challengeId,
        activatedAt: startedAt
      });
    }
  }

  private reconcileBoardChallenges(matchId: string, board: DraftBoard, startedAt: number): void {
    const expected = new Map(board.fields.map(field => [
      `duel-${matchId}-field-${field.fieldIndex}`,
      field
    ]));
    for (const runtime of this.options.challengeEngine.getInstances()) {
      if (!runtime.instanceId.startsWith(`duel-${matchId}-field-`)) continue;
      const field = expected.get(runtime.instanceId);
      if (field && runtime.challengeId === field.challengeId
          && runtime.definitionVersion === field.definitionVersion) {
        expected.delete(runtime.instanceId);
        continue;
      }
      this.options.challengeEngine.deactivate(runtime.instanceId, 'gateway-reconnect-board-reconciled');
    }
    for (const [instanceId, field] of expected) {
      this.options.challengeEngine.activate({
        instanceId,
        challengeId: field.challengeId,
        activatedAt: startedAt
      });
    }
  }

  private observeDuelTelemetry(event: TelemetryEvent): void {
    const state = this.matchStore.getState();
    if (this.awaitingTelemetryResumeCursor
        && state.phase === 'running'
        && state.matchId !== null) {
      this.deferredTelemetryEvents.push(structuredClone(event));
      if (this.deferredTelemetryEvents.length > 512) this.deferredTelemetryEvents.shift();
      return;
    }
    void this.telemetryGateway.observe(event);
  }

  private resumeDeferredTelemetry(matchId: string): void {
    if (!this.awaitingTelemetryResumeCursor || this.matchState.matchId !== matchId) return;
    const ack = this.gatewayState.telemetryAck;
    const snapshot = this.gatewayState.match;
    if (!ack || ack.matchId !== matchId
        || !snapshot || snapshot.matchId !== matchId
        || snapshot.state.phase !== 'running') return;
    this.telemetryGateway.synchronizeSequence(matchId, ack.lastSequence);
    this.awaitingTelemetryResumeCursor = false;
    const deferred = this.deferredTelemetryEvents.splice(0);
    for (const event of deferred) void this.telemetryGateway.observe(event);
  }

  private flushPendingClaimCandidates(): void {
    const match = this.gatewayState.match;
    if (!match || match.matchId !== this.matchState.matchId || match.state.phase !== 'running') return;
    for (const runtime of this.options.challengeEngine.getInstances()) {
      const candidate = runtime.completionCandidate;
      if (runtime.status !== 'completion-pending' || !candidate) continue;
      if (!this.matchState.fields.some(field => field.challengeId === runtime.challengeId)) continue;
      if (this.submittedClaimCandidateIds.has(candidate.candidateId)) continue;
      this.submittedClaimCandidateIds.add(candidate.candidateId);
      try {
        this.gatewayClient.submitClaimCandidate({
          matchId: match.matchId,
          candidateId: candidate.candidateId,
          challengeId: runtime.challengeId,
          definitionVersion: runtime.definitionVersion,
          evidenceEventIds: candidate.evidenceEventIds,
          occurredAt: candidate.completedAt,
          throughSequence: this.telemetryGateway.getLastSequence()
        });
      } catch {
        this.submittedClaimCandidateIds.delete(candidate.candidateId);
      }
    }
  }

  private serverNow(): number {
    return Date.now() + (this.gatewayState.serverTimeOffsetMs ?? 0);
  }

  private clearMatchStartTimer(): void {
    if (this.matchStartTimer !== null) window.clearTimeout(this.matchStartTimer);
    this.matchStartTimer = null;
  }

  private persistMatch(): void {
    try {
      if (this.matchState.phase === 'idle' && this.matchState.fields.length === 0) {
        sessionStorage.removeItem(this.matchStorageKey);
        return;
      }
      const value: PersistedProductMatch = {
        version: 2,
        state: this.matchState,
        board: this.currentBoard
      };
      sessionStorage.setItem(this.matchStorageKey, JSON.stringify(value));
    } catch (error) {
      console.warn('[Skribbl Duels Match Persistence] Persist failed', error);
    }
  }

  private abortLocalMatch(reason: string): MatchState {
    this.clearMatchStartTimer();
    this.stopCountdownAnimation();
    this.countdownVisualEndsAt = 0;
    this.countdownGoUntil = 0;
    this.currentBoard = null;
    this.duelChatMessages = [];
    this.processedGatewayChatIds.clear();
    this.processedClaimResolutionIds.clear();
    this.submittedClaimCandidateIds.clear();
    this.deferredTelemetryEvents = [];
    this.awaitingTelemetryResumeCursor = false;
    this.restoreDuelChatFocus = false;
    this.duelChatScrollTop = 0;
    this.duelChatStickToBottom = true;
    this.matchActionError = null;
    this.lastConclusionMessageMatchId = null;
    this.pendingConclusionMessageMatchId = null;
    this.pendingRestoredMatchId = null;
    this.suppressExternalConclusionForMatchIds.clear();
    this.forfeitAfterReconnectMatchId = null;
    if (this.conclusionPresentationTimer !== null) window.clearTimeout(this.conclusionPresentationTimer);
    this.conclusionPresentationTimer = null;
    this.lastWinAnimationMatchId = null;
    this.winAnimation?.remove();
    this.winAnimation = null;
    if (this.winAnimationTimer !== null) window.clearTimeout(this.winAnimationTimer);
    this.winAnimationTimer = null;
    this.chatAdapter.reset();
    this.telemetryGateway.resetSession();
    try { sessionStorage.removeItem(this.matchStorageKey); } catch {}
    const state = this.matchStore.reset(reason);
    this.options.challengeEngine.reset(reason);
    return state;
  }

  private resetMatch(): MatchState {
    const matchId = this.gatewayState.match?.matchId ?? null;
    if (this.gatewayState.status === 'connected' && (this.gatewayState.queue || this.gatewayState.match)) {
      try { this.gatewayClient.leaveMatchmaking(); } catch {}
    }
    if (matchId) this.gatewayClient.dismissMatch(matchId);
    return this.abortLocalMatch('manual-reset');
  }

  private openPanel(tab?: ProductUiSettings['panelTab']): void {
    if (this.currentStagePhase()) return;
    const requested = tab === 'chat' ? 'match' : tab;
    const resolved = requested === 'settings' || requested === 'about'
      ? requested
      : this.mainPanelTab();
    this.settingsStore.update({
      panelOpen: true,
      panelTab: resolved
    });
  }

  private closePanel(): void {
    this.settingsStore.update({ panelOpen: false });
  }

  private togglePanel(): void {
    this.handleLauncherClick();
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
    if (this.gatewayState.status === 'connected' && (this.gatewayState.queue || this.gatewayState.match)) {
      try { this.gatewayClient.leaveMatchmaking(); } catch {}
    }
    this.abortLocalMatch('new-demo-match');
    const result = this.generateBoard({ format });
    if (!result.board) {
      throw new Error(result.issues.map(issue => issue.message).join('\n'));
    }
    const participants: DuelParticipant[] = [
      { playerId: 'self', displayName: this.duelDisplayName('self'), side: 'self' },
      { playerId: 'opponent', displayName: 'QueueBot Pixel', side: 'opponent' }
    ];
    const matchId = `demo-${Date.now()}`;
    const startedAt = Date.now();
    const state = this.matchStore.startMatch(matchId, result.board, participants, startedAt);
    this.activateBoardChallenges(matchId, result.board, startedAt, 'demo-match-started');
    this.settingsStore.updateBoard({ visible: true });
    this.settingsStore.update({ panelOpen: false, panelTab: 'match' });
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
      playerName: this.duelDisplayName(side),
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
      const candidate = structuredClone(runtime.completionCandidate);
      this.matchStore.markPending(
        runtime.challengeId,
        candidate.candidateId,
        'self',
        event.occurredAt
      );
      queueMicrotask(() => this.flushPendingClaimCandidates());
      return;
    }

    if (event.type === 'CHALLENGE_CLAIMED' && runtime.claimId) {
      this.matchStore.confirmClaim(runtime.challengeId, runtime.claimId, 'self', event.occurredAt);
      this.insertCompletionOnce({
        claimId: runtime.claimId,
        side: 'self',
        playerName: this.duelDisplayName('self'),
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

  private scheduleConclusionPresentation(state: MatchState, occurredAt: number): void {
    const matchId = state.matchId;
    if (!matchId
        || this.lastConclusionMessageMatchId === matchId
        || this.pendingConclusionMessageMatchId === matchId) return;
    this.pendingConclusionMessageMatchId = matchId;
    const snapshot = structuredClone(state);
    const suppressExternal = this.suppressExternalConclusionForMatchIds.has(matchId);
    // Claim resolutions and the final MATCH_SNAPSHOT are separate Socket.IO
    // messages. Give all already accepted claims a short window to render so
    // the conclusion is always the final chat line.
    this.conclusionPresentationTimer = window.setTimeout(() => {
      this.conclusionPresentationTimer = null;
      this.pendingConclusionMessageMatchId = null;
      if (this.matchState.matchId !== matchId || this.lastConclusionMessageMatchId === matchId) return;
      const elapsedMs = Math.max(0, occurredAt - (snapshot.startedAt ?? occurredAt));
      this.lastConclusionMessageMatchId = matchId;
      this.insertConclusionMessage(snapshot, elapsedMs, occurredAt);
      this.suppressExternalConclusionForMatchIds.delete(matchId);
      if (suppressExternal || snapshot.outcome !== 'win' || !snapshot.winner) return;
      const winner = snapshot.participants.find(participant => participant.side === snapshot.winner);
      this.chatAdapter.insertWin({
        matchId,
        playerName: winner?.displayName ?? 'Opponent',
        elapsedMs
      });
      if (!this.settings.winAnimation || this.lastWinAnimationMatchId === matchId) return;
      this.lastWinAnimationMatchId = matchId;
      const gatewayWinner = this.gatewayState.match?.state.participants.find(participant =>
        participant.accountId === (snapshot.winner === 'self'
          ? this.gatewayState.identity?.accountId
          : this.gatewayState.match?.state.participants.find(item =>
              item.accountId !== this.gatewayState.identity?.accountId)?.accountId));
      this.showWinAnimation(
        winner?.displayName ?? this.duelDisplayName(snapshot.winner),
        gatewayWinner ?? null
      );
    }, 200);
  }

  private insertConclusionMessage(state: MatchState, elapsedMs: number, occurredAt: number): void {
    if (!state.matchId) return;
    let message: string;
    let author = 'Skribbl Duels';
    if (state.outcome === 'draw') {
      message = `Both players agreed to a Draw after ${formatDurationWords(elapsedMs)}.`;
    } else {
      const winner = state.participants.find(participant => participant.side === state.winner);
      const loser = state.participants.find(participant => participant.side !== state.winner);
      author = winner?.displayName ?? 'A player';
      message = state.finishReason === 'player-forfeit'
        ? `won after ${formatDurationWords(elapsedMs)} · ${loser?.displayName ?? 'The opponent'} forfeited.`
        : state.finishReason === 'player-disconnect'
          ? `won after ${formatDurationWords(elapsedMs)} · ${loser?.displayName ?? 'The opponent'} disconnected.`
          : `won after ${formatDurationWords(elapsedMs)}.`;
    }
    const id = `conclusion-${state.matchId}`;
    if (this.duelChatMessages.some(item => item.id === id)) return;
    this.duelChatMessages.push({
      id,
      side: 'system',
      author,
      message,
      occurredAt
    });
    this.duelChatStickToBottom = true;
    if (this.settings.panelOpen && this.mainPanelTab() === 'match') this.renderPanel();
  }

  private showWinAnimation(
    playerName: string,
    participant: GatewayMatchmakingParticipant | null
  ): void {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.winAnimation?.remove();
    if (this.winAnimationTimer !== null) window.clearTimeout(this.winAnimationTimer);
    const overlay = element('div', 'scd-win-animation');
    overlay.dataset.scdRuntimeId = this.options.runtimeId;
    const card = element('div', 'scd-win-card');
    const visual = element('div', 'scd-win-visual');
    const avatar = this.createParticipantAvatar(playerName, participant, 'scd-win-player');
    avatar.appendChild(element('span', 'owner'));
    visual.append(avatar, element('span', 'scd-win-trophy'));
    card.append(visual, element('div', '', `${playerName} wins!`));
    overlay.appendChild(card);
    (document.body ?? document.documentElement).appendChild(overlay);
    this.winAnimation = overlay;
    this.winAnimationTimer = window.setTimeout(() => {
      this.winAnimationTimer = null;
      overlay.remove();
      if (this.winAnimation === overlay) this.winAnimation = null;
    }, 3_500);
  }

  private insertCompletion(message: CompletionMessage, mirrorToSkribbl = true): void {
    if (mirrorToSkribbl) this.chatAdapter.insert(message);
    this.duelChatMessages.push({
      id: `completion-${message.claimId}`,
      side: message.side,
      author: message.playerName,
      message: `completed '${message.challengeName}'`,
      occurredAt: message.occurredAt
    });
    if (this.settings.panelOpen && this.mainPanelTab() === 'match') this.renderPanel();
  }

  private insertCompletionOnce(message: CompletionMessage, mirrorToSkribbl = true): void {
    if (this.duelChatMessages.some(item => item.id === `completion-${message.claimId}`)) return;
    this.insertCompletion(message, mirrorToSkribbl);
  }
}
