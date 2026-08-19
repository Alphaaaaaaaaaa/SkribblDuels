import type { Subscription } from 'rxjs';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';
import type { TelemetryStore } from '../telemetry/telemetryStore';

export const TYPO_SKD_FILE_LOADED_EVENT_NAME = 'skribbl-duels:typo-skd-loaded';
export const TYPO_SKD_PASTED_EVENT_NAME = 'skribbl-duels:typo-skd-pasted';
export const TYPO_SKD_FILE_LOADED_LEGACY_EVENT_NAME = 'skribblDuelsTypoSkdLoaded';
export const TYPO_SKD_PASTED_LEGACY_EVENT_NAME = 'skribblDuelsTypoSkdPasted';

export interface TypoSkdLoadedPayload {
  fileName: string;
  fingerprint: string;
  commandCount: number;
  loadedFromFile: true;
  method: 'typo-relay' | 'file-input-fallback';
}

export interface TypoSkdPastedPayload {
  fileName: string | null;
  fingerprint: string;
  commandCount: number;
  loadedFromFile: true;
  clearBeforePaste: boolean | null;
  pasteInstant: boolean | null;
  method: 'typo-relay' | 'command-match-fallback';
}

interface LoadedSkd {
  payload: TypoSkdLoadedPayload;
  commandSignatures: string[];
  matchIndices: Record<'telemetry' | 'performed', number>;
}

interface UnknownRecord {
  [key: string]: unknown;
}

