import type { Subscription } from 'rxjs';
import type {
  TelemetryEvent,
  TelemetryPayloadMap
} from '@skribbl-duels/telemetry-contracts';
import type { TelemetryStore } from '../telemetry/telemetryStore';

export const TYPO_CHALLENGE_STATE_EVENT_NAME = 'skribbl-duels:typo-challenge-state';
export const TYPO_CHALLENGE_STATE_LEGACY_EVENT_NAME = 'skribblDuelsTypoChallengeState';

export const TYPO_CHALLENGE_KEYS = {
  1: 'blind-guess',
  2: 'drunk-vision',
  3: 'deaf-guess'
} as const;

export type SupportedTypoChallengeKey = typeof TYPO_CHALLENGE_KEYS[keyof typeof TYPO_CHALLENGE_KEYS];

const CHALLENGE_NAMES: Record<SupportedTypoChallengeKey, string> = {
  'blind-guess': 'Blind Guess',
  'drunk-vision': 'Drunk Vision',
  'deaf-guess': 'Deaf Guess'
};

interface UnknownRecord {
  [key: string]: unknown;
}

interface DirectChallengeState {
  payload: TelemetryPayloadMap['TYPO_CHALLENGE_STATE_CHANGED'];
  observedAt: number;
}

export interface TypoChallengeTelemetryAdapterOptions {
  directEventNames?: readonly string[];
  domScanDebounceMs?: number;
}

function objectValue(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function finiteInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizedKey(value: unknown, id: number | null): string | null {
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim().toLowerCase().replace(/[_\s]+/g, '-');
  }
  if (id !== null && id in TYPO_CHALLENGE_KEYS) {
    return TYPO_CHALLENGE_KEYS[id as keyof typeof TYPO_CHALLENGE_KEYS];
  }
  return null;
}

function normalizeReason(value: unknown): TelemetryPayloadMap['TYPO_CHALLENGE_STATE_CHANGED']['reason'] {
  switch (value) {
    case 'selection-changed':
    case 'trigger-applied':
    case 'challenge-destroyed':
    case 'feature-destroyed':
    case 'dom-fallback':
      return value;
    default:
      return 'trigger-applied';
  }
}

export function normalizeTypoChallengeStateDetail(
  value: unknown
): TelemetryPayloadMap['TYPO_CHALLENGE_STATE_CHANGED'] | null {
  const wrapper = objectValue(value);
  if (!wrapper) return null;
  const nested = objectValue(wrapper.state);
  const raw = nested ?? wrapper;
  const challengeId = finiteInteger(raw.challengeId ?? raw.id);
  const challengeKey = normalizedKey(raw.challengeKey ?? raw.key, challengeId);
  if (challengeKey === null) return null;

  const effectActive = nullableBoolean(raw.effectActive ?? raw.active ?? raw.trigger);
  if (effectActive === null) return null;

  const selected = nullableBoolean(raw.selected ?? raw.enabled);
  const featureActive = nullableBoolean(raw.featureActive);
  const challengeName = typeof raw.challengeName === 'string' && raw.challengeName.trim() !== ''
    ? raw.challengeName.trim()
    : CHALLENGE_NAMES[challengeKey as SupportedTypoChallengeKey] ?? challengeKey;

  return {
    challengeId,
    challengeKey,
    challengeName,
    selected,
    effectActive,
    featureActive,
    reason: normalizeReason(raw.reason),
    method: 'typo-relay'
  };
}

function opacityIsZero(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const inlineOpacity = Number.parseFloat(element.style.opacity);
  if (Number.isFinite(inlineOpacity)) return inlineOpacity <= 0.01;
  const opacity = Number.parseFloat(getComputedStyle(element).opacity);
  return Number.isFinite(opacity) && opacity <= 0.01;
}

