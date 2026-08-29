import type { TelemetryStore } from '../telemetry/telemetryStore';

export const TYPO_DROP_CLAIMED_EVENT_NAME = 'skribbl-duels:typo-drop-claimed';
export const TYPO_DROP_CLAIMED_LEGACY_EVENT_NAME = 'skribblDuelsTypoDropClaimed';
export const TYPO_DROP_SPAWNED_EVENT_NAME = 'skribbl-duels:typo-drop-spawned';
export const TYPO_DROP_MISSED_EVENT_NAME = 'skribbl-duels:typo-drop-missed';

export type TypoDropMissReason =
  | 'cleared-or-expired'
  | 'claim-unconfirmed'
  | 'replaced'
  | 'lobby-left';

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
  missGraceMs?: number;
}

interface ActiveDropObservation {
  observationId: string;
  dropId: number | string | null;
  method: 'typo-relay' | 'dom-observer';
  element: Element | null;
  pointerDownAt: number | null;
}

interface NormalizedDropBoundary {
  dropId: number | string | null;
  reason: TypoDropMissReason | null;
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

export function normalizeTypoDropBoundaryDetail(value: unknown): NormalizedDropBoundary | null {
  const wrapper = objectValue(value);
  if (!wrapper) return null;
  const nested = objectValue(wrapper.drop);
  const raw = nested ?? wrapper;
  const reason = raw.reason;
  return {
    dropId: nullableId(raw.dropId ?? raw.dropID),
    reason: reason === 'cleared-or-expired'
      || reason === 'claim-unconfirmed'
      || reason === 'replaced'
      || reason === 'lobby-left'
      ? reason
      : null
  };
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
  private readonly missGraceMs: number;
  private observer: MutationObserver | null = null;
  private pendingOwnDropClickAt: number | null = null;
  private activeDrop: ActiveDropObservation | null = null;
  private pendingRemovalTimer: ReturnType<typeof setTimeout> | null = null;
  private observationSequence = 0;
  private readonly recentClaimKeys = new Map<string, number>();

  public constructor(
    private readonly telemetryStore: TelemetryStore,
    options: TypoDropTelemetryAdapterOptions = {}
  ) {
    this.directEventNames = options.directEventNames ?? [
      TYPO_DROP_CLAIMED_EVENT_NAME,
      TYPO_DROP_CLAIMED_LEGACY_EVENT_NAME,
      TYPO_DROP_SPAWNED_EVENT_NAME,
      TYPO_DROP_MISSED_EVENT_NAME
    ];
    this.duplicateWindowMs = options.duplicateWindowMs ?? 2500;
    this.missGraceMs = options.missGraceMs ?? 5000;
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
      document.addEventListener('leftLobby', this.handleLobbyLeft, true);
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
      document.removeEventListener('leftLobby', this.handleLobbyLeft, true);
      document.removeEventListener('DOMContentLoaded', this.handleDomReady);
    }
    this.observer?.disconnect();
    this.observer = null;
    if (this.pendingRemovalTimer !== null) clearTimeout(this.pendingRemovalTimer);
    this.pendingRemovalTimer = null;
    this.pendingOwnDropClickAt = null;
    this.activeDrop = null;
    this.recentClaimKeys.clear();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const drop = target.closest('.typo-drop');
    if (!drop) return;
    if (this.activeDrop === null) this.observeDomSpawn(drop);
    const now = Date.now();
    this.pendingOwnDropClickAt = now;
    if (this.activeDrop) this.activeDrop.pointerDownAt = now;
  };

  private readonly handleLobbyLeft = (): void => {
    this.resolveActiveDropAsMissed('lobby-left', 'dom-observer');
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
    const existing = document.querySelector('.typo-drop');
    if (existing) this.observeDomSpawn(existing);
  }

