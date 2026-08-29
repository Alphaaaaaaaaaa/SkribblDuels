import type {
  TelemetryEvent,
  TelemetryEventOf
} from '@skribbl-duels/telemetry-contracts';
import {
  calculateLocalTypingWpm,
  countTypingCharacters,
  localStatsWordMatchKey
} from '@skribbl-duels/telemetry-core';
import type {
  GuessTimeChatDisplayMode,
  WpmChatDisplayMode
} from '@skribbl-duels/product-core';

const MIN_DISPLAY_TYPING_MS = 250;
const MAX_DISPLAY_TYPING_MS = 300_000;
const MAX_DISPLAY_WPM = 609;
const MEASUREMENT_CORRELATION_MS = 5_000;
const CORRECT_GUESS_CORRELATION_MS = 5_000;
const DOM_CORRELATION_BEFORE_MS = 2_000;
const DOM_CORRELATION_AFTER_MS = 8_000;
const MAX_PENDING_MEASUREMENTS = 64;
const MAX_PENDING_ANNOTATIONS = 96;
const MAX_PROCESSED_EVENTS = 256;
const MAX_ROUND_TIMINGS = 64;
const MAX_TRACKED_LINES = 256;

interface PendingMeasurement {
  attemptId: string;
  occurredAt: number;
  roundKey: string | null;
  messageKey: string;
  wpm: number | null;
}

interface PendingSubmission {
  attemptId: string | null;
  submittedAt: number;
  roundKey: string;
  messageKey: string;
  wpm: number | null;
}

interface ChatLineCandidate {
  line: HTMLElement;
  observedAt: number;
}

export interface ChatStatAnnotation {
  id: string;
  supersedesId: string | null;
  kind: 'message' | 'correct-guess';
  playerName: string;
  message: string | null;
  isSelf: boolean;
  occurredAt: number;
  wpm: number | null;
  guessElapsedMs: number | null;
  guessDeltaMs: number | null;
  guessPosition: number | null;
}

export interface ChatStatDisplaySettings {
  wpmDisplay: WpmChatDisplayMode;
  guessTimeDisplay: GuessTimeChatDisplayMode;
}

export interface ChatStatRenderPart {
  kind: 'guess-time' | 'wpm';
  text: string;
  className: string;
}