function candidateGameCanvases(): HTMLCanvasElement[] {
  const candidates = [
    ...document.querySelectorAll<HTMLCanvasElement>('canvas#game-canvas'),
    ...document.querySelectorAll<HTMLCanvasElement>('#game-canvas canvas'),
    ...document.querySelectorAll<HTMLCanvasElement>('#game canvas'),
    ...document.querySelectorAll<HTMLCanvasElement>('canvas.game-canvas')
  ];

  return Array.from(new Set(candidates))
    .filter(canvas => canvas.width > 0 && canvas.height > 0)
    .sort((a, b) => {
      const preferredA = a.width === 800 && a.height === 600 ? 1 : 0;
      const preferredB = b.width === 800 && b.height === 600 ? 1 : 0;
      const explicitA = a.style.opacity.trim() !== '' ? 1 : 0;
      const explicitB = b.style.opacity.trim() !== '' ? 1 : 0;
      return explicitB - explicitA
        || preferredB - preferredA
        || (b.width * b.height) - (a.width * a.height);
    });
}

export function blindGuessEffectActive(): boolean {
  return candidateGameCanvases().some(canvas => opacityIsZero(canvas));
}

export function drunkVisionEffectActive(): boolean {
  const canvas = candidateGameCanvases()[0] ?? null;
  const wrapper = canvas?.parentElement ?? document.querySelector('#game-canvas-wrapper, #game-canvas');
  if (!wrapper) return false;
  return [...wrapper.querySelectorAll<HTMLElement>('div')].some(element => {
    const style = getComputedStyle(element);
    const backdrop = style.backdropFilter || (style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter || '';
    return backdrop.includes('blur(') && element.style.pointerEvents === 'none';
  });
}

export function cssTextContainsDeafGuessRules(cssText: string): boolean {
  const normalized = cssText.toLowerCase().replace(/\s+/g, ' ');
  return normalized.includes('typo-challenge-deaf-guess-hidden')
    || (normalized.includes('#game-word .hints')
      && normalized.includes('chat-form .characters')
      && normalized.includes('opacity: 0'));
}

function deafGuessStylesheetActive(): boolean {
  for (const stylesheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(stylesheet.cssRules ?? [])) {
        if (cssTextContainsDeafGuessRules(rule.cssText)) return true;
      }
    } catch {
      // Ignore cross-origin stylesheets. Typo's challenge sheet is same-origin/injected.
    }
  }
  return [...document.querySelectorAll<HTMLStyleElement>('style')]
    .some(style => cssTextContainsDeafGuessRules(style.textContent ?? ''));
}

export function deafGuessEffectActive(): boolean {
  if (document.querySelector('.typo-challenge-deaf-guess-hidden')) return true;
  return deafGuessStylesheetActive();
}

const DOM_EFFECT_READERS: Record<SupportedTypoChallengeKey, () => boolean> = {
  'blind-guess': blindGuessEffectActive,
  'drunk-vision': drunkVisionEffectActive,
  'deaf-guess': deafGuessEffectActive
};

export class TypoChallengeTelemetryAdapter {
  private readonly directEventNames: readonly string[];
  private readonly domScanDebounceMs: number;
  private readonly directStates = new Map<string, DirectChallengeState>();
  private readonly domStates = new Map<SupportedTypoChallengeKey, boolean>();
  private telemetrySubscription: Subscription | undefined;
  private observer: MutationObserver | undefined;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  public constructor(
    private readonly telemetryStore: TelemetryStore,
    options: TypoChallengeTelemetryAdapterOptions = {}
  ) {
    this.directEventNames = options.directEventNames ?? [
      TYPO_CHALLENGE_STATE_EVENT_NAME,
      TYPO_CHALLENGE_STATE_LEGACY_EVENT_NAME
    ];
    this.domScanDebounceMs = options.domScanDebounceMs ?? 20;
  }

  public start(): void {
    if (this.started) return;
    this.started = true;
    for (const eventName of this.directEventNames) {
      window.addEventListener(eventName, this.handleDirectState as EventListener, true);
    }
    this.telemetrySubscription = this.telemetryStore.events$.subscribe(event => this.handleTelemetry(event));
    this.observer = new MutationObserver(() => this.scheduleDomScan());
    this.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
    this.scanDomEffects();
  }