  private readonly handleDirectEvent = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    if (event.type === TYPO_DROP_SPAWNED_EVENT_NAME) {
      const boundary = normalizeTypoDropBoundaryDetail(event.detail);
      if (boundary) this.observeRelaySpawn(boundary.dropId);
      return;
    }
    if (event.type === TYPO_DROP_MISSED_EVENT_NAME) {
      const boundary = normalizeTypoDropBoundaryDetail(event.detail);
      if (boundary) this.resolveRelayMiss(boundary.dropId, boundary.reason ?? 'cleared-or-expired');
      return;
    }
    const claim = normalizeTypoDropClaimDetail(event.detail, 'typo-relay');
    if (claim) this.emitClaim(claim, 'confirmed');
  };

  private readonly handleWindowMessage = (event: MessageEvent): void => {
    if (event.source !== window) return;
    const data = objectValue(event.data);
    if (!data) return;
    if (data.type === TYPO_DROP_SPAWNED_EVENT_NAME) {
      const boundary = normalizeTypoDropBoundaryDetail(data.detail ?? data.payload ?? data);
      if (boundary) this.observeRelaySpawn(boundary.dropId);
      return;
    }
    if (data.type === TYPO_DROP_MISSED_EVENT_NAME) {
      const boundary = normalizeTypoDropBoundaryDetail(data.detail ?? data.payload ?? data);
      if (boundary) this.resolveRelayMiss(boundary.dropId, boundary.reason ?? 'cleared-or-expired');
      return;
    }
    if (data.type !== TYPO_DROP_CLAIMED_EVENT_NAME && data.type !== TYPO_DROP_CLAIMED_LEGACY_EVENT_NAME) return;
    const claim = normalizeTypoDropClaimDetail(data.detail ?? data.payload ?? data.claim ?? data, 'typo-relay');
    if (claim) this.emitClaim(claim, 'confirmed');
  };

  private handleMutations(records: readonly MutationRecord[]): void {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        this.inspectAddedNode(node);
      }
      for (const node of Array.from(record.removedNodes)) {
        this.inspectRemovedNode(node);
      }
    }
  }

  private inspectAddedNode(node: Node): void {
    for (const drop of this.dropElementsInNode(node)) this.observeDomSpawn(drop);

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

  private inspectRemovedNode(node: Node): void {
    const activeElement = this.activeDrop?.element;
    if (!activeElement || !(node instanceof Element)) return;
    if (node !== activeElement && !node.contains(activeElement)) return;
    this.scheduleRemovedDropResolution();
  }

  private dropElementsInNode(node: Node): Element[] {
    if (!(node instanceof Element)) return [];
    const drops: Element[] = [];
    if (node.matches('.typo-drop')) drops.push(node);
    drops.push(...Array.from(node.querySelectorAll('.typo-drop')));
    return drops;
  }

  private createObservationId(): string {
    this.observationSequence += 1;
    return `typo-drop-${Date.now().toString(36)}-${this.observationSequence.toString(36)}`;
  }

  private observeDomSpawn(element: Element): void {
    if (this.activeDrop?.element === element) return;
    if (this.activeDrop && this.activeDrop.element === null) {
      this.activeDrop.element = element;
      return;
    }
    if (this.activeDrop) this.resolveActiveDropAsMissed('replaced', this.activeDrop.method);
    const observation: ActiveDropObservation = {
      observationId: this.createObservationId(),
      dropId: null,
      method: 'dom-observer',
      element,
      pointerDownAt: null
    };
    this.activeDrop = observation;
    this.telemetryStore.emitDomEvent('TYPO_DROP_SPAWNED', {
      dropObservationId: observation.observationId,
      dropId: observation.dropId,
      method: observation.method
    }, { confidence: 'derived' });
  }

  private observeRelaySpawn(dropId: number | string | null): void {
    if (this.activeDrop) {
      const sameKnownDrop = dropId !== null && this.activeDrop.dropId === dropId;
      const upgradesDomObservation = this.activeDrop.dropId === null;
      if (sameKnownDrop || upgradesDomObservation) {
        this.activeDrop.dropId = dropId;
        this.activeDrop.method = 'typo-relay';
        return;
      }
      this.resolveActiveDropAsMissed('replaced', this.activeDrop.method);
    }
    const observation: ActiveDropObservation = {
      observationId: this.createObservationId(),
      dropId,
      method: 'typo-relay',
      element: null,
      pointerDownAt: null
    };
    this.activeDrop = observation;
    this.telemetryStore.emitDomEvent('TYPO_DROP_SPAWNED', {
      dropObservationId: observation.observationId,
      dropId: observation.dropId,
      method: observation.method
    }, { confidence: 'confirmed' });
  }

  private scheduleRemovedDropResolution(): void {
    if (this.pendingRemovalTimer !== null) clearTimeout(this.pendingRemovalTimer);
    const reason: TypoDropMissReason = this.activeDrop?.pointerDownAt === null
      ? 'cleared-or-expired'
      : 'claim-unconfirmed';
    this.pendingRemovalTimer = setTimeout(() => {
      this.pendingRemovalTimer = null;
      this.resolveActiveDropAsMissed(reason, 'dom-observer');
    }, this.missGraceMs);
  }

  private resolveRelayMiss(dropId: number | string | null, reason: TypoDropMissReason): void {
    if (!this.activeDrop) return;
    if (dropId !== null && this.activeDrop.dropId !== null && dropId !== this.activeDrop.dropId) return;
    if (this.activeDrop.dropId === null) this.activeDrop.dropId = dropId;
    this.resolveActiveDropAsMissed(reason, 'typo-relay');
  }

  private resolveActiveDropAsMissed(
    reason: TypoDropMissReason,
    method: 'typo-relay' | 'dom-observer'
  ): void {
    const active = this.activeDrop;
    if (!active) return;
    if (this.pendingRemovalTimer !== null) clearTimeout(this.pendingRemovalTimer);
    this.pendingRemovalTimer = null;
    this.activeDrop = null;
    this.pendingOwnDropClickAt = null;
    this.telemetryStore.emitDomEvent('TYPO_DROP_MISSED', {
      dropObservationId: active.observationId,
      dropId: active.dropId,
      reason,
      method
    }, { confidence: method === 'typo-relay' ? 'confirmed' : 'derived' });
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

    let dropObservationId: string | null = null;
    const active = this.activeDrop;
    if (active) {
      const compatibleDropId = active.dropId === null
        || claim.dropId === null
        || active.dropId === claim.dropId;
      if (compatibleDropId) {
        if (this.pendingRemovalTimer !== null) clearTimeout(this.pendingRemovalTimer);
        this.pendingRemovalTimer = null;
        active.dropId = claim.dropId ?? active.dropId;
        dropObservationId = active.observationId;
        this.activeDrop = null;
      } else {
        this.resolveActiveDropAsMissed('claim-unconfirmed', active.method);
      }
    }

    this.telemetryStore.emitDomEvent('TYPO_DROP_CLAIMED', {
      ...claim,
      dropObservationId
    }, {
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