function boundedMapSet<TKey, TValue>(map: Map<TKey, TValue>, key: TKey, value: TValue): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_ROUND_TIMINGS) {
    const oldest = map.keys().next().value as TKey | undefined;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function roundKey(event: TelemetryEvent): string | null {
  const roundSessionId = event.context.roundSessionId;
  if (roundSessionId === null) return null;
  return `${event.context.lobbySessionId ?? 'unknown-lobby'}:${roundSessionId}`;
}

function isSelfEvent(event: TelemetryEvent): boolean {
  return event.actor?.isSelf === true
    || (event.context.meId !== null && event.actor?.playerId === event.context.meId);
}

function measuredDisplayWpm(event: TelemetryEventOf<'TEXT_INPUT_MEASURED'>): number | null {
  const payload = event.payload;
  const wpm = calculateLocalTypingWpm(payload.characterCount, payload.durationMs);
  const valid = isSelfEvent(event)
    && event.source.origin === 'dom-adapter'
    && event.confidence === 'confirmed'
    && payload.trustedInput
    && !payload.pasteDetected
    && !payload.autofillDetected
    && payload.characterCount === countTypingCharacters(payload.message)
    && payload.durationMs >= MIN_DISPLAY_TYPING_MS
    && payload.durationMs <= MAX_DISPLAY_TYPING_MS
    && wpm !== null
    && wpm <= MAX_DISPLAY_WPM;
  return valid && wpm !== null ? Math.round(wpm) : null;
}

function normalizedChatText(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function formatChatStatDuration(durationMs: number, relative = false): string | null {
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  const roundedMs = Math.round(durationMs);
  const prefix = relative ? '+' : '';
  if (roundedMs < 1_000) return `${prefix}${roundedMs}ms`;

  const minutes = Math.floor(roundedMs / 60_000);
  const remainderMs = roundedMs % 60_000;
  const seconds = Math.floor(remainderMs / 1_000);
  const milliseconds = remainderMs % 1_000;
  const secondsText = milliseconds === 0
    ? String(seconds)
    : `${seconds}.${String(milliseconds).padStart(3, '0')}`;
  return minutes > 0
    ? `${prefix}${minutes}m ${secondsText}s`
    : `${prefix}${secondsText}s`;
}

export function resolveChatStatRenderParts(
  annotation: ChatStatAnnotation,
  settings: ChatStatDisplaySettings
): ChatStatRenderPart[] {
  const parts: ChatStatRenderPart[] = [];
  const showGuessTime = annotation.kind === 'correct-guess'
    && (settings.guessTimeDisplay === 'all-guesses'
      || (settings.guessTimeDisplay === 'self-guesses' && annotation.isSelf));
  if (showGuessTime && annotation.guessElapsedMs !== null) {
    const laterGuess = annotation.guessPosition === null
      ? annotation.guessDeltaMs !== null
      : annotation.guessPosition > 1;
    const relative = settings.guessTimeDisplay === 'all-guesses'
      && laterGuess
      && annotation.guessDeltaMs !== null;
    const formatted = formatChatStatDuration(
      relative ? annotation.guessDeltaMs as number : annotation.guessElapsedMs,
      relative
    );
    if (formatted) {
      parts.push({
        kind: 'guess-time',
        text: `(${formatted})`,
        className: 'scd-chat-stat scd-chat-guess-time'
      });
    }
  }

  const showWpm = annotation.wpm !== null
    && (settings.wpmDisplay === 'all-typed-messages'
      || (settings.wpmDisplay === 'correct-guesses' && annotation.kind === 'correct-guess'));
  if (showWpm) {
    parts.push({
      kind: 'wpm',
      text: `${annotation.wpm}wpm`,
      className: 'scd-chat-stat scd-chat-wpm scd-muted'
    });
  }
  return parts;
}

export function chatStatAnnotationMatchesLine(
  annotation: ChatStatAnnotation,
  lineText: string
): boolean {
  const text = normalizedChatText(lineText);
  const playerName = normalizedChatText(annotation.playerName);
  if (!playerName || !text.startsWith(playerName)) return false;
  const remainder = text.slice(playerName.length).trimStart();
  if (annotation.kind === 'correct-guess') {
    return remainder === 'guessed the word!'
      || remainder.startsWith('guessed the word! ');
  }
  if (annotation.message === null || !remainder.startsWith(':')) return false;
  return normalizedChatText(remainder.slice(1)) === normalizedChatText(annotation.message);
}

export class ChatStatTelemetryTracker {
  private pendingMeasurements: PendingMeasurement[] = [];
  private readonly pendingSubmissionByRound = new Map<string, PendingSubmission>();
  private readonly previousGuessElapsedByRound = new Map<string, number>();
  private readonly processedEventIds = new Set<string>();
  private processedEventOrder: string[] = [];

  public observe(event: TelemetryEvent): ChatStatAnnotation[] {
    if (!this.isRelevant(event) || this.processedEventIds.has(event.eventId)) return [];
    this.rememberEvent(event.eventId);

    if (event.type === 'LOBBY_CHANGED' || event.type === 'TYPO_LOBBY_LEFT') {
      this.resetTransientState();
      return [];
    }
    if (event.type === 'ROUND_STARTED' || event.type === 'DRAWING_STARTED') {
      this.pendingMeasurements = [];
      this.pendingSubmissionByRound.clear();
      this.previousGuessElapsedByRound.clear();
      return [];
    }

    if (event.type === 'TEXT_INPUT_MEASURED') {
      if (!isSelfEvent(event)) return [];
      const messageKey = localStatsWordMatchKey(event.payload.message);
      const measurement: PendingMeasurement = {
        attemptId: event.payload.attemptId,
        occurredAt: event.occurredAt,
        roundKey: roundKey(event),
        messageKey,
        wpm: measuredDisplayWpm(event)
      };
      this.pendingMeasurements = this.pendingMeasurements.filter(candidate => {
        const ageMs = event.occurredAt - candidate.occurredAt;
        return ageMs >= 0 && ageMs <= MEASUREMENT_CORRELATION_MS;
      });
      this.pendingMeasurements.push(measurement);
      this.pendingMeasurements = this.pendingMeasurements.slice(-MAX_PENDING_MEASUREMENTS);
      const playerName = event.actor?.name?.trim() ?? '';
      return measurement.wpm !== null && playerName
        ? [{
            id: `message:${event.payload.attemptId}`,
            supersedesId: null,
            kind: 'message',
            playerName,
            message: event.payload.message,
            isSelf: true,
            occurredAt: event.occurredAt,
            wpm: measurement.wpm,
            guessElapsedMs: null,
            guessDeltaMs: null,
            guessPosition: null
          }]
        : [];
    }

    if (event.type === 'GUESS_SUBMITTED') {
      if (!isSelfEvent(event)) return [];
      const key = roundKey(event);
      const messageKey = localStatsWordMatchKey(event.payload.message ?? '');
      let measurement: PendingMeasurement | null = null;
      for (let index = this.pendingMeasurements.length - 1; index >= 0; index -= 1) {
        const candidate = this.pendingMeasurements[index];
        if (!candidate) continue;
        const ageMs = event.occurredAt - candidate.occurredAt;
        if (ageMs > MEASUREMENT_CORRELATION_MS) break;
        if (ageMs >= 0 && candidate.roundKey === key && candidate.messageKey === messageKey) {
          measurement = candidate;
          break;
        }
      }
      this.pendingMeasurements = [];
      if (key !== null) {
        boundedMapSet(this.pendingSubmissionByRound, key, {
          attemptId: measurement?.attemptId ?? null,
          submittedAt: event.occurredAt,
          roundKey: key,
          messageKey,
          wpm: measurement?.wpm ?? null
        });
      }
      return [];
    }

    if (event.type !== 'CORRECT_GUESS') return [];
    const key = roundKey(event);
    const elapsedMs = event.payload.elapsedMs !== null && event.payload.elapsedMs >= 0
      ? Math.round(event.payload.elapsedMs)
      : null;
    const previousElapsedMs = key === null
      ? null
      : this.previousGuessElapsedByRound.get(key) ?? null;
    const deltaMs = elapsedMs !== null && previousElapsedMs !== null && elapsedMs >= previousElapsedMs
      ? elapsedMs - previousElapsedMs
      : null;
    if (key !== null && elapsedMs !== null) {
      boundedMapSet(this.previousGuessElapsedByRound, key, elapsedMs);
    }

    const self = isSelfEvent(event);
    const pending = self && key !== null
      ? this.pendingSubmissionByRound.get(key) ?? null
      : null;
    const responseDelayMs = pending === null ? null : event.occurredAt - pending.submittedAt;
    const revealedWordKey = localStatsWordMatchKey(event.payload.word ?? '');
    const wordMatches = pending !== null && (
      !event.payload.includesWord
      || revealedWordKey.length === 0
      || revealedWordKey === pending.messageKey
    );
    const correlatedWpm = pending !== null
      && pending.attemptId !== null
      && pending.roundKey === key
      && responseDelayMs !== null
      && responseDelayMs >= 0
      && responseDelayMs <= CORRECT_GUESS_CORRELATION_MS
      && wordMatches
      ? pending.wpm
      : null;
    if (self && key !== null) this.pendingSubmissionByRound.delete(key);

    const playerName = event.actor?.name?.trim() ?? '';
    return playerName
      ? [{
          id: `correct:${event.eventId}`,
          supersedesId: pending?.attemptId ? `message:${pending.attemptId}` : null,
          kind: 'correct-guess',
          playerName,
          message: null,
          isSelf: self,
          occurredAt: event.occurredAt,
          wpm: correlatedWpm,
          guessElapsedMs: elapsedMs,
          guessDeltaMs: deltaMs,
          guessPosition: event.payload.position
        }]
      : [];
  }

  public reset(): void {
    this.resetTransientState();
    this.processedEventIds.clear();
    this.processedEventOrder = [];
  }

  private isRelevant(event: TelemetryEvent): boolean {
    return event.type === 'TEXT_INPUT_MEASURED'
      || event.type === 'GUESS_SUBMITTED'
      || event.type === 'CORRECT_GUESS'
      || event.type === 'ROUND_STARTED'
      || event.type === 'DRAWING_STARTED'
      || event.type === 'LOBBY_CHANGED'
      || event.type === 'TYPO_LOBBY_LEFT';
  }

  private rememberEvent(eventId: string): void {
    this.processedEventIds.add(eventId);
    this.processedEventOrder.push(eventId);
    while (this.processedEventOrder.length > MAX_PROCESSED_EVENTS) {
      const oldest = this.processedEventOrder.shift();
      if (oldest) this.processedEventIds.delete(oldest);
    }
  }

  private resetTransientState(): void {
    this.pendingMeasurements = [];
    this.pendingSubmissionByRound.clear();
    this.previousGuessElapsedByRound.clear();
  }
}

export interface SkribblChatStatDisplayOptions {
  runtimeId: string;
  getSettings(): ChatStatDisplaySettings;
  now?: () => number;
}

export class SkribblChatStatDisplay {
  private readonly tracker = new ChatStatTelemetryTracker();
  private readonly knownLines = new WeakSet<HTMLElement>();
  private readonly trackedLines = new Map<HTMLElement, ChatStatAnnotation>();
  private pendingAnnotations: ChatStatAnnotation[] = [];
  private candidates: ChatLineCandidate[] = [];
  private observer: MutationObserver | null = null;
  private mountGuard: number | null = null;
  private started = false;
  private readonly now: () => number;

  public constructor(private readonly options: SkribblChatStatDisplayOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  public start(): void {
    if (this.started) return;
    this.started = true;
    this.removeStatSpans(true);
    this.scanForNewLines(false);
    this.ensureObserver();
    this.mountGuard = window.setInterval(() => {
      this.ensureObserver();
      this.scanForNewLines(true);
    }, 500);
  }

  public observe(event: TelemetryEvent): void {
    const annotations = this.tracker.observe(event);
    if (annotations.length === 0) return;
    for (const annotation of annotations) {
      if (annotation.supersedesId !== null) {
        this.pendingAnnotations = this.pendingAnnotations.filter(candidate =>
          candidate.id !== annotation.supersedesId
        );
      }
    }
    this.pendingAnnotations.push(...annotations);
    this.pendingAnnotations = this.pendingAnnotations.slice(-MAX_PENDING_ANNOTATIONS);
    this.scanForNewLines(true);
  }

  public refresh(): void {
    this.scanForNewLines(true);
    for (const [line, annotation] of this.trackedLines) {
      if (!line.isConnected) {
        this.trackedLines.delete(line);
        continue;
      }
      this.renderLine(line, annotation);
    }
  }

  public stop(): void {
    if (!this.started) return;
    this.started = false;
    this.observer?.disconnect();
    this.observer = null;
    if (this.mountGuard !== null) window.clearInterval(this.mountGuard);
    this.mountGuard = null;
    this.removeStatSpans(false);
    this.trackedLines.clear();
    this.pendingAnnotations = [];
    this.candidates = [];
    this.tracker.reset();
  }

  private ensureObserver(): void {
    if (this.observer || typeof MutationObserver === 'undefined' || !document.documentElement) return;
    this.observer = new MutationObserver(() => this.scanForNewLines(true));
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  private scanForNewLines(addCandidates: boolean): void {
    const observedAt = this.now();
    document.querySelectorAll<HTMLElement>('#game-chat .chat-content p:not(.skribbl-duels-completion)').forEach(line => {
      if (this.knownLines.has(line)) return;
      this.knownLines.add(line);
      if (addCandidates) this.candidates.push({ line, observedAt });
    });
    this.candidates = this.candidates.slice(-MAX_PENDING_ANNOTATIONS);
    this.reconcile(observedAt);
  }

  private reconcile(now: number): void {
    for (const line of this.trackedLines.keys()) {
      if (!line.isConnected) this.trackedLines.delete(line);
    }
    this.pendingAnnotations = this.pendingAnnotations.filter(annotation =>
      now - annotation.occurredAt <= DOM_CORRELATION_AFTER_MS
    );
    this.candidates = this.candidates.filter(candidate =>
      candidate.line.isConnected && now - candidate.observedAt <= DOM_CORRELATION_AFTER_MS
    );

    for (let annotationIndex = 0; annotationIndex < this.pendingAnnotations.length;) {
      const annotation = this.pendingAnnotations[annotationIndex];
      if (!annotation) break;
      const candidateIndex = this.candidates.findIndex(candidate => {
        const timingDelta = candidate.observedAt - annotation.occurredAt;
        return timingDelta >= -DOM_CORRELATION_BEFORE_MS
          && timingDelta <= DOM_CORRELATION_AFTER_MS
          && chatStatAnnotationMatchesLine(annotation, candidate.line.textContent ?? '');
      });
      if (candidateIndex < 0) {
        annotationIndex += 1;
        continue;
      }
      const candidate = this.candidates.splice(candidateIndex, 1)[0];
      this.pendingAnnotations.splice(annotationIndex, 1);
      if (!candidate) continue;
      this.trackedLines.delete(candidate.line);
      this.trackedLines.set(candidate.line, annotation);
      while (this.trackedLines.size > MAX_TRACKED_LINES) {
        const oldest = this.trackedLines.keys().next().value as HTMLElement | undefined;
        if (!oldest) break;
        this.removeOwnedSpans(oldest);
        this.trackedLines.delete(oldest);
      }
      this.renderLine(candidate.line, annotation);
    }
  }

  private renderLine(line: HTMLElement, annotation: ChatStatAnnotation): void {
    this.removeOwnedSpans(line);
    const parts = resolveChatStatRenderParts(annotation, this.options.getSettings());
    for (const part of parts) {
      const span = document.createElement('span');
      span.className = part.className;
      span.dataset.scdChatStatRuntime = this.options.runtimeId;
      span.dataset.scdChatStatKind = part.kind;
      span.textContent = ` ${part.text}`;
      line.appendChild(span);
    }
  }

  private removeOwnedSpans(line: HTMLElement): void {
    line.querySelectorAll<HTMLElement>('[data-scd-chat-stat-runtime]').forEach(node => {
      if (node.dataset.scdChatStatRuntime === this.options.runtimeId) node.remove();
    });
  }

  private removeStatSpans(includeForeignRuntimes: boolean): void {
    document.querySelectorAll<HTMLElement>('[data-scd-chat-stat-runtime]').forEach(node => {
      if (includeForeignRuntimes || node.dataset.scdChatStatRuntime === this.options.runtimeId) {
        node.remove();
      }
    });
  }
}