  public stop(): void {
    if (!this.started) return;
    this.started = false;
    for (const eventName of this.directEventNames) {
      window.removeEventListener(eventName, this.handleDirectState as EventListener, true);
    }
    this.telemetrySubscription?.unsubscribe();
    this.telemetrySubscription = undefined;
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.scanTimer !== null) clearTimeout(this.scanTimer);
    this.scanTimer = null;
  }

  private readonly handleDirectState = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const payload = normalizeTypoChallengeStateDetail(event.detail);
    if (payload === null) return;
    this.directStates.set(payload.challengeKey, {
      payload,
      observedAt: performance.now()
    });
    this.telemetryStore.emitDomEvent('TYPO_CHALLENGE_STATE_CHANGED', payload, {
      confidence: 'confirmed'
    });
  };

  private handleTelemetry(event: TelemetryEvent): void {
    if (event.type === 'GUESS_SUBMITTED' && event.actor?.isSelf) {
      this.emitGuessAttempt(event);
      return;
    }
    if (event.type === 'ROUND_STARTED') {
      // Emit a fresh per-turn snapshot even if the DOM effect was already active
      // before ROUND_STARTED. Challenge state is scoped by roundSessionId.
      this.scanDomEffects(true);
      setTimeout(() => this.scanDomEffects(), 80);
      setTimeout(() => this.scanDomEffects(), 250);
    }
  }

  private emitGuessAttempt(event: Extract<TelemetryEvent, { type: 'GUESS_SUBMITTED' }>): void {
    // Force an exact snapshot immediately before the attempt event. This avoids
    // missing effects that were already active when a new round began.
    this.scanDomEffects(true);
    const activeChallengeKeys: string[] = [];
    const selectedChallengeKeys: string[] = [];
    let directUsed = false;
    let fallbackUsed = false;

    for (const key of Object.values(TYPO_CHALLENGE_KEYS)) {
      const direct = this.directStates.get(key)?.payload;
      if (direct?.selected === true && direct.featureActive !== false) {
        selectedChallengeKeys.push(key);
      }
      const directBlocks = direct?.selected === false || direct?.featureActive === false;
      const directActive = !directBlocks && direct?.effectActive === true;
      const fallbackActive = this.domStates.get(key) === true;
      if (directActive || (!directBlocks && fallbackActive)) {
        activeChallengeKeys.push(key);
        if (directActive) directUsed = true;
        if (!directActive && fallbackActive) fallbackUsed = true;
      }
    }

    const method = directUsed && fallbackUsed
      ? 'mixed'
      : directUsed
        ? 'typo-relay'
        : 'dom-fallback';

    this.telemetryStore.emitDomEvent('TYPO_CHALLENGE_GUESS_ATTEMPT', {
      sourceGuessEventId: event.eventId,
      message: event.payload.message,
      activeChallengeKeys,
      selectedChallengeKeys,
      method
    }, {
      actor: event.actor,
      confidence: directUsed ? 'confirmed' : 'derived',
      occurredAt: event.occurredAt,
      monotonicMs: event.monotonicMs
    });
  }

  private scheduleDomScan(): void {
    if (this.scanTimer !== null) return;
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      this.scanDomEffects();
    }, this.domScanDebounceMs);
  }

  private scanDomEffects(forceEmit = false): void {
    if (typeof document === 'undefined') return;
    for (const key of Object.values(TYPO_CHALLENGE_KEYS)) {
      const active = DOM_EFFECT_READERS[key]();
      const previous = this.domStates.get(key);
      this.domStates.set(key, active);
      if (!forceEmit && previous === active) continue;
      const challengeId = Number(Object.entries(TYPO_CHALLENGE_KEYS).find(([, candidate]) => candidate === key)?.[0] ?? NaN);
      this.telemetryStore.emitDomEvent('TYPO_CHALLENGE_STATE_CHANGED', {
        challengeId: Number.isInteger(challengeId) ? challengeId : null,
        challengeKey: key,
        challengeName: CHALLENGE_NAMES[key],
        selected: null,
        effectActive: active,
        featureActive: null,
        reason: 'dom-fallback',
        method: 'dom-fallback'
      }, {
        confidence: 'derived'
      });
    }
  }
}
