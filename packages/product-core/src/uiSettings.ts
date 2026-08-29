import type { BoardUiSettings, LauncherUiSettings, ProductUiSettings } from './types';
import { UI_SETTINGS_VERSION } from './types';

type SettingsListener = (settings: ProductUiSettings) => void;

export const DEFAULT_PRODUCT_UI_SETTINGS: ProductUiSettings = {
  version: UI_SETTINGS_VERSION,
  board: {
    visible: true,
    mode: 'anchor',
    anchor: 'top-right',
    x: 24,
    y: 90,
    scale: 0.82,
    opacity: 1,
    locked: true,
    collapsed: false,
    clickThroughWhenLocked: false,
    showNames: true
  },
  launcher: {
    mode: 'anchor',
    anchor: 'center-right',
    x: 12,
    y: 120,
    size: 60
  },
  panelOpen: false,
  panelTab: 'duel',
  completionMessages: true,
  winAnimation: true,
  chatNotifications: true,
  matchChatMessages: true,
  matchChatCommandPrefix: '/sdchat',
  sfxVolume: 82,
  matchChatPings: true,
  wpmChatDisplay: 'disabled',
  guessTimeChatDisplay: 'disabled'
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeMatchChatCommandPrefix(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const withoutSlashes = raw.replace(/^\/+/, '');
  const commandId = withoutSlashes
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 24)
    .toLocaleLowerCase('en-US');
  return `/${commandId || 'sdchat'}`;
}

export function normalizeProductUiSettings(value: unknown): ProductUiSettings {
  const input = value && typeof value === 'object'
    ? value as Partial<ProductUiSettings>
    : {};
  const boardInput: Partial<BoardUiSettings> = input.board && typeof input.board === 'object'
    ? input.board
    : {};
  const launcherInput: Partial<LauncherUiSettings> = input.launcher && typeof input.launcher === 'object'
    ? input.launcher
    : {};
  const validTabs = new Set(['duel', 'match', 'chat', 'settings', 'about']);
  const validWpmChatDisplays = new Set(['disabled', 'correct-guesses', 'all-typed-messages']);
  const validGuessTimeChatDisplays = new Set(['disabled', 'self-guesses', 'all-guesses']);
  const validAnchors = new Set([
    'top-left', 'top-center', 'top-right', 'center-left',
    'center-right', 'bottom-left', 'bottom-center', 'bottom-right'
  ]);

  return {
    version: UI_SETTINGS_VERSION,
    board: {
      visible: typeof boardInput.visible === 'boolean'
        ? boardInput.visible
        : DEFAULT_PRODUCT_UI_SETTINGS.board.visible,
      mode: boardInput.mode === 'custom' ? 'custom' : 'anchor',
      anchor: validAnchors.has(String(boardInput.anchor))
        ? boardInput.anchor as ProductUiSettings['board']['anchor']
        : DEFAULT_PRODUCT_UI_SETTINGS.board.anchor,
      x: Number.isFinite(boardInput.x) ? Number(boardInput.x) : DEFAULT_PRODUCT_UI_SETTINGS.board.x,
      y: Number.isFinite(boardInput.y) ? Number(boardInput.y) : DEFAULT_PRODUCT_UI_SETTINGS.board.y,
      scale: clamp(Number(boardInput.scale) || DEFAULT_PRODUCT_UI_SETTINGS.board.scale, 0.5, 1.6),
      opacity: clamp(Number(boardInput.opacity) || DEFAULT_PRODUCT_UI_SETTINGS.board.opacity, 0.35, 1),
      locked: typeof boardInput.locked === 'boolean'
        ? boardInput.locked
        : DEFAULT_PRODUCT_UI_SETTINGS.board.locked,
      collapsed: typeof boardInput.collapsed === 'boolean'
        ? boardInput.collapsed
        : DEFAULT_PRODUCT_UI_SETTINGS.board.collapsed,
      clickThroughWhenLocked: typeof boardInput.clickThroughWhenLocked === 'boolean'
        ? boardInput.clickThroughWhenLocked
        : DEFAULT_PRODUCT_UI_SETTINGS.board.clickThroughWhenLocked,
      showNames: typeof boardInput.showNames === 'boolean'
        ? boardInput.showNames
        : DEFAULT_PRODUCT_UI_SETTINGS.board.showNames
    },
    launcher: {
      mode: launcherInput.mode === 'custom' ? 'custom' : 'anchor',
      anchor: validAnchors.has(String(launcherInput.anchor))
        ? launcherInput.anchor as ProductUiSettings['launcher']['anchor']
        : DEFAULT_PRODUCT_UI_SETTINGS.launcher.anchor,
      x: Number.isFinite(launcherInput.x) ? Number(launcherInput.x) : DEFAULT_PRODUCT_UI_SETTINGS.launcher.x,
      y: Number.isFinite(launcherInput.y) ? Number(launcherInput.y) : DEFAULT_PRODUCT_UI_SETTINGS.launcher.y,
      size: clamp(Number(launcherInput.size) || DEFAULT_PRODUCT_UI_SETTINGS.launcher.size, 36, 120)
    },
    panelOpen: typeof input.panelOpen === 'boolean'
      ? input.panelOpen
      : DEFAULT_PRODUCT_UI_SETTINGS.panelOpen,
    panelTab: validTabs.has(String(input.panelTab))
      ? input.panelTab as ProductUiSettings['panelTab']
      : DEFAULT_PRODUCT_UI_SETTINGS.panelTab,
    completionMessages: typeof input.completionMessages === 'boolean'
      ? input.completionMessages
      : DEFAULT_PRODUCT_UI_SETTINGS.completionMessages,
    winAnimation: typeof input.winAnimation === 'boolean'
      ? input.winAnimation
      : DEFAULT_PRODUCT_UI_SETTINGS.winAnimation,
    chatNotifications: typeof input.chatNotifications === 'boolean'
      ? input.chatNotifications
      : DEFAULT_PRODUCT_UI_SETTINGS.chatNotifications,
    matchChatMessages: typeof input.matchChatMessages === 'boolean'
      ? input.matchChatMessages
      : DEFAULT_PRODUCT_UI_SETTINGS.matchChatMessages,
    matchChatCommandPrefix: normalizeMatchChatCommandPrefix(input.matchChatCommandPrefix),
    sfxVolume: Number.isFinite(input.sfxVolume)
      ? clamp(Math.round(Number(input.sfxVolume)), 0, 100)
      : DEFAULT_PRODUCT_UI_SETTINGS.sfxVolume,
    matchChatPings: typeof input.matchChatPings === 'boolean'
      ? input.matchChatPings
      : DEFAULT_PRODUCT_UI_SETTINGS.matchChatPings,
    wpmChatDisplay: validWpmChatDisplays.has(String(input.wpmChatDisplay))
      ? input.wpmChatDisplay as ProductUiSettings['wpmChatDisplay']
      : DEFAULT_PRODUCT_UI_SETTINGS.wpmChatDisplay,
    guessTimeChatDisplay: validGuessTimeChatDisplays.has(String(input.guessTimeChatDisplay))
      ? input.guessTimeChatDisplay as ProductUiSettings['guessTimeChatDisplay']
      : DEFAULT_PRODUCT_UI_SETTINGS.guessTimeChatDisplay
  };
}