function recordValue(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? value as UnknownRecord : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function finiteInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function normalizeCommand(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(item => typeof item === 'number' && Object.is(item, -0) ? 0 : item);
}

export function commandSignature(value: unknown): string | null {
  const command = normalizeCommand(value);
  return command === null ? null : JSON.stringify(command);
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function fingerprintSkdCommands(commands: readonly unknown[]): string {
  const signatures = commands.map(commandSignature).filter((value): value is string => value !== null);
  return `skd-${signatures.length}-${fnv1a(signatures.join('\n'))}`;
}

function parseCommandArray(value: unknown): unknown[][] | null {
  if (!Array.isArray(value)) return null;
  const commands = value.map(normalizeCommand);
  if (commands.some(command => command === null)) return null;
  return commands as unknown[][];
}

export function parseSkdCommandSequences(value: unknown): unknown[][][] {
  const direct = parseCommandArray(value);
  if (direct) return [direct];

  const entries = Array.isArray(value) ? value : [value];
  const sequences: unknown[][][] = [];
  for (const entry of entries) {
    const record = recordValue(entry);
    if (!record) continue;
    const commands = parseCommandArray(record.commands);
    if (commands) sequences.push(commands);
  }
  return sequences;
}

function loadedFromDetail(value: unknown): { payload: TypoSkdLoadedPayload; commands: unknown[][] | null } | null {
  const wrapper = recordValue(value);
  if (!wrapper) return null;
  const nested = recordValue(wrapper.detail ?? wrapper.payload ?? wrapper.file);
  const raw = nested ?? wrapper;
  const commands = parseCommandArray(raw.commands);
  const commandCount = finiteInteger(raw.commandCount) ?? commands?.length ?? null;
  const fileName = stringValue(raw.fileName ?? raw.name);
  const fingerprint = stringValue(raw.fingerprint) ?? (commands ? fingerprintSkdCommands(commands) : null);
  if (fileName === null || commandCount === null || fingerprint === null) return null;
  return {
    payload: {
      fileName,
      fingerprint,
      commandCount,
      loadedFromFile: true,
      method: 'typo-relay'
    },
    commands
  };
}

function pastedFromDetail(value: unknown): TypoSkdPastedPayload | null {
  const wrapper = recordValue(value);
  if (!wrapper) return null;
  const nested = recordValue(wrapper.detail ?? wrapper.payload ?? wrapper.commands);
  const raw = nested ?? wrapper;
  const commands = parseCommandArray(raw.commands);
  const commandCount = finiteInteger(raw.commandCount) ?? commands?.length ?? null;
  const fingerprint = stringValue(raw.fingerprint) ?? (commands ? fingerprintSkdCommands(commands) : null);
  if (commandCount === null || fingerprint === null || raw.loadedFromFile === false) return null;
  return {
    fileName: stringValue(raw.fileName ?? raw.name),
    fingerprint,
    commandCount,
    loadedFromFile: true,
    clearBeforePaste: nullableBoolean(raw.clearBeforePaste),
    pasteInstant: nullableBoolean(raw.pasteInstant),
    method: 'typo-relay'
  };
}

export class TypoAutodrawTelemetryAdapter {
  private readonly loaded = new Map<string, LoadedSkd>();
  private readonly emittedPasteKeys = new Set<string>();
  private readonly recentLoadAt = new Map<string, number>();
  private telemetrySubscription: Subscription | null = null;
  private originalFileInputClick: typeof HTMLInputElement.prototype.click | null = null;
  private patchedFileInputClick: typeof HTMLInputElement.prototype.click | null = null;
  private ownDrawingActive = false;

  public constructor(private readonly telemetryStore: TelemetryStore) {}

  public start(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('change', this.handleFileInputChange, true);
      document.addEventListener('performDrawCommand', this.handlePerformedDrawCommand, true);
    }
    this.patchDetachedFileInputs();
    if (typeof window !== 'undefined') {
      window.addEventListener(TYPO_SKD_FILE_LOADED_EVENT_NAME, this.handleDirectLoaded as EventListener, true);
      window.addEventListener(TYPO_SKD_FILE_LOADED_LEGACY_EVENT_NAME, this.handleDirectLoaded as EventListener, true);
      window.addEventListener(TYPO_SKD_PASTED_EVENT_NAME, this.handleDirectPasted as EventListener, true);
      window.addEventListener(TYPO_SKD_PASTED_LEGACY_EVENT_NAME, this.handleDirectPasted as EventListener, true);
      window.addEventListener('message', this.handleWindowMessage, true);
    }
    this.telemetrySubscription = this.telemetryStore.events$.subscribe(event => this.handleTelemetry(event));
  }

  public stop(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('change', this.handleFileInputChange, true);
      document.removeEventListener('performDrawCommand', this.handlePerformedDrawCommand, true);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener(TYPO_SKD_FILE_LOADED_EVENT_NAME, this.handleDirectLoaded as EventListener, true);
      window.removeEventListener(TYPO_SKD_FILE_LOADED_LEGACY_EVENT_NAME, this.handleDirectLoaded as EventListener, true);
      window.removeEventListener(TYPO_SKD_PASTED_EVENT_NAME, this.handleDirectPasted as EventListener, true);
      window.removeEventListener(TYPO_SKD_PASTED_LEGACY_EVENT_NAME, this.handleDirectPasted as EventListener, true);
      window.removeEventListener('message', this.handleWindowMessage, true);
    }
    this.restoreFileInputClick();
    this.telemetrySubscription?.unsubscribe();
    this.telemetrySubscription = null;
    this.loaded.clear();
    this.emittedPasteKeys.clear();
    this.recentLoadAt.clear();
    this.ownDrawingActive = false;
  }

  private patchDetachedFileInputs(): void {
    if (typeof HTMLInputElement === 'undefined' || this.originalFileInputClick) return;
    const adapter = this;
    const original = HTMLInputElement.prototype.click;
    const patched = function(this: HTMLInputElement): void {
      // Typo creates its image-lab picker as a detached input and some builds
      // omit the accept=".skd" attribute. Observe every detached file picker;
      // handleFileInputChange still filters strictly by the selected filename.
      if (this.type === 'file') {
        this.addEventListener('change', adapter.handleFileInputChange, { once: true });
      }
      original.call(this);
    };
    this.originalFileInputClick = original;
    this.patchedFileInputClick = patched;
    HTMLInputElement.prototype.click = patched;
  }

  private restoreFileInputClick(): void {
    if (typeof HTMLInputElement === 'undefined') return;
    if (this.originalFileInputClick && this.patchedFileInputClick && HTMLInputElement.prototype.click === this.patchedFileInputClick) {
      HTMLInputElement.prototype.click = this.originalFileInputClick;
    }
    this.originalFileInputClick = null;
    this.patchedFileInputClick = null;
  }

  private readonly handleFileInputChange = (event: Event): void => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.files) return;
    const files = [...input.files].filter(file => file.name.toLocaleLowerCase().endsWith('.skd'));
    for (const file of files) void this.readFile(file);
  };

  private async readFile(file: File): Promise<void> {
    try {
      // Current Typo .skd exports are collections of { name, commands }
      // records; older exports can be a bare command array. Register every
      // contained drawing so using any entry can be matched later.
      const sequences = parseSkdCommandSequences(JSON.parse(await file.text()));
      for (const commands of sequences) {
        const payload: TypoSkdLoadedPayload = {
          fileName: file.name,
          fingerprint: fingerprintSkdCommands(commands),
          commandCount: commands.length,
          loadedFromFile: true,
          method: 'file-input-fallback'
        };
        this.registerLoaded(payload, commands, 'confirmed');
      }
    } catch (error) {
      console.warn('[Skribbl Duels Autodraw] Failed to parse selected .skd file.', file.name, error);
    }
  }

  private readonly handleDirectLoaded = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const normalized = loadedFromDetail(event.detail);
    if (normalized) this.registerLoaded(normalized.payload, normalized.commands, 'confirmed');
  };

  private readonly handleDirectPasted = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const payload = pastedFromDetail(event.detail);
    if (payload) this.emitPasted(payload, 'confirmed');
  };

  private readonly handleWindowMessage = (event: MessageEvent): void => {
    if (event.source !== window) return;
    const data = recordValue(event.data);
    if (!data) return;
    const type = stringValue(data.type);
    if (type === TYPO_SKD_FILE_LOADED_EVENT_NAME || type === TYPO_SKD_FILE_LOADED_LEGACY_EVENT_NAME) {
      const normalized = loadedFromDetail(data.detail ?? data.payload ?? data);
      if (normalized) this.registerLoaded(normalized.payload, normalized.commands, 'confirmed');
    } else if (type === TYPO_SKD_PASTED_EVENT_NAME || type === TYPO_SKD_PASTED_LEGACY_EVENT_NAME) {
      const payload = pastedFromDetail(data.detail ?? data.payload ?? data);
      if (payload) this.emitPasted(payload, 'confirmed');
    }
  };

  private registerLoaded(
    payload: TypoSkdLoadedPayload,
    commands: unknown[][] | null,
    confidence: 'confirmed' | 'derived'
  ): void {
    const commandSignatures = commands?.map(command => commandSignature(command) as string) ?? [];
    this.loaded.set(payload.fingerprint, {
      payload,
      commandSignatures,
      matchIndices: { telemetry: 0, performed: 0 }
    });
    const now = Date.now();
    const previousLoadAt = this.recentLoadAt.get(payload.fingerprint);
    this.recentLoadAt.set(payload.fingerprint, now);
    if (previousLoadAt !== undefined && now - previousLoadAt <= 1500) return;
    this.telemetryStore.emitDomEvent('TYPO_SKD_FILE_LOADED', payload, {
      actor: { playerId: null, name: null, isSelf: true },
      confidence
    });
  }

  private emitPasted(
    payload: TypoSkdPastedPayload,
    confidence: 'confirmed' | 'derived'
  ): void {
    const loaded = this.loaded.get(payload.fingerprint);
    if (loaded === undefined && payload.method !== 'typo-relay') return;
    const normalized: TypoSkdPastedPayload = {
      ...payload,
      fileName: payload.fileName ?? loaded?.payload.fileName ?? null,
      loadedFromFile: true
    };
    const key = `${normalized.fingerprint}|${normalized.commandCount}`;
    if (this.emittedPasteKeys.has(key)) return;
    this.emittedPasteKeys.add(key);
    this.telemetryStore.emitDomEvent('TYPO_SKD_PASTED', normalized, {
      actor: { playerId: null, name: null, isSelf: true },
      confidence
    });
  }

  private handleTelemetry(event: TelemetryEvent): void {
    this.ownDrawingActive = event.context.meId !== null
      && event.context.drawerId === event.context.meId
      && event.context.roundSessionId !== null;
    if (event.type === 'LOBBY_CHANGED') {
      for (const loaded of this.loaded.values()) {
        loaded.matchIndices.telemetry = 0;
        loaded.matchIndices.performed = 0;
      }
      this.emittedPasteKeys.clear();
      return;
    }
    if (event.type !== 'DRAW_COMMAND_BATCH_SUBMITTED') return;
    if (event.context.meId === null || event.context.drawerId !== event.context.meId) return;
    for (const command of event.payload.commands) {
      const signature = commandSignature(command.raw);
      if (signature === null) continue;
      for (const loaded of this.loaded.values()) this.consumeSignature(loaded, signature, 'telemetry');
    }
  }

  private readonly handlePerformedDrawCommand = (event: Event): void => {
    if (!this.ownDrawingActive || !(event instanceof CustomEvent)) return;
    const detail = recordValue(event.detail);
    const command = detail?.command ?? detail?.raw ?? event.detail;
    const signature = commandSignature(command);
    if (signature === null) return;
    for (const loaded of this.loaded.values()) this.consumeSignature(loaded, signature, 'performed');
  };

  private consumeSignature(
    loaded: LoadedSkd,
    signature: string,
    source: 'telemetry' | 'performed'
  ): void {
    if (loaded.commandSignatures.length === 0) return;
    const matchIndex = loaded.matchIndices[source];
    const expected = loaded.commandSignatures[matchIndex];
    if (signature === expected) {
      loaded.matchIndices[source] += 1;
    } else {
      loaded.matchIndices[source] = signature === loaded.commandSignatures[0] ? 1 : 0;
    }
    if (loaded.matchIndices[source] < loaded.commandSignatures.length) return;
    loaded.matchIndices[source] = 0;
    this.emitPasted({
      fileName: loaded.payload.fileName,
      fingerprint: loaded.payload.fingerprint,
      commandCount: loaded.payload.commandCount,
      loadedFromFile: true,
      clearBeforePaste: null,
      pasteInstant: null,
      method: 'command-match-fallback'
    }, 'derived');
  }
}
