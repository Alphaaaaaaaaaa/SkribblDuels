import { createId } from '../core/ids';
import type { TelemetryStore } from '../telemetry/telemetryStore';

export interface HomeInteractionTelemetryAdapterOptions {
  logoAvatarContainerSelector?: string;
  creditsLinkSelector?: string;
  specialStableMs?: number;
  specialPollIntervalMs?: number;
  creditsNavigationStorageKey?: string;
  creditsNavigationMaxAgeMs?: number;
}

export interface LogoAvatarVisualSnapshot {
  avatarIndex: number;
  colorBackgroundPosition: string;
  eyesBackgroundPosition: string;
  mouthBackgroundPosition: string;
  specialBackgroundPosition: string;
  specialVisible: boolean;
}

export interface StableSpecialAvatarResult {
  avatarIndex: number;
  clickId: string;
  specialId: number | null;
  specialBackgroundPosition: string;
  stableForMs: number;
}

interface SpecialCandidate {
  snapshot: LogoAvatarVisualSnapshot;
  clickId: string;
  startedAt: number;
}

interface CreditsNavigationMarker {
  navigationId: string;
  clickedAt: number;
  href: string;
  pathname: string;
}

function visualFingerprint(snapshot: LogoAvatarVisualSnapshot): string {
  return [
    snapshot.avatarIndex,
    snapshot.colorBackgroundPosition,
    snapshot.eyesBackgroundPosition,
    snapshot.mouthBackgroundPosition,
    snapshot.specialBackgroundPosition,
    snapshot.specialVisible ? 1 : 0
  ].join('|');
}

function parsePercentage(value: string): number | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)%$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function specialIdFromBackgroundPosition(value: string): number | null {
  const parts = value.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const x = parsePercentage(parts[0]!);
  const y = parsePercentage(parts[1]!);
  if (x === null || y === null) return null;
  const column = Math.round(Math.abs(x) / 100);
  const row = Math.round(Math.abs(y) / 100);
  return row * 100 + column;
}

export class SpecialAvatarStabilityTracker {
  private candidate: SpecialCandidate | null = null;
  private emittedClickId: string | null = null;

  public constructor(private readonly stableMs = 1000) {}

  public begin(snapshot: LogoAvatarVisualSnapshot | null, clickId: string, now: number): void {
    this.candidate = snapshot?.specialVisible === true
      ? { snapshot: structuredClone(snapshot), clickId, startedAt: now }
      : null;
    this.emittedClickId = null;
  }

  public cancel(): void {
    this.candidate = null;
    this.emittedClickId = null;
  }

  public check(snapshot: LogoAvatarVisualSnapshot | null, now: number): StableSpecialAvatarResult | null {
    const candidate = this.candidate;
    if (!candidate || !snapshot || !snapshot.specialVisible) {
      this.cancel();
      return null;
    }

    if (visualFingerprint(snapshot) !== visualFingerprint(candidate.snapshot)) {
      this.cancel();
      return null;
    }

    const stableForMs = now - candidate.startedAt;
    if (stableForMs < this.stableMs || this.emittedClickId === candidate.clickId) return null;
    this.emittedClickId = candidate.clickId;
    return {
      avatarIndex: snapshot.avatarIndex,
      clickId: candidate.clickId,
      specialId: specialIdFromBackgroundPosition(snapshot.specialBackgroundPosition),
      specialBackgroundPosition: snapshot.specialBackgroundPosition,
      stableForMs
    };
  }
}

function parseCreditsMarker(raw: string | null): CreditsNavigationMarker | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CreditsNavigationMarker>;
    if (typeof value.navigationId !== 'string' ||
        typeof value.clickedAt !== 'number' || !Number.isFinite(value.clickedAt) ||
        typeof value.href !== 'string' || typeof value.pathname !== 'string') {
      return null;
    }
    return {
      navigationId: value.navigationId,
      clickedAt: value.clickedAt,
      href: value.href,
      pathname: value.pathname
    };
  } catch {
    return null;
  }
}

