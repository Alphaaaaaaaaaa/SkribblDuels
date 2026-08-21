import { createId } from '../core/ids';
import type { TelemetryStore } from '../telemetry/telemetryStore';

export interface AvatarTelemetryAdapterOptions {
  storageKey?: string;
  pollIntervalMs?: number;
  clickCorrelationWindowMs?: number;
  randomizeSelector?: string;
}

interface PendingRandomizeClick {
  clickId: string;
  occurredAt: number;
  previousAvatar: number[] | null;
}

function normalizeAvatar(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const avatar = value.map(entry => typeof entry === 'number' && Number.isFinite(entry) ? entry : Number(entry));
  return avatar.every(entry => Number.isFinite(entry)) ? avatar : null;
}

export function parseStoredAvatar(raw: string | null): number[] | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const direct = normalizeAvatar(parsed);
    if (direct) return direct;
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      return normalizeAvatar(record.avatar) ?? normalizeAvatar(record.ava);
    }
  } catch {
    const parts = raw.split(',').map(part => Number(part.trim()));
    if (parts.length >= 3 && parts.every(Number.isFinite)) return parts;
  }
  return null;
}

function avatarEquals(left: readonly number[] | null, right: readonly number[] | null): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function avatarDifference(
  previousAvatar: readonly number[] | null,
  avatar: readonly number[] | null
): { changedIndices: number[]; absoluteDeltas: number[] } {
  if (!previousAvatar || !avatar) return { changedIndices: [], absoluteDeltas: [] };
  const length = Math.min(previousAvatar.length, avatar.length);
  const changedIndices: number[] = [];
  const absoluteDeltas: number[] = [];
  for (let index = 0; index < length; index += 1) {
    if (previousAvatar[index] === avatar[index]) continue;
    changedIndices.push(index);
    absoluteDeltas.push(Math.abs(avatar[index]! - previousAvatar[index]!));
  }
  return { changedIndices, absoluteDeltas };
}

function looksLikeRandomization(changedIndices: readonly number[], absoluteDeltas: readonly number[]): boolean {
  if (changedIndices.length < 3) return false;
  const substantialChanges = absoluteDeltas.filter(delta => delta > 1).length;
  return substantialChanges >= 2;
}

export class AvatarTelemetryAdapter {
  private readonly storageKey: string;
  private readonly pollIntervalMs: number;
  private readonly clickCorrelationWindowMs: number;
  private readonly randomizeSelector: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastAvatar: number[] | null = null;
  private initialized = false;
  private pendingRandomizeClick: PendingRandomizeClick | null = null;

  public constructor(
    private readonly telemetryStore: TelemetryStore,
    options: AvatarTelemetryAdapterOptions = {}
  ) {
    this.storageKey = options.storageKey ?? 'ava';
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.clickCorrelationWindowMs = options.clickCorrelationWindowMs ?? 1000;
    this.randomizeSelector = options.randomizeSelector ??
      '#home .avatar-customizer.typo-customize-player-display .randomize, #home .avatar-customizer .randomize';
  }

  public start(): void {
    if (this.timer !== null) return;
    if (typeof document !== 'undefined') {
      document.addEventListener('click', this.handleDocumentClick, true);
    }
    this.check();
    this.timer = setInterval(() => this.check(), this.pollIntervalMs);
  }

  public stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', this.handleDocumentClick, true);
    }
    this.pendingRandomizeClick = null;
  }

  public getCurrentAvatar(): number[] | null {
    return this.lastAvatar?.slice() ?? null;
  }

  /** Public for deterministic tests; production calls it through delegated click tracking. */
  public notifyRandomizeClick(occurredAt = Date.now()): string {
    const clickId = createId();
    this.pendingRandomizeClick = {
      clickId,
      occurredAt,
      previousAvatar: this.lastAvatar?.slice() ?? null
    };
    return clickId;
  }

  private readonly handleDocumentClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(this.randomizeSelector) === null) return;
    this.notifyRandomizeClick(Date.now());
  };

  private check(): void {
    let avatar: number[] | null = null;
    try {
      if (typeof localStorage === 'undefined') return;
      avatar = parseStoredAvatar(localStorage.getItem(this.storageKey));
    } catch {
      return;
    }

    if (!this.initialized) {
      this.initialized = true;
      this.lastAvatar = avatar?.slice() ?? null;
      return;
    }

    const now = Date.now();
    if (this.pendingRandomizeClick &&
        now - this.pendingRandomizeClick.occurredAt > this.clickCorrelationWindowMs) {
      this.pendingRandomizeClick = null;
    }
    if (avatarEquals(this.lastAvatar, avatar)) return;

    const previousAvatar = this.lastAvatar?.slice() ?? null;
    this.lastAvatar = avatar?.slice() ?? null;
    const difference = avatarDifference(previousAvatar, avatar);
    const pendingClick = this.pendingRandomizeClick;
    const clickCorrelated = pendingClick !== null &&
      now - pendingClick.occurredAt >= 0 &&
      now - pendingClick.occurredAt <= this.clickCorrelationWindowMs &&
      avatarEquals(pendingClick.previousAvatar, previousAvatar);
    const heuristicRandomization = !clickCorrelated &&
      looksLikeRandomization(difference.changedIndices, difference.absoluteDeltas);

    this.pendingRandomizeClick = null;
    if (!clickCorrelated && !heuristicRandomization) return;

    this.telemetryStore.emitDomEvent('AVATAR_RANDOMIZED', {
      previousAvatar,
      avatar: avatar?.slice() ?? null,
      redSkin: avatar?.[0] === 0,
      method: clickCorrelated ? 'randomize-button' : 'heuristic',
      validRandomization: true,
      randomizeClickObserved: clickCorrelated,
      randomizeClickId: clickCorrelated ? pendingClick!.clickId : null,
      changedIndices: difference.changedIndices,
      absoluteDeltas: difference.absoluteDeltas
    });
  }
}
