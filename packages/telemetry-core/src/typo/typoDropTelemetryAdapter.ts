import type { TelemetryStore } from '../telemetry/telemetryStore';

export const TYPO_DROP_CLAIMED_EVENT_NAME = 'skribbl-duels:typo-drop-claimed';
export const TYPO_DROP_CLAIMED_LEGACY_EVENT_NAME = 'skribblDuelsTypoDropClaimed';

export interface TypoDropClaimInput {
  own?: unknown;
  ownClaim?: unknown;
  dropId?: unknown;
  dropID?: unknown;
  catchTime?: unknown;
  catchTimeMs?: unknown;
  firstClaim?: unknown;
  clearedDrop?: unknown;
  leagueMode?: unknown;
  leagueWeight?: unknown;
  username?: unknown;
  claim?: unknown;
}

export interface NormalizedTypoDropClaim {
  own: true;
  dropId: number | string | null;
  catchTimeMs: number;
  firstClaim: boolean | null;
  clearedDrop: boolean;
  leagueMode: boolean | null;
  leagueWeight: number | null;
  username: string | null;
  method: 'typo-relay' | 'chat-fallback';
}

export interface TypoDropTelemetryAdapterOptions {
  directEventNames?: readonly string[];
  duplicateWindowMs?: number;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function nullableId(value: unknown): number | string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') return value;
  return null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null;
}

export function normalizeTypoDropClaimDetail(
  value: unknown,
  method: NormalizedTypoDropClaim['method'] = 'typo-relay'
): NormalizedTypoDropClaim | null {
  const wrapper = objectValue(value);
  if (!wrapper) return null;
  const nested = objectValue(wrapper.claim);
  const raw = nested ?? wrapper;
  const ownValue = wrapper.ownClaim ?? wrapper.own ?? raw.ownClaim ?? raw.own;
  if (ownValue === false) return null;

  const catchTimeMs = finiteNumber(raw.catchTimeMs ?? raw.catchTime);
  if (catchTimeMs === null || catchTimeMs < 0) return null;
  const clearedDrop = nullableBoolean(raw.clearedDrop);
  if (clearedDrop === null) return null;

  return {
    own: true,
    dropId: nullableId(raw.dropId ?? raw.dropID),
    catchTimeMs,
    firstClaim: nullableBoolean(raw.firstClaim),
    clearedDrop,
    leagueMode: nullableBoolean(raw.leagueMode),
    leagueWeight: finiteNumber(raw.leagueWeight),
    username: typeof raw.username === 'string' ? raw.username : null,
    method
  };
}

const OWN_DROP_MESSAGE_PATTERN = /\bYou\s+(caught|cleared)\s+the\s+drop\s+after\s+(\d+(?:\.\d+)?)\s*ms(?:\s*\((\d+(?:\.\d+)?)\s*%\))?/i;

export function parseTypoOwnDropClaimMessage(text: string): NormalizedTypoDropClaim | null {
  const match = text.replace(/\s+/g, ' ').match(OWN_DROP_MESSAGE_PATTERN);
  if (!match) return null;
  const catchTimeMs = Number(match[2]);
  if (!Number.isFinite(catchTimeMs)) return null;
  const percentage = match[3] === undefined ? null : Number(match[3]);
  return {
    own: true,
    dropId: null,
    catchTimeMs,
    firstClaim: null,
    clearedDrop: match[1]?.toLowerCase() === 'cleared',
    leagueMode: null,
    leagueWeight: percentage !== null && Number.isFinite(percentage) ? percentage / 100 : null,
    username: null,
    method: 'chat-fallback'
  };
}

export class TypoDropTelemetryAdapter {
  private readonly directEventNames: readonly string[];
  private readonly duplicateWindowMs: number;
  private observer: MutationObserver | null = null;
  private pendingOwnDropClickAt: number | null = null;
  private readonly recentClaimKeys = new Map<string, number>();

