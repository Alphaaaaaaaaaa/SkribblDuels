import { createId } from '../core/ids';
import type { LobbyStateStore } from '../state/lobbyStateStore';
import type { TelemetryStore } from '../telemetry/telemetryStore';

export interface TextInputAttemptState {
  startedAt: number;
  startedAtMonotonicMs: number;
  lastValue: string;
  correctionCount: number;
  pasteDetected: boolean;
  autofillDetected: boolean;
  compositionUsed: boolean;
  trustedInput: boolean;
}

export interface TextInputMeasurement {
  message: string;
  startedAt: number;
  submittedAt: number;
  durationMs: number;
  characterCount: number;
  correctionCount: number;
  pasteDetected: boolean;
  autofillDetected: boolean;
  compositionUsed: boolean;
  trustedInput: boolean;
}

export function countTypingCharacters(value: string): number {
  return Array.from(value.trim().normalize('NFKC')).length;
}

export function createTextInputAttempt(
  value: string,
  occurredAt: number,
  monotonicMs: number,
  trustedInput: boolean
): TextInputAttemptState {
  return {
    startedAt: occurredAt,
    startedAtMonotonicMs: monotonicMs,
    lastValue: value,
    correctionCount: 0,
    pasteDetected: false,
    autofillDetected: false,
    compositionUsed: false,
    trustedInput
  };
}

export function updateTextInputAttempt(
  state: TextInputAttemptState,
  value: string,
  inputType: string,
  trustedInput: boolean
): TextInputAttemptState {
  const deletion = inputType.startsWith('delete') || value.length < state.lastValue.length;
  return {
    ...state,
    lastValue: value,
    correctionCount: state.correctionCount + (deletion ? 1 : 0),
    pasteDetected: state.pasteDetected || inputType === 'insertFromPaste',
    autofillDetected: state.autofillDetected
      || inputType === 'insertReplacementText'
      || inputType === 'insertFromDrop',
    trustedInput: state.trustedInput && trustedInput
  };
}

export function completeTextInputAttempt(
  state: TextInputAttemptState,
  message: string,
  submittedAt: number,
  submittedAtMonotonicMs: number,
  trustedSubmit: boolean
): TextInputMeasurement {
  return {
    message: message.trim(),
    startedAt: state.startedAt,
    submittedAt,
    durationMs: Math.max(0, Math.round(submittedAtMonotonicMs - state.startedAtMonotonicMs)),
    characterCount: countTypingCharacters(message),
    correctionCount: state.correctionCount,
    pasteDetected: state.pasteDetected,
    autofillDetected: state.autofillDetected,
    compositionUsed: state.compositionUsed,
    trustedInput: state.trustedInput && trustedSubmit
  };
}

export interface TextInputTelemetryAdapterOptions {
  now?: () => number;
  monotonicNow?: () => number;
  createAttemptId?: () => string;
}

/**
 * Captures local typing timing without interfering with Skribbl or Typo. It
 * intentionally listens at the document boundary because both chat inputs are
 * replaced dynamically throughout the game lifecycle.
 */
export class TextInputTelemetryAdapter {
  private readonly attempts = new WeakMap<HTMLInputElement, TextInputAttemptState>();
  private started = false;
  private composingInput: HTMLInputElement | null = null;
  private lastEmission: { message: string; occurredAt: number } | null = null;
  private readonly now: () => number;
  private readonly monotonicNow: () => number;
  private readonly createAttemptId: () => string;

  public constructor(
    private readonly telemetryStore: TelemetryStore,
    private readonly lobbyStore: LobbyStateStore,
    options: TextInputTelemetryAdapterOptions = {}
  ) {
    this.now = options.now ?? (() => Date.now());
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
    this.createAttemptId = options.createAttemptId ?? createId;
  }

  public start(): void {
    if (this.started) return;
    this.started = true;
    document.addEventListener('input', this.onInput, true);
    document.addEventListener('paste', this.onPaste, true);
    document.addEventListener('compositionstart', this.onCompositionStart, true);
    document.addEventListener('compositionend', this.onCompositionEnd, true);
    document.addEventListener('keydown', this.onKeydown, true);
  }