export class HomeInteractionTelemetryAdapter {
  private readonly logoAvatarContainerSelector: string;
  private readonly creditsLinkSelector: string;
  private readonly specialPollIntervalMs: number;
  private readonly creditsNavigationStorageKey: string;
  private readonly creditsNavigationMaxAgeMs: number;
  private readonly stabilityTracker: SpecialAvatarStabilityTracker;
  private specialTimer: ReturnType<typeof setInterval> | null = null;
  private clickedAvatarIndex: number | null = null;
  private pendingLogoClickId: string | null = null;
  private specialCandidateClickId: string | null = null;
  private clickCount = 0;
  private creditsOpenedEmitted = false;

  public constructor(
    private readonly telemetryStore: TelemetryStore,
    options: HomeInteractionTelemetryAdapterOptions = {}
  ) {
    this.logoAvatarContainerSelector = options.logoAvatarContainerSelector ??
      '#home > div.logo-big > div.avatar-container';
    this.creditsLinkSelector = options.creditsLinkSelector ??
      '#home a[href="/credits"], #home a[href$="/credits"]';
    this.specialPollIntervalMs = options.specialPollIntervalMs ?? 50;
    this.creditsNavigationStorageKey = options.creditsNavigationStorageKey ??
      'skribblDuelsCreditsNavigationV1';
    this.creditsNavigationMaxAgeMs = options.creditsNavigationMaxAgeMs ?? 60_000;
    this.stabilityTracker = new SpecialAvatarStabilityTracker(options.specialStableMs ?? 1000);
  }