  public constructor(
    private readonly telemetryStore: TelemetryStore,
    options: TypoDropTelemetryAdapterOptions = {}
  ) {
    this.directEventNames = options.directEventNames ?? [
      TYPO_DROP_CLAIMED_EVENT_NAME,
      TYPO_DROP_CLAIMED_LEGACY_EVENT_NAME
    ];
    this.duplicateWindowMs = options.duplicateWindowMs ?? 2500;
  }

  public start(): void {
    if (typeof window !== 'undefined') {
      for (const eventName of this.directEventNames) {
        window.addEventListener(eventName, this.handleDirectEvent as EventListener, true);
      }
      window.addEventListener('message', this.handleWindowMessage, true);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', this.handlePointerDown, true);
    }
    if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
      this.startObserver();
      if (!document.documentElement) {
        document.addEventListener('DOMContentLoaded', this.handleDomReady, { once: true });
      }
    }
  }

  public stop(): void {
    if (typeof window !== 'undefined') {
      for (const eventName of this.directEventNames) {
        window.removeEventListener(eventName, this.handleDirectEvent as EventListener, true);
      }
      window.removeEventListener('message', this.handleWindowMessage, true);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this.handlePointerDown, true);
      document.removeEventListener('DOMContentLoaded', this.handleDomReady);
    }
    this.observer?.disconnect();
    this.observer = null;
    this.pendingOwnDropClickAt = null;
    this.recentClaimKeys.clear();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.typo-drop')) return;
    this.pendingOwnDropClickAt = Date.now();
  };

  private readonly handleDomReady = (): void => {
    this.startObserver();
  };

  private startObserver(): void {
    if (this.observer || typeof document === 'undefined' || !document.documentElement || typeof MutationObserver === 'undefined') return;
    this.observer = new MutationObserver(records => this.handleMutations(records));
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  private readonly handleDirectEvent = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const claim = normalizeTypoDropClaimDetail(event.detail, 'typo-relay');
    if (claim) this.emitClaim(claim, 'confirmed');
  };

  private readonly handleWindowMessage = (event: MessageEvent): void => {
    if (event.source !== window) return;
    const data = objectValue(event.data);
    if (!data) return;
    if (data.type !== TYPO_DROP_CLAIMED_EVENT_NAME && data.type !== TYPO_DROP_CLAIMED_LEGACY_EVENT_NAME) return;
    const claim = normalizeTypoDropClaimDetail(data.detail ?? data.payload ?? data.claim ?? data, 'typo-relay');
    if (claim) this.emitClaim(claim, 'confirmed');
  };

  private handleMutations(records: readonly MutationRecord[]): void {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        this.inspectAddedNode(node);
      }
    }
  }

  private inspectAddedNode(node: Node): void {
    const clickedAt = this.pendingOwnDropClickAt;
    if (clickedAt === null || Date.now() - clickedAt > 10_000) {
      this.pendingOwnDropClickAt = null;
      return;
    }
    const text = node.textContent?.trim();
    if (!text) return;
    const claim = parseTypoOwnDropClaimMessage(text);
    if (claim) this.emitClaim(claim, 'derived');
  }

  private emitClaim(
    claim: NormalizedTypoDropClaim,
    confidence: 'confirmed' | 'derived'
  ): void {
    const now = Date.now();
    this.pruneRecentClaims(now);
    const key = `${claim.clearedDrop ? 1 : 0}|${claim.catchTimeMs.toFixed(3)}`;
    const previous = this.recentClaimKeys.get(key);
    if (previous !== undefined && now - previous <= this.duplicateWindowMs) return;
    this.recentClaimKeys.set(key, now);
    this.pendingOwnDropClickAt = null;

    this.telemetryStore.emitDomEvent('TYPO_DROP_CLAIMED', claim, {
      actor: {
        playerId: null,
        name: claim.username,
        isSelf: true
      },
      confidence,
      occurredAt: now
    });
  }

  private pruneRecentClaims(now: number): void {
    for (const [key, timestamp] of this.recentClaimKeys) {
      if (now - timestamp > this.duplicateWindowMs) this.recentClaimKeys.delete(key);
    }
  }
}