export class LocalStorageProductUiSettingsStore {
  private value: ProductUiSettings;
  private listeners = new Set<SettingsListener>();

  public constructor(
    private readonly storageKey = 'skribblDuelsProductUiSettingsV1',
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null =
      typeof localStorage === 'undefined' ? null : localStorage
  ) {
    let parsed: unknown = null;
    try {
      const raw = this.storage?.getItem(this.storageKey);
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    this.value = normalizeProductUiSettings(parsed);
  }

  public get(): ProductUiSettings {
    return structuredClone(this.value);
  }

  public set(value: ProductUiSettings): ProductUiSettings {
    this.value = normalizeProductUiSettings(value);
    this.persist();
    this.emit();
    return this.get();
  }

  public update(update: Partial<ProductUiSettings>): ProductUiSettings {
    return this.set({
      ...this.value,
      ...update,
      board: update.board
        ? { ...this.value.board, ...update.board }
        : this.value.board,
      launcher: update.launcher
        ? { ...this.value.launcher, ...update.launcher }
        : this.value.launcher
    });
  }

  public updateBoard(update: Partial<ProductUiSettings['board']>): ProductUiSettings {
    return this.set({
      ...this.value,
      board: { ...this.value.board, ...update }
    });
  }

  public updateLauncher(update: Partial<ProductUiSettings['launcher']>): ProductUiSettings {
    return this.set({
      ...this.value,
      launcher: { ...this.value.launcher, ...update }
    });
  }

  public reset(): ProductUiSettings {
    this.storage?.removeItem(this.storageKey);
    this.value = structuredClone(DEFAULT_PRODUCT_UI_SETTINGS);
    this.emit();
    return this.get();
  }

  public subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    listener(this.get());
    return () => this.listeners.delete(listener);
  }

  private persist(): void {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.value));
    } catch (error) {
      console.warn('[Skribbl Duels UI Settings] Persist failed', error);
    }
  }

  private emit(): void {
    const value = this.get();
    for (const listener of this.listeners) listener(value);
  }
}