  public start(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('click', this.handleDocumentClick, true);
    }
    if (this.specialTimer === null) {
      this.specialTimer = setInterval(() => this.checkStableSpecial(), this.specialPollIntervalMs);
    }
    this.scheduleCreditsOpenedCheck();
  }

  public stop(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', this.handleDocumentClick, true);
    }
    if (this.specialTimer !== null) {
      clearInterval(this.specialTimer);
      this.specialTimer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('load', this.handleWindowLoad);
    }
    this.stabilityTracker.cancel();
    this.clickedAvatarIndex = null;
    this.pendingLogoClickId = null;
    this.specialCandidateClickId = null;
  }

  private readonly handleDocumentClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const creditsLink = target.closest(this.creditsLinkSelector);
    if (creditsLink instanceof HTMLAnchorElement) {
      this.handleCreditsLinkClick(creditsLink);
      return;
    }

    const avatar = target.closest('.avatar');
    if (!(avatar instanceof HTMLElement)) return;
    const container = avatar.parentElement;
    if (!(container instanceof HTMLElement) || !container.matches(this.logoAvatarContainerSelector)) return;

    const avatars = Array.from(container.children).filter(
      child => child instanceof HTMLElement && child.classList.contains('avatar')
    ) as HTMLElement[];
    const avatarIndex = avatars.indexOf(avatar);
    if (avatarIndex < 0) return;

    this.clickCount += 1;
    this.clickedAvatarIndex = avatarIndex;
    this.stabilityTracker.cancel();
    this.specialCandidateClickId = null;
    const clickId = createId();
    this.pendingLogoClickId = clickId;
    this.telemetryStore.emitDomEvent('LOGO_AVATAR_CLICKED', {
      avatarIndex,
      clickCount: this.clickCount,
      clickId
    });

    setTimeout(() => this.tryBeginSpecialCandidate(), 0);
  };

  private handleCreditsLinkClick(link: HTMLAnchorElement): void {
    const navigationId = createId();
    const clickedAt = Date.now();
    const url = new URL(link.href, window.location.href);
    const marker: CreditsNavigationMarker = {
      navigationId,
      clickedAt,
      href: url.href,
      pathname: url.pathname
    };
    try {
      sessionStorage.setItem(this.creditsNavigationStorageKey, JSON.stringify(marker));
    } catch {
      // The click event is still emitted even if storage is unavailable.
    }
    this.telemetryStore.emitDomEvent('CREDITS_LINK_CLICKED', {
      href: url.href,
      pathname: url.pathname,
      navigationId
    }, { occurredAt: clickedAt });
  }

  private checkStableSpecial(): void {
    if (this.clickedAvatarIndex === null) return;
    this.tryBeginSpecialCandidate();
    const snapshot = this.readLogoAvatarSnapshot(this.clickedAvatarIndex);
    const result = this.stabilityTracker.check(snapshot, performance.now());
    if (!result) return;
    this.telemetryStore.emitDomEvent('SPECIAL_AVATAR_FOUND', result);
    this.clickedAvatarIndex = null;
    this.pendingLogoClickId = null;
    this.specialCandidateClickId = null;
  }

  private tryBeginSpecialCandidate(): void {
    const avatarIndex = this.clickedAvatarIndex;
    const clickId = this.pendingLogoClickId;
    if (avatarIndex === null || clickId === null || this.specialCandidateClickId === clickId) return;
    const snapshot = this.readLogoAvatarSnapshot(avatarIndex);
    if (!snapshot?.specialVisible) return;
    this.stabilityTracker.begin(snapshot, clickId, performance.now());
    this.specialCandidateClickId = clickId;
  }

  private readLogoAvatarSnapshot(avatarIndex: number): LogoAvatarVisualSnapshot | null {
    if (typeof document === 'undefined') return null;
    const container = document.querySelector(this.logoAvatarContainerSelector);
    if (!(container instanceof HTMLElement)) return null;
    const avatars = Array.from(container.children).filter(
      child => child instanceof HTMLElement && child.classList.contains('avatar')
    ) as HTMLElement[];
    const avatar = avatars[avatarIndex];
    if (!avatar) return null;

    const readBackground = (selector: string): string => {
      const element = avatar.querySelector(selector);
      if (!(element instanceof HTMLElement)) return '';
      return element.style.backgroundPosition || getComputedStyle(element).backgroundPosition || '';
    };
    const special = avatar.querySelector('.special');
    const specialStyle = special instanceof HTMLElement ? getComputedStyle(special) : null;
    const specialBackgroundPosition = special instanceof HTMLElement
      ? special.style.backgroundPosition || specialStyle?.backgroundPosition || ''
      : '';
    const specialVisible = special instanceof HTMLElement &&
      specialStyle?.display !== 'none' &&
      specialStyle?.visibility !== 'hidden' &&
      specialBackgroundPosition.trim() !== '';

    return {
      avatarIndex,
      colorBackgroundPosition: readBackground('.color'),
      eyesBackgroundPosition: readBackground('.eyes'),
      mouthBackgroundPosition: readBackground('.mouth'),
      specialBackgroundPosition,
      specialVisible
    };
  }

  private scheduleCreditsOpenedCheck(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.location.pathname !== '/credits') return;
    if (document.readyState === 'complete') {
      setTimeout(() => this.emitCreditsOpened(), 0);
      return;
    }
    window.addEventListener('load', this.handleWindowLoad, { once: true });
  }

  private readonly handleWindowLoad = (): void => {
    this.emitCreditsOpened();
  };

  private emitCreditsOpened(): void {
    if (this.creditsOpenedEmitted || typeof window === 'undefined') return;
    this.creditsOpenedEmitted = true;
    const loadedAt = Date.now();
    let marker: CreditsNavigationMarker | null = null;
    try {
      marker = parseCreditsMarker(sessionStorage.getItem(this.creditsNavigationStorageKey));
      sessionStorage.removeItem(this.creditsNavigationStorageKey);
    } catch {
      marker = null;
    }
    const markerFresh = marker !== null &&
      loadedAt - marker.clickedAt >= 0 &&
      loadedAt - marker.clickedAt <= this.creditsNavigationMaxAgeMs &&
      marker.pathname === '/credits';

    this.telemetryStore.emitDomEvent('CREDITS_OPENED', {
      pathname: window.location.pathname,
      readyState: 'complete',
      linkClickObserved: markerFresh,
      navigationId: markerFresh ? marker!.navigationId : null,
      linkClickedAt: markerFresh ? marker!.clickedAt : null,
      loadElapsedMs: markerFresh ? loadedAt - marker!.clickedAt : null
    }, { occurredAt: loadedAt });
  }
}