  public stop(): void {
    if (!this.started) return;
    this.started = false;
    document.removeEventListener('input', this.onInput, true);
    document.removeEventListener('paste', this.onPaste, true);
    document.removeEventListener('compositionstart', this.onCompositionStart, true);
    document.removeEventListener('compositionend', this.onCompositionEnd, true);
    document.removeEventListener('keydown', this.onKeydown, true);
    this.composingInput = null;
  }

  private readonly onInput = (event: Event): void => {
    const input = this.chatInput(event.target);
    if (!input) return;
    const value = input.value;
    if (value.length === 0) {
      this.attempts.delete(input);
      return;
    }
    const inputType = event instanceof InputEvent ? event.inputType : '';
    const existing = this.attempts.get(input);
    const next = existing
      ? updateTextInputAttempt(existing, value, inputType, event.isTrusted)
      : createTextInputAttempt(value, this.now(), this.monotonicNow(), event.isTrusted);
    if (inputType === 'insertFromPaste') next.pasteDetected = true;
    if (this.composingInput === input || (event instanceof InputEvent && event.isComposing)) {
      next.compositionUsed = true;
    }
    this.attempts.set(input, next);
  };

  private readonly onPaste = (event: Event): void => {
    const input = this.chatInput(event.target);
    if (!input) return;
    const state = this.attempts.get(input)
      ?? createTextInputAttempt(input.value, this.now(), this.monotonicNow(), event.isTrusted);
    state.pasteDetected = true;
    state.trustedInput = state.trustedInput && event.isTrusted;
    this.attempts.set(input, state);
  };

  private readonly onCompositionStart = (event: Event): void => {
    const input = this.chatInput(event.target);
    if (!input) return;
    this.composingInput = input;
    const state = this.attempts.get(input)
      ?? createTextInputAttempt(input.value, this.now(), this.monotonicNow(), event.isTrusted);
    state.compositionUsed = true;
    state.trustedInput = state.trustedInput && event.isTrusted;
    this.attempts.set(input, state);
  };

  private readonly onCompositionEnd = (event: Event): void => {
    const input = this.chatInput(event.target);
    if (!input) return;
    const state = this.attempts.get(input);
    if (state) {
      state.compositionUsed = true;
      state.trustedInput = state.trustedInput && event.isTrusted;
    }
    if (this.composingInput === input) this.composingInput = null;
  };

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || event.repeat || event.isComposing) return;
    const input = this.chatInput(event.target);
    if (!input) return;
    const message = input.value.trim();
    const occurredAt = this.now();
    const monotonicMs = this.monotonicNow();
    const state = this.attempts.get(input)
      ?? createTextInputAttempt(input.value, occurredAt, monotonicMs, event.isTrusted);
    this.attempts.delete(input);
    if (!message || message.startsWith('/')) return;
    // Typo mirrors its command/chat value into Skribbl's native input. Suppress
    // the second key event if both surfaces submit the same text in one frame.
    if (this.lastEmission?.message === message && occurredAt - this.lastEmission.occurredAt <= 100) return;
    this.lastEmission = { message, occurredAt };
    const measurement = completeTextInputAttempt(
      state,
      message,
      occurredAt,
      monotonicMs,
      event.isTrusted
    );
    const lobby = this.lobbyStore.getSnapshot();
    const self = lobby.meId === null ? null : lobby.users[String(lobby.meId)] ?? null;
    const eligibleGuess = lobby.game.stateId === 4
      && lobby.meId !== null
      && lobby.meId !== lobby.game.drawerId
      && self?.guessed !== true;
    this.telemetryStore.emitDomEvent('TEXT_INPUT_MEASURED', {
      attemptId: this.createAttemptId(),
      ...measurement,
      eligibleGuess,
      inputSource: input.id === 'typo-command-input' ? 'typo' : 'vanilla'
    }, {
      actor: self ? { playerId: self.id, name: self.name, isSelf: true } : null,
      confidence: measurement.trustedInput ? 'confirmed' : 'provisional',
      occurredAt,
      monotonicMs
    });
  };

  private chatInput(target: EventTarget | null): HTMLInputElement | null {
    if (!(target instanceof HTMLInputElement)) return null;
    return target.matches('#newChat, #game-chat input:not([type="hidden"]), #typo-command-input')
      ? target
      : null;
  }
}
