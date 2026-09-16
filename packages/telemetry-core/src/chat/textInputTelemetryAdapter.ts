import { createId } from '../core/ids';
import type { LobbyStateStore } from '../state/lobbyStateStore';
import type { TelemetryStore } from '../telemetry/telemetryStore';

export interface TextInputAttemptState {
  startedAt: number;
  startedAtMonotonicMs: number;
  lastValue: string;
  typedCharacterCount: number;
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
  typedCharacterCount: number;
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
  trustedInput: boolean,
  typedCharacterCount = trustedInput ? countTypingCharacters(value) : 0
): TextInputAttemptState {
  return {
    startedAt: occurredAt,
    startedAtMonotonicMs: monotonicMs,
    lastValue: value,
    typedCharacterCount,
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
  trustedInput: boolean,
  insertedCharacterCount = 0
): TextInputAttemptState {
  const deletion = inputType.startsWith('delete') || value.length < state.lastValue.length;
  return {
    ...state,
    lastValue: value,
    typedCharacterCount: state.typedCharacterCount
      + (trustedInput ? Math.max(0, insertedCharacterCount) : 0),
    correctionCount: state.correctionCount + (deletion ? 1 : 0),
    pasteDetected: state.pasteDetected || inputType === 'insertFromPaste',
    autofillDetected: state.autofillDetected
      || inputType === 'insertReplacementText'
      || inputType === 'insertFromDrop',
    trustedInput: state.trustedInput && trustedInput
  };
}

export function countInsertedTypingCharacters(
  beforeValue: string,
  afterValue: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  inputType: string,
  inputData: string | null
): number {
  if (!inputType.startsWith('insert')) return 0;
  if (inputData !== null) return Array.from(inputData.normalize('NFKC')).length;
  const start = selectionStart ?? beforeValue.length;
  const end = selectionEnd ?? start;
  const prefix = beforeValue.slice(0, start);
  const suffix = beforeValue.slice(end);
  if (!afterValue.startsWith(prefix) || !afterValue.endsWith(suffix)) return 0;
  const insertedEnd = Math.max(prefix.length, afterValue.length - suffix.length);
  return Array.from(afterValue.slice(prefix.length, insertedEnd).normalize('NFKC')).length;
}

export function shouldResetTextInputAttemptBeforeInput(
  value: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  inputType: string
): boolean {
  return value.length > 0
    && inputType.startsWith('delete')
    && selectionStart === 0
    && selectionEnd === value.length;
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
    typedCharacterCount: state.typedCharacterCount,
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
  private readonly beforeInputSnapshots = new WeakMap<HTMLInputElement, {
    value: string;
    selectionStart: number | null;
    selectionEnd: number | null;
    inputType: string;
    trusted: boolean;
  }>();
  private readonly resetBeforeNextInput = new WeakSet<HTMLInputElement>();
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
    document.addEventListener('beforeinput', this.onBeforeInput, true);
    document.addEventListener('input', this.onInput, true);
    document.addEventListener('paste', this.onPaste, true);
    document.addEventListener('compositionstart', this.onCompositionStart, true);
    document.addEventListener('compositionend', this.onCompositionEnd, true);
    document.addEventListener('keydown', this.onKeydown, true);
  }

  public stop(): void {
    if (!this.started) return;
    this.started = false;
    document.removeEventListener('beforeinput', this.onBeforeInput, true);
    document.removeEventListener('input', this.onInput, true);
    document.removeEventListener('paste', this.onPaste, true);
    document.removeEventListener('compositionstart', this.onCompositionStart, true);
    document.removeEventListener('compositionend', this.onCompositionEnd, true);
    document.removeEventListener('keydown', this.onKeydown, true);
    this.composingInput = null;
  }

  private readonly onBeforeInput = (event: Event): void => {
    const input = this.chatInput(event.target);
    if (!input || !(event instanceof InputEvent)) return;
    this.beforeInputSnapshots.set(input, {
      value: input.value,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
      inputType: event.inputType,
      trusted: event.isTrusted
    });
    if (shouldResetTextInputAttemptBeforeInput(
      input.value,
      input.selectionStart,
      input.selectionEnd,
      event.inputType
    )) {
      this.resetBeforeNextInput.add(input);
    }
  };

  private readonly onInput = (event: Event): void => {
    const input = this.chatInput(event.target);
    if (!input) return;
    const value = input.value;
    const before = this.beforeInputSnapshots.get(input);
    this.beforeInputSnapshots.delete(input);
    if (value.length === 0) {
      this.attempts.delete(input);
      this.resetBeforeNextInput.delete(input);
      return;
    }
    const inputType = event instanceof InputEvent ? event.inputType : '';
    const insertedCharacterCount = before && before.trusted && event.isTrusted
      ? countInsertedTypingCharacters(
          before.value,
          value,
          before.selectionStart,
          before.selectionEnd,
          before.inputType || inputType,
          event instanceof InputEvent ? event.data : null
        )
      : 0;
    const resetAttempt = this.resetBeforeNextInput.delete(input);
    const existing = resetAttempt ? undefined : this.attempts.get(input);
    const next = existing
      ? updateTextInputAttempt(existing, value, inputType, event.isTrusted, insertedCharacterCount)
      : createTextInputAttempt(
          value,
          this.now(),
          this.monotonicNow(),
          event.isTrusted,
          insertedCharacterCount
        );
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
      ?? createTextInputAttempt(input.value, occurredAt, monotonicMs, event.isTrusted, 0);
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
