import type { GatewaySkribbleAttempt, GatewaySkribbleState } from '@skribbl-duels/gateway-contracts';
import {
  getOfficialWords,
  loadOfficialWordList,
  SKRIBBL_LANGUAGE_NAME_BY_ID
} from '@skribbl-duels/challenge-definitions';
import {
  SocketIoGatewayClient,
  type GatewayConnectionSnapshot
} from '@skribbl-duels/gateway-client';
import {
  EMBEDDED_PROGRESSION_ASSETS,
  type ProgressionAssetId
} from './generatedProgressionAssets';
import {
  appendSkribbleKeyboardValue,
  createSkribbleKeyboardRows,
  getSkribbleKeyboardMark,
  removeLastSkribbleCharacter,
  type SkribbleKeyboardMark
} from './skribbleKeyboard';

interface SkribbleUiOptions {
  runtimeId: string;
  gateway: SocketIoGatewayClient;
  getGatewayState(): GatewayConnectionSnapshot;
  showToast(title: string, message: string, timeout?: number): void;
  onModalVisibilityChanged(): void;
  aboutIconUrl: string | null;
  registerTooltip(element: HTMLElement, text: string, lock?: 'X' | 'Y'): void;
}

interface PendingAction {
  requestId: string | null;
  kind: 'open-daily' | 'open-practice' | 'guess';
  timer: number;
  send: () => string;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = ''
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function progressionAsset(id: ProgressionAssetId): string | null {
  return EMBEDDED_PROGRESSION_ASSETS[id] ?? null;
}

function languageId(): number {
  try {
    const value = Number(localStorage.getItem('lang') ?? '0');
    return Number.isInteger(value) && value >= 0 && value <= 27 ? value : 0;
  } catch {
    return 0;
  }
}

function codePoints(value: string): string[] {
  return Array.from(value.normalize('NFKC'));
}

function stateFingerprint(state: GatewaySkribbleState | null): string {
  if (!state) return '';
  return JSON.stringify({
    sessionId: state.sessionId,
    status: state.status,
    answer: state.answer,
    attempts: state.attempts,
    rewardAmount: state.rewardAmount,
    rewarded: state.rewarded,
    canEarn: state.canEarn,
    nextDailyAt: state.nextDailyAt
  });
}

function shareText(state: GatewaySkribbleState): string {
  const grid = state.attempts.map(attempt => attempt.marks.map(mark => (
    mark === 'correct' ? '🟩' : mark === 'semicorrect' ? '🟨' : '⬛'
  )).join('')).join('\n\n');
  const result = state.status === 'solved'
    ? `Solved in ${state.attempts.length} of ${state.maxAttempts} tries.`
    : `Out of ${state.maxAttempts} tries.`;
  return `Skribble\nLanguage: ${state.languageName}\n\n${result}\n\n${grid}`;
}

export class SkribbleFeatureUi {
  private launcher: HTMLButtonElement | null = null;
  private modal: HTMLDivElement | null = null;
  private gatewayState: GatewayConnectionSnapshot;
  private visibleState: GatewaySkribbleState | null = null;
  private visibleFingerprint = '';
  private draft = '';
  private draftSessionId: string | null = null;
  private inputFocused = false;
  private helpOpen = false;
  private invalidMessage: string | null = null;
  private lastGuessRequestId: string | null = null;
  private pendingRevealKey: string | null = null;
  private pendingAction: PendingAction | null = null;
  private lastTransactionId: string | null = null;
  private readonly lostSessions = new Set<string>();
  private readonly coinNodes = new Set<HTMLElement>();
  private visualCoinBalance = 0;
  private coinAnimationGeneration = 0;
  private coinAnimationFinalBalance: number | null = null;
  private readonly coinAnimationTimers = new Set<number>();
  private mountTimer: number | null = null;
  private countdownTimer: number | null = null;
  private keyboardWordListLoad: { languageId: number; task: Promise<void> } | null = null;
  private readonly resize = (): void => {
    if (this.modal) this.renderModal();
  };

  public constructor(private readonly options: SkribbleUiOptions) {
    this.gatewayState = options.getGatewayState();
    this.visibleState = this.gatewayState.skribble?.state ?? null;
    this.visibleFingerprint = stateFingerprint(this.visibleState);
    this.visualCoinBalance = this.gatewayState.coins?.balance ?? 0;
  }

  public start(): void {
    this.ensureStyles();
    this.ensureMounted();
    this.ensureKeyboardWordList(languageId(), SKRIBBL_LANGUAGE_NAME_BY_ID[languageId()] ?? null);
    this.mountTimer = window.setInterval(() => this.ensureMounted(), 700);
    this.countdownTimer = window.setInterval(() => this.updateCountdown(), 1_000);
    window.addEventListener('resize', this.resize, false);
  }

  public stop(): void {
    if (this.mountTimer !== null) window.clearInterval(this.mountTimer);
    if (this.countdownTimer !== null) window.clearInterval(this.countdownTimer);
    this.mountTimer = null;
    this.countdownTimer = null;
    window.removeEventListener('resize', this.resize, false);
    this.clearPendingAction();
    this.finishCoinAnimation();
    this.close();
    this.launcher?.remove();
    this.launcher = null;
    this.coinNodes.clear();
  }

  public update(state: GatewayConnectionSnapshot): void {
    const previousState = this.visibleState;
    const previousCoins = this.gatewayState.coins;
    this.gatewayState = state;
    this.trySendPendingAction();
    const incoming = state.skribble?.state ?? null;
    const incomingFingerprint = stateFingerprint(incoming);
    let rerender = false;
    if (incoming && incomingFingerprint !== this.visibleFingerprint) {
      if (this.draftSessionId !== incoming.sessionId) {
        this.draft = '';
        this.draftSessionId = incoming.sessionId;
        this.invalidMessage = null;
      }
      this.visibleState = structuredClone(incoming);
      this.visibleFingerprint = incomingFingerprint;
      rerender = true;
    }
    if (incoming?.availability === 'ready') {
      this.ensureKeyboardWordList(incoming.languageId, incoming.languageName);
    }

    const result = state.lastSkribbleGuess;
    if (result && result.requestId !== this.lastGuessRequestId) {
      this.lastGuessRequestId = result.requestId;
      if (this.pendingAction?.requestId === result.requestId) this.clearPendingAction();
      if (result.accepted) {
        this.draft = '';
        this.invalidMessage = null;
        if ((previousState?.sessionId === result.state.sessionId)
            && result.state.attempts.length > (previousState?.attempts.length ?? 0)) {
          this.pendingRevealKey = `${result.state.sessionId}:${result.state.attempts.length - 1}`;
        }
      } else {
        this.invalidMessage = result.reason === 'word-not-found'
          ? `Word not found inside provided ${result.state.languageName} wordlist.`
          : result.reason === 'invalid-length'
            ? 'Skribble words must contain between 2 and 32 characters.'
            : result.reason === 'session-not-found'
              ? 'This Skribble session expired. Start a fresh round.'
              : 'This Skribble round has already ended.';
      }
      rerender = true;
    }
    if (state.skribble?.requestId && this.pendingAction?.requestId === state.skribble.requestId) {
      this.clearPendingAction();
      rerender = true;
    }

    const transaction = state.coins?.transaction;
    if (transaction && transaction.transactionId !== this.lastTransactionId) {
      this.lastTransactionId = transaction.transactionId;
      if (transaction.sourceSinkType === 'skribble-daily-solve' && transaction.amount > 0) {
        this.animateCoinReward(transaction.amount, transaction.balanceBefore, transaction.balanceAfter);
      } else {
        this.visualCoinBalance = transaction.balanceAfter;
      }
    } else if (this.coinAnimationFinalBalance === null && state.coins?.balance !== previousCoins?.balance) {
      this.visualCoinBalance = state.coins?.balance ?? 0;
    }
    this.refreshCoinNodes();
    this.ensureMounted();
    if (this.modal && rerender) this.renderModal();
    else this.syncLoadingOverlay();

    const skribble = this.visibleState;
    if (skribble?.status === 'lost' && !this.lostSessions.has(skribble.sessionId)) {
      this.lostSessions.add(skribble.sessionId);
      requestAnimationFrame(() => this.animateLoss());
    }
  }

  public createCoinPill(compact = true): HTMLDivElement {
    const pill = element('div', `scd-coin-pill${compact ? ' compact' : ''}`);
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-label', `Skribbl Coin balance: ${this.visualCoinBalance}`);
    const image = element('img') as HTMLImageElement;
    image.alt = '';
    image.src = progressionAsset('coin') ?? '';
    if (!image.src) image.style.display = 'none';
    pill.append(image, element('span', 'scd-coin-balance', String(this.visualCoinBalance)));
    this.options.registerTooltip(pill, 'Skribbl Coin is the currency of Skribbl Duels', 'Y');
    this.coinNodes.add(pill);
    return pill;
  }

  public isModalOpen(): boolean {
    return this.modal !== null;
  }

  public closeForMatchFound(): void {
    this.close();
  }

  private accountConnected(): boolean {
    return this.gatewayState.status === 'connected' && this.gatewayState.identity !== null;
  }

  private ensureMounted(): void {
    if (!this.launcher) {
      const launcher = element('button', 'scd-skribble-launcher') as HTMLButtonElement;
      launcher.id = 'skribbl-duels-skribble-launcher';
      launcher.type = 'button';
      launcher.dataset.scdRuntimeId = this.options.runtimeId;
      launcher.setAttribute('aria-label', 'Open Skribble');
      const logo = progressionAsset('skribbleLogo');
      if (logo) {
        const image = element('img') as HTMLImageElement;
        image.src = logo;
        image.alt = 'Skribble';
        launcher.appendChild(image);
      } else {
        launcher.appendChild(element('span', 'scd-skribble-logo-fallback', 'SKRIBBLE'));
      }
      launcher.addEventListener('click', () => this.open());
      this.options.registerTooltip(launcher, 'Open Skribble', 'X');
      this.launcher = launcher;
    }
    if (!this.launcher.isConnected) (document.body ?? document.documentElement).appendChild(this.launcher);
    const home = document.querySelector<HTMLElement>('#home');
    const visible = this.accountConnected()
      && window.location.pathname === '/'
      && Boolean(home && getComputedStyle(home).display !== 'none' && home.getClientRects().length > 0);
    this.launcher.style.display = visible ? 'grid' : 'none';
    if (!this.gatewayState.identity
        && this.gatewayState.status !== 'connecting'
        && this.modal) this.close();
  }

  private open(): void {
    if (this.modal || !this.accountConnected()) return;
    const overlay = element('div', 'scd-skribble-overlay');
    overlay.id = 'skribbl-duels-skribble';
    overlay.dataset.scdRuntimeId = this.options.runtimeId;
    overlay.addEventListener('click', event => {
      if (event.target === overlay) this.close();
    });
    this.modal = overlay;
    (document.body ?? document.documentElement).appendChild(overlay);
    document.documentElement.dataset.scdSkribbleScrollLock = this.options.runtimeId;
    if (document.body) document.body.dataset.scdSkribbleScrollLock = this.options.runtimeId;
    this.options.onModalVisibilityChanged();
    this.renderModal();
    const currentLanguageId = this.visibleState?.languageId ?? languageId();
    this.ensureKeyboardWordList(
      currentLanguageId,
      this.visibleState?.languageName ?? SKRIBBL_LANGUAGE_NAME_BY_ID[currentLanguageId] ?? null
    );
    if (!this.visibleState) this.requestRound('daily');
  }

  private close(): void {
    this.clearPendingAction();
    this.finishCoinAnimation();
    this.modal?.remove();
    this.modal = null;
    this.inputFocused = false;
    this.helpOpen = false;
    for (const node of [document.documentElement, document.body]) {
      if (node?.dataset.scdSkribbleScrollLock === this.options.runtimeId) {
        delete node.dataset.scdSkribbleScrollLock;
      }
    }
    this.options.onModalVisibilityChanged();
  }

  private beginRequest(kind: PendingAction['kind'], send: () => string): void {
    if (this.pendingAction) return;
    const timer = window.setTimeout(() => {
      if (!this.pendingAction || this.pendingAction.timer !== timer) return;
      this.pendingAction = null;
      this.syncLoadingOverlay();
      this.options.showToast(
        'Gateway unavailable',
        'Skribbl Duels did not answer within 5 seconds. Your current Skribble board was kept unchanged.',
        6_000
      );
    }, 5_000);
    this.pendingAction = { requestId: null, kind, timer, send };
    this.trySendPendingAction();
    this.syncLoadingOverlay();
  }

  private trySendPendingAction(): void {
    const pending = this.pendingAction;
    if (!pending || pending.requestId !== null || !this.accountConnected()) return;
    try {
      pending.requestId = pending.send();
    } catch {
      // Keep the native loading treatment visible. A reconnect update retries
      // the exact action until the shared five-second deadline expires.
    }
  }

  private clearPendingAction(): void {
    if (!this.pendingAction) return;
    window.clearTimeout(this.pendingAction.timer);
    this.pendingAction = null;
    this.syncLoadingOverlay();
  }

  private requestRound(mode: 'daily' | 'practice'): void {
    this.invalidMessage = null;
    const selectedLanguageId = languageId();
    this.ensureKeyboardWordList(
      selectedLanguageId,
      SKRIBBL_LANGUAGE_NAME_BY_ID[selectedLanguageId] ?? null
    );
    this.beginRequest(mode === 'daily' ? 'open-daily' : 'open-practice', () => (
      this.options.gateway.openSkribble(selectedLanguageId, mode)
    ));
  }

  private ensureKeyboardWordList(language: number, languageName: string | null): void {
    if (getOfficialWords(language).length > 0 || this.keyboardWordListLoad?.languageId === language) return;
    const task = loadOfficialWordList(language, languageName).then(status => {
      if (status.state !== 'ready'
          || !this.modal
          || this.visibleState?.languageId !== language) return;
      this.renderModal();
    }).catch(() => {
      // The authoritative Gateway availability remains decisive. Until the
      // local list is cached, the keyboard keeps the language preset without
      // hiding or resetting the active round.
    }).finally(() => {
      if (this.keyboardWordListLoad?.task === task) this.keyboardWordListLoad = null;
    });
    this.keyboardWordListLoad = { languageId: language, task };
  }

  private renderModal(): void {
    const overlay = this.modal;
    if (!overlay) return;
    const previousInputFocused = this.inputFocused;
    overlay.replaceChildren();
    const shell = element('div', 'scd-skribble-modal');
    const header = element('div', 'scd-skribble-header');
    header.appendChild(this.createCoinPill(false));
    const title = element('div', 'scd-skribble-title');
    const logo = progressionAsset('skribbleLogo');
    if (logo) {
      const image = element('img') as HTMLImageElement;
      image.src = logo;
      image.alt = 'Skribble';
      title.appendChild(image);
    } else title.textContent = 'SKRIBBLE';
    const actions = element('div', 'scd-skribble-actions');
    const help = this.headerIconButton('About and help', false);
    help.addEventListener('click', () => {
      this.helpOpen = !this.helpOpen;
      this.renderModal();
    });
    const close = this.headerIconButton('Close Skribble', true);
    close.addEventListener('click', () => this.close());
    actions.append(help, close);
    header.append(title, actions);

    const content = element('div', 'scd-skribble-content');
    const state = this.visibleState;
    if (this.helpOpen) content.appendChild(this.helpCard());
    if (!state) {
      content.appendChild(element('div', 'scd-skribble-muted', 'Preparing your Daily Skribble…'));
    } else if (state.availability === 'unsupported') {
      content.append(
        element('strong', '', `${state.languageName} is not available`),
        element('p', 'scd-skribble-warning', state.unavailableReason ?? 'This official word list could not be fetched.')
      );
    } else {
      const modeBar = element('div', 'scd-skribble-mode-bar');
      if (state.mode === 'practice') modeBar.appendChild(this.returnToDailyButton());
      modeBar.appendChild(element(
        'div',
        'scd-skribble-mode',
        `${state.mode === 'daily' ? 'Daily Word' : 'Practice'} · ${state.languageName} · ${state.attempts.length}/${state.maxAttempts}`
      ));
      content.appendChild(modeBar);
      const board = element('div', 'scd-skribble-board');
      const inputWidth = state.status === 'playing'
        ? Math.min(state.maximumLength, Math.max(2, codePoints(this.draft).length + 1))
        : 0;
      const widestRow = Math.max(
        2,
        inputWidth,
        state.status === 'lost' ? codePoints('You lost!').length : 0,
        ...state.attempts.map(attempt => codePoints(attempt.guess).length)
      );
      const availableWidth = Math.max(180, Math.min(944, window.innerWidth - 60));
      const tileSize = Math.max(4, Math.min(32, (availableWidth - (widestRow - 1) * 2) / widestRow));
      board.style.setProperty('--scd-board-tile-size', `${tileSize}px`);
      state.attempts.forEach((attempt, index) => board.appendChild(this.attemptRow(
        state,
        attempt,
        index,
        state.status === 'solved' && index === state.attempts.length - 1
      )));
      if (state.status === 'playing') board.appendChild(this.inputRow(state));
      if (state.status === 'lost') board.appendChild(this.lossMessageRow());
      content.appendChild(board);
      if (this.invalidMessage) content.appendChild(element('div', 'scd-skribble-warning', this.invalidMessage));
      if (state.status !== 'playing') content.appendChild(this.ending(state));
      content.appendChild(this.keyboard(state));
    }
    shell.append(header, content);
    overlay.appendChild(shell);
    this.syncLoadingOverlay();
    if (previousInputFocused && state?.status === 'playing') {
      queueMicrotask(() => {
        const input = overlay.querySelector<HTMLInputElement>('.scd-skribble-native-input');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      });
    }
    this.refreshCoinNodes();
  }

  private headerIconButton(tooltip: string, close: boolean): HTMLButtonElement {
    const button = element('button', `scd-icon-button${close ? ' scd-modal-close' : ''}`) as HTMLButtonElement;
    button.type = 'button';
    if (close) button.textContent = '×';
    else {
      const icon = element('span', 'scd-icon');
      icon.setAttribute('role', 'img');
      icon.setAttribute('aria-label', 'About');
      if (this.options.aboutIconUrl) {
        const image = element('img', 'scd-icon-image') as HTMLImageElement;
        image.alt = '';
        image.src = this.options.aboutIconUrl;
        icon.appendChild(image);
      } else icon.textContent = '?';
      button.appendChild(icon);
    }
    this.options.registerTooltip(button, tooltip, 'Y');
    return button;
  }

  private helpCard(): HTMLElement {
    const card = element('section', 'scd-skribble-help');
    card.append(
      element('strong', '', 'How Skribble works'),
      element('p', '', 'Guess a word from the official word list for your selected Skribbl language. Words may contain spaces, hyphens and every Unicode character used by that language.'),
      element('p', '', 'Green means correct letter and position. Yellow means the character exists elsewhere. Gray means it is not available in the remaining answer.'),
      element('p', '', 'You have ten attempts and no clues.'),
      element('p', '', 'Only the first Daily solve on an account awards Skribbl Coins. Practice is always unrewarded.')
    );
    return card;
  }

  private keyboard(state: GatewaySkribbleState): HTMLElement {
    const keyboard = element('div', 'scd-skribble-keyboard');
    keyboard.setAttribute('role', 'group');
    keyboard.setAttribute('aria-label', `${state.languageName} Skribble keyboard`);
    const rows = createSkribbleKeyboardRows(state.languageId, getOfficialWords(state.languageId));
    for (const characters of rows) {
      if (characters.length === 0) continue;
      const row = element('div', 'scd-skribble-keyboard-row');
      row.style.setProperty('--scd-key-count', String(characters.length));
      row.style.setProperty('--scd-key-max-width', `${characters.length * 42}px`);
      for (const character of characters) {
        row.appendChild(this.keyboardButton(
          character,
          character,
          getSkribbleKeyboardMark(state.attempts, character, state.languageId),
          state
        ));
      }
      keyboard.appendChild(row);
    }

    const controls = element('div', 'scd-skribble-keyboard-controls');
    controls.append(
      this.keyboardButton('⌫', 'backspace', 'empty', state, 'wide', 'Backspace'),
      this.keyboardButton(
        'Space',
        'space',
        getSkribbleKeyboardMark(state.attempts, ' ', state.languageId),
        state,
        'extra-wide',
        'Space'
      ),
      this.keyboardButton('↵', 'enter', 'empty', state, 'wide', 'Enter')
    );
    keyboard.appendChild(controls);
    return keyboard;
  }

  private keyboardButton(
    label: string,
    value: string,
    mark: SkribbleKeyboardMark,
    state: GatewaySkribbleState,
    widthClass = '',
    ariaLabel = label
  ): HTMLButtonElement {
    const button = element(
      'button',
      `scd-skribble-key${widthClass ? ` ${widthClass}` : ''}`
    ) as HTMLButtonElement;
    button.type = 'button';
    button.disabled = state.status !== 'playing' || Boolean(this.pendingAction);
    button.dataset.value = value;
    button.dataset.mark = mark;
    button.setAttribute('aria-label', ariaLabel);
    const assetId: ProgressionAssetId = mark === 'empty'
      ? 'emptyTile'
      : mark === 'semicorrect'
        ? 'semicorrectTile'
        : `${mark}Tile` as ProgressionAssetId;
    const source = progressionAsset(assetId);
    if (source) button.style.backgroundImage = `url(${JSON.stringify(source)})`;
    button.appendChild(element('span', 'scd-skribble-key-label', label));
    button.addEventListener('pointerdown', event => event.preventDefault());
    button.addEventListener('click', () => this.useKeyboardValue(value, state));
    return button;
  }

  private useKeyboardValue(value: string, state: GatewaySkribbleState): void {
    if (state.status !== 'playing' || this.pendingAction) return;
    if (value === 'enter') {
      this.submitGuess(state);
      return;
    }
    this.draft = value === 'backspace'
      ? removeLastSkribbleCharacter(this.draft)
      : appendSkribbleKeyboardValue(
          this.draft,
          value === 'space' ? ' ' : value,
          state.languageId,
          state.maximumLength
        );
    this.invalidMessage = null;
    this.inputFocused = true;
    this.renderModal();
  }

  private submitGuess(state: GatewaySkribbleState): void {
    if (this.pendingAction) return;
    const length = codePoints(this.draft.trim()).length;
    if (length < state.minimumLength || length > state.maximumLength) {
      this.invalidMessage = `Enter between ${state.minimumLength} and ${state.maximumLength} characters.`;
      this.renderModal();
      return;
    }
    const guess = this.draft;
    this.beginRequest('guess', () => this.options.gateway.submitSkribbleGuess(state.sessionId, guess));
  }

  private attemptRow(
    state: GatewaySkribbleState,
    attempt: GatewaySkribbleAttempt,
    index: number,
    won: boolean
  ): HTMLElement {
    const row = element('div', `scd-skribble-row${won ? ' won' : ''}`);
    const characters = codePoints(attempt.guess);
    const revealKey = `${state.sessionId}:${index}`;
    const reveal = this.pendingRevealKey === revealKey;
    row.style.setProperty('--scd-row-tile-count', String(Math.max(1, characters.length)));
    characters.forEach((character, characterIndex) => {
      const mark = attempt.marks[characterIndex] ?? 'incorrect';
      const tile = this.tile(character, mark === 'semicorrect' ? 'semicorrectTile' : `${mark}Tile` as ProgressionAssetId);
      tile.style.setProperty('--scd-reveal-delay', `${characterIndex * 90}ms`);
      tile.style.setProperty('--scd-jump-delay', `${Math.floor(Math.random() * 620)}ms`);
      tile.style.setProperty('--scd-jump-duration', `${700 + Math.floor(Math.random() * 650)}ms`);
      if (reveal) tile.classList.add('reveal');
      row.appendChild(tile);
    });
    if (reveal) this.pendingRevealKey = null;
    return row;
  }

  private inputRow(state: GatewaySkribbleState): HTMLElement {
    const row = element('div', `scd-skribble-row scd-skribble-input-row${this.invalidMessage ? ' invalid' : ''}`);
    const characters = codePoints(this.draft).slice(0, state.maximumLength);
    const slots = Math.min(state.maximumLength, Math.max(2, characters.length + 1));
    row.style.setProperty('--scd-row-tile-count', String(slots));
    characters.forEach((character, index) => {
      const tile = this.tile(character, 'emptyTile');
      if (this.inputFocused && index === characters.length - 1) tile.classList.add('active');
      row.appendChild(tile);
    });
    if (characters.length === 0) {
      const current = this.tile('', 'emptyTile');
      if (this.inputFocused) current.classList.add('active');
      row.appendChild(current);
    }
    if (characters.length < state.maximumLength) {
      const indicator = this.tile('', 'emptyTile');
      indicator.classList.add('indicator');
      row.appendChild(indicator);
    }
    const input = element('input', 'scd-skribble-native-input') as HTMLInputElement;
    input.type = 'text';
    input.value = this.draft;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Skribble guess');
    input.addEventListener('focus', () => {
      this.inputFocused = true;
      const editableTiles = row.querySelectorAll('.scd-skribble-tile:not(.indicator)');
      editableTiles.item(editableTiles.length - 1)?.classList.add('active');
    });
    input.addEventListener('blur', () => {
      this.inputFocused = false;
      row.querySelectorAll('.active').forEach(node => node.classList.remove('active'));
    });
    input.addEventListener('input', () => {
      this.draft = codePoints(input.value).slice(0, state.maximumLength).join('');
      this.invalidMessage = null;
      this.inputFocused = true;
      row.replaceWith(this.inputRow(state));
    });
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (event.shiftKey || this.pendingAction) return;
      this.submitGuess(state);
    });
    row.appendChild(input);
    row.addEventListener('click', () => input.focus());
    queueMicrotask(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    return row;
  }

  private tile(character: string, assetId: ProgressionAssetId): HTMLElement {
    const tile = element('span', `scd-skribble-tile ${assetId}`);
    const source = progressionAsset(assetId);
    if (source) tile.style.backgroundImage = `url(${JSON.stringify(source)})`;
    tile.appendChild(element('span', 'scd-skribble-character', character));
    return tile;
  }

  private ending(state: GatewaySkribbleState): HTMLElement {
    const end = element('div', 'scd-skribble-ending');
    end.appendChild(element(
      'strong',
      state.status === 'solved' ? 'scd-skribble-success' : 'scd-skribble-warning',
      state.status === 'solved'
        ? state.rewarded
          ? `Solved! +${state.rewardAmount} Skribbl Coins`
          : 'Solved! Today’s account reward was already claimed.'
        : 'Try again tomorrow. You can keep playing in unranked Practice.'
    ));
    if (state.answer) end.appendChild(element('div', 'scd-skribble-answer', `The word was '${state.answer}'`));
    const countdown = element('div', 'scd-skribble-countdown');
    countdown.dataset.nextDailyAt = String(state.nextDailyAt);
    end.appendChild(countdown);
    const actions = element('div', 'scd-skribble-ending-actions');
    const practice = element('button', 'scd-skribble-practice', 'Practice') as HTMLButtonElement;
    practice.type = 'button';
    practice.addEventListener('click', () => this.requestRound('practice'));
    this.options.registerTooltip(practice, 'Start an unrewarded Practice round');
    const share = element('button', 'scd-skribble-secondary', 'Copy result') as HTMLButtonElement;
    share.type = 'button';
    share.addEventListener('click', () => void this.copyResult(state));
    actions.append(practice, share);
    end.appendChild(actions);
    return end;
  }

  private returnToDailyButton(): HTMLButtonElement {
    const button = element('button', 'scd-skribble-secondary scd-skribble-return') as HTMLButtonElement;
    button.type = 'button';
    const source = progressionAsset('skribbleReturn');
    if (source) {
      const image = element('img') as HTMLImageElement;
      image.src = source;
      image.alt = '';
      button.appendChild(image);
    } else button.textContent = '↩';
    button.addEventListener('click', () => this.requestRound('daily'));
    this.options.registerTooltip(button, 'Return to Daily');
    return button;
  }

  private lossMessageRow(): HTMLElement {
    const text = codePoints('You lost!');
    const row = element('div', 'scd-skribble-row scd-skribble-loss-message');
    row.style.setProperty('--scd-row-tile-count', String(text.length));
    text.forEach((character, index) => {
      const tile = this.tile(character, 'emptyTile');
      tile.style.animationDelay = `${index * 80}ms`;
      row.appendChild(tile);
    });
    return row;
  }

  private async copyResult(state: GatewaySkribbleState): Promise<void> {
    const text = shareText(state);
    try {
      await navigator.clipboard.writeText(text);
      this.options.showToast('Skribble result copied', 'Your result is ready to share.');
    } catch {
      this.options.showToast('Clipboard blocked', text, 8_000);
    }
  }

  private updateCountdown(): void {
    const node = this.modal?.querySelector<HTMLElement>('.scd-skribble-countdown');
    if (!node) return;
    const deadline = Number(node.dataset.nextDailyAt);
    const remaining = Math.max(0, deadline - Date.now());
    if (remaining <= 0) {
      node.textContent = 'Daily Skribble available!';
      return;
    }
    const hours = Math.floor(remaining / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    const seconds = Math.floor((remaining % 60_000) / 1_000);
    node.textContent = `Next Daily Skribble in ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} UTC`;
  }

  private syncLoadingOverlay(): void {
    const overlay = this.modal;
    if (!overlay) return;
    overlay.querySelector(':scope > .scd-progression-load')?.remove();
    if (!this.pendingAction) return;
    const load = element('div', 'scd-progression-load');
    const container = element('div', 'container');
    const icon = element('div', 'icon');
    icon.appendChild(element('div', 'graphic'));
    container.appendChild(icon);
    load.appendChild(container);
    overlay.appendChild(load);
  }

  private animateLoss(): void {
    const rows = this.modal?.querySelectorAll<HTMLElement>('.scd-skribble-board .scd-skribble-row:not(.scd-skribble-loss-message)');
    if (!rows) return;
    const tiles = [...rows].flatMap(row => [...row.querySelectorAll<HTMLElement>('.scd-skribble-tile')]);
    tiles.sort(() => Math.random() - 0.5).forEach((tile, index) => {
      tile.style.animationDelay = `${index * 45}ms`;
      tile.classList.add('fall');
    });
    this.modal?.querySelectorAll<HTMLElement>('.scd-skribble-loss-message .scd-skribble-tile')
      .forEach((tile, index) => {
        tile.style.animationDelay = `${tiles.length * 45 + 720 + index * 80}ms`;
      });
  }

  private animateCoinReward(amount: number, balanceBefore: number, balanceAfter: number): void {
    this.finishCoinAnimation();
    this.visualCoinBalance = balanceBefore;
    this.coinAnimationFinalBalance = balanceAfter;
    this.refreshCoinNodes();
    const source = this.modal?.querySelector<HTMLElement>('.scd-skribble-row.won');
    const coinSource = progressionAsset('coin');
    if (!source || !coinSource || !this.modal) {
      this.finishCoinAnimation();
      return;
    }
    const generation = ++this.coinAnimationGeneration;
    const sourceRect = source.getBoundingClientRect();
    for (let index = 0; index < amount; index += 1) {
      const timer = window.setTimeout(() => {
        this.coinAnimationTimers.delete(timer);
        if (generation !== this.coinAnimationGeneration || !this.modal) return;
        const coin = element('img', 'scd-skribble-coin-particle') as HTMLImageElement;
        coin.src = coinSource;
        coin.alt = '';
        coin.style.left = `${sourceRect.left + sourceRect.width / 2 - 10}px`;
        coin.style.top = `${sourceRect.top + sourceRect.height / 2 - 10}px`;
        document.body.appendChild(coin);
        const dx = (Math.random() - .5) * Math.min(360, window.innerWidth * .45);
        const up = 70 + Math.random() * 150;
        const down = 35 + Math.random() * 75;
        const loot = coin.animate([
          { transform: 'translate(0,0) scale(.55)', opacity: 0 },
          { transform: `translate(${dx * .55}px,${-up}px) scale(1)`, opacity: 1, offset: .55 },
          { transform: `translate(${dx}px,${down}px) scale(.86)`, opacity: 1, offset: .88 },
          { transform: `translate(${dx}px,${down - 13}px) scale(.86)`, opacity: 1 },
          { transform: `translate(${dx}px,${down}px) scale(.86)`, opacity: 1 }
        ], { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'forwards' });
        void loot.finished.then(() => new Promise<void>(resolve => {
          const rest = window.setTimeout(() => {
            this.coinAnimationTimers.delete(rest);
            resolve();
          }, 500);
          this.coinAnimationTimers.add(rest);
        })).then(() => {
          if (generation !== this.coinAnimationGeneration) {
            coin.remove();
            return;
          }
          const target = [...this.coinNodes].find(node => node.isConnected)?.getBoundingClientRect();
          if (!target) {
            coin.remove();
            return;
          }
          const current = coin.getBoundingClientRect();
          const collect = coin.animate([
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            {
              transform: `translate(${target.left + target.width / 2 - current.left}px,${target.top + target.height / 2 - current.top}px) scale(.2)`,
              opacity: 0
            }
          ], { duration: 420, easing: 'cubic-bezier(.55,0,.85,.45)', fill: 'forwards' });
          void collect.finished.then(() => {
            coin.remove();
            if (generation !== this.coinAnimationGeneration) return;
            this.visualCoinBalance = Math.min(balanceAfter, this.visualCoinBalance + 1);
            this.refreshCoinNodes();
            if (this.visualCoinBalance >= balanceAfter) this.finishCoinAnimation();
          });
        }).catch(() => coin.remove());
      }, index * 65);
      this.coinAnimationTimers.add(timer);
    }
  }

  private finishCoinAnimation(): void {
    this.coinAnimationGeneration += 1;
    for (const timer of this.coinAnimationTimers) window.clearTimeout(timer);
    this.coinAnimationTimers.clear();
    document.querySelectorAll<HTMLElement>('.scd-skribble-coin-particle').forEach(node => node.remove());
    if (this.coinAnimationFinalBalance !== null) this.visualCoinBalance = this.coinAnimationFinalBalance;
    else this.visualCoinBalance = this.gatewayState.coins?.balance ?? this.visualCoinBalance;
    this.coinAnimationFinalBalance = null;
    this.refreshCoinNodes();
  }

  private refreshCoinNodes(): void {
    for (const node of [...this.coinNodes]) {
      if (!node.isConnected) {
        this.coinNodes.delete(node);
        continue;
      }
      const value = node.querySelector<HTMLElement>('.scd-coin-balance');
      if (value) value.textContent = String(this.visualCoinBalance);
      node.setAttribute('aria-label', `Skribbl Coin balance: ${this.visualCoinBalance}`);
    }
  }

  private ensureStyles(): void {
    if (document.getElementById('skribbl-duels-skribble-styles')) return;
    const style = document.createElement('style');
    style.id = 'skribbl-duels-skribble-styles';
    style.textContent = `
html[data-scd-skribble-scroll-lock],body[data-scd-skribble-scroll-lock] { overflow:hidden !important;overscroll-behavior:none !important; }
.scd-skribble-launcher { position:fixed;right:18px;top:25vh;z-index:2147483643;display:grid;place-items:center;width:min(300px,32vw);min-height:80px;border:0;padding:0;background:transparent;cursor:pointer;filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25));transition:filter .1s ease-in-out,transform .1s ease-in-out; }
.scd-skribble-launcher:hover { filter:drop-shadow(4px 4px 0 rgba(0,0,0,.32)) brightness(1.08);transform:scale(1.06); }
.scd-skribble-launcher img { display:block;width:100%;height:auto;max-height:152px;object-fit:contain; }
.scd-skribble-logo-fallback { padding:10px 14px;border-radius:8px;background:var(--COLOR_PANEL_BUTTON,#2a51d1);color:#fff;font-weight:900;letter-spacing:.08em;text-shadow:2px 2px 0 #0005; }
.scd-skribble-overlay { position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:12px;background:rgba(0,0,0,.58);animation:scd-skribble-fade .2s ease-out;font-family:'Nunito',sans-serif; }
.scd-skribble-modal { position:relative;width:min(980px,calc(100vw - 24px));max-height:calc(100vh - 24px);display:flex;flex-direction:column;overflow:hidden;border-radius:10px;background:var(--COLOR_PANEL_BG,rgba(22,24,31,.97));color:var(--COLOR_PANEL_TEXT,#fff);box-shadow:0 0 50px rgba(0,0,0,.25);font-family:'Nunito',sans-serif; }
.scd-skribble-header { min-height:86px;display:grid;grid-template-columns:minmax(130px,1fr) minmax(280px,2fr) minmax(130px,1fr);align-items:center;gap:10px;padding:8px 12px; }
.scd-skribble-title { justify-self:center;font-size:2em;font-weight:900;letter-spacing:.08em;text-shadow:2px 2px 0 #0004; }
.scd-skribble-title img { display:block;width:min(550px,56vw);max-height:80px;object-fit:contain;filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25)); }
.scd-skribble-actions { justify-self:end;display:flex;gap:6px; }
.scd-skribble-actions .scd-icon-button { width:42px;height:42px; }
.scd-skribble-actions .scd-icon { width:36px;height:36px;filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25)); }
.scd-coin-pill { min-width:96px;max-width:180px;height:48px;justify-self:start;display:flex;align-items:center;gap:7px;border:0;border-radius:8px;padding:4px 10px 4px 4px;background:var(--SCD_ACCENT,var(--COLOR_PANEL_BUTTON,#2a51d1));color:#fff;font:800 16px/1 'Nunito',sans-serif;text-shadow:2px 2px 0 #0004; }
.scd-coin-pill.compact { min-width:0;width:max-content;height:38px;padding:3px 8px 3px 3px; }
.scd-coin-pill img { width:40px;height:40px;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25)); }
.scd-coin-pill.compact img { width:32px;height:32px; }
.scd-skribble-content { min-height:330px;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 18px 18px;text-align:center; }
.scd-skribble-mode-bar { position:relative;width:100%;min-height:40px;display:flex;align-items:center;justify-content:center; }
.scd-skribble-mode-bar .scd-skribble-return { position:absolute;left:0; }
.scd-skribble-mode { font-weight:800;opacity:.86; }
.scd-skribble-board { width:100%;display:flex;flex-direction:column;align-items:center;gap:6px; }
.scd-skribble-row { --scd-row-tile-count:2;width:100%;display:grid;grid-template-columns:repeat(var(--scd-row-tile-count),var(--scd-board-tile-size,32px));gap:2px;justify-content:center; }
.scd-skribble-tile { position:relative;width:var(--scd-board-tile-size,32px);aspect-ratio:1/1;justify-self:center;display:grid;place-items:center;border-radius:3px;background-position:center;background-size:100% 100%;background-repeat:no-repeat;filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25));transition:filter .16s ease-in-out,opacity .16s ease-in-out,scale .16s ease-in-out; }
.scd-skribble-tile:hover { scale:1.12;z-index:2; }
.scd-skribble-character { position:relative;transform:translate(4px,-2px);max-width:100%;overflow:hidden;color:#111;font:900 clamp(5px,calc(var(--scd-board-tile-size,32px) * .5),16px)/1 'Nunito',sans-serif;text-shadow:1px 1px 0 #fff5; }
.scd-skribble-tile.indicator { opacity:.6; }
.scd-skribble-tile.active::after { content:'';position:absolute;left:calc(50% + 5px);top:20%;width:2px;height:58%;background:#111;animation:scd-skribble-cursor .75s steps(1) infinite; }
.scd-skribble-native-input { position:fixed !important;left:-10000px !important;top:auto !important;width:1px !important;height:1px !important;opacity:0 !important;pointer-events:none !important; }
.scd-skribble-input-row { cursor:text; }
.scd-skribble-input-row.invalid .scd-skribble-tile { filter:brightness(75%) contrast(200%) saturate(300%) hue-rotate(310deg) drop-shadow(3px 3px 0 rgba(0,0,0,.25)); }
.scd-skribble-tile.reveal { opacity:0;animation:scd-skribble-reveal .28s ease-out var(--scd-reveal-delay,0ms) forwards; }
.scd-skribble-row.won .scd-skribble-tile:not(.reveal) { animation:scd-skribble-jump var(--scd-jump-duration,.9s) cubic-bezier(.2,.8,.3,1) var(--scd-jump-delay,0ms) infinite; }
.scd-skribble-row.won .scd-skribble-tile.reveal { animation:scd-skribble-reveal .28s ease-out var(--scd-reveal-delay,0ms) forwards,scd-skribble-jump var(--scd-jump-duration,.9s) cubic-bezier(.2,.8,.3,1) calc(var(--scd-reveal-delay,0ms) + 500ms) infinite; }
.scd-skribble-tile.fall { animation:scd-skribble-fall .72s ease-in forwards !important; }
.scd-skribble-loss-message .scd-skribble-tile { opacity:0;animation:scd-skribble-loss-bounce .55s cubic-bezier(.2,.85,.35,1.25) forwards; }
.scd-skribble-keyboard { width:min(760px,100%);display:flex;flex-direction:column;align-items:center;gap:3px;margin-top:auto;padding-top:8px;user-select:none;touch-action:manipulation; }
.scd-skribble-keyboard-row { --scd-key-count:10;--scd-key-max-width:420px;width:min(100%,var(--scd-key-max-width));display:grid;grid-template-columns:repeat(var(--scd-key-count),minmax(0,1fr));gap:2px; }
.scd-skribble-keyboard-controls { width:min(100%,520px);display:flex;justify-content:center;gap:3px; }
.scd-skribble-key { position:relative;min-width:0;aspect-ratio:1/1;display:grid;place-items:center;border:0;padding:0;background-color:transparent;background-position:center;background-repeat:no-repeat;background-size:100% 100%;color:#111;cursor:pointer;filter:drop-shadow(2px 2px 0 rgba(0,0,0,.25));transition:scale .12s ease-in-out,filter .12s ease-in-out; }
.scd-skribble-key:hover:not(:disabled) { scale:1.1;z-index:2;filter:drop-shadow(3px 3px 0 rgba(0,0,0,.3)) brightness(1.06); }
.scd-skribble-key:active:not(:disabled) { scale:.96; }
.scd-skribble-key:disabled { cursor:default; }
.scd-skribble-key-label { position:relative;transform:translate(4px,-2px);max-width:calc(100% - 5px);overflow:hidden;font:900 clamp(8px,calc(var(--scd-board-tile-size,32px) * .43),15px)/1 'Nunito',sans-serif;text-overflow:ellipsis;text-shadow:1px 1px 0 #fff5; }
.scd-skribble-key.wide,.scd-skribble-key.extra-wide { width:auto;min-height:36px;aspect-ratio:auto;background-size:100% 100%; }
.scd-skribble-key.wide { flex:1.35 1 72px; }
.scd-skribble-key.extra-wide { flex:3.5 1 180px; }
.scd-skribble-key.wide .scd-skribble-key-label,.scd-skribble-key.extra-wide .scd-skribble-key-label { transform:none; }
.scd-skribble-help { width:100%;box-sizing:border-box;padding:12px;border-radius:8px;background:var(--COLOR_PANEL_LO,rgba(0,0,0,.16));text-align:left; }
.scd-skribble-help p { margin:.55em 0 0; }
.scd-skribble-warning { color:var(--COLOR_CHAT_TEXT_LEAVE,#ff8c66);font-weight:700; }
.scd-skribble-success,.scd-skribble-answer { color:var(--COLOR_CHAT_TEXT_GUESSED,#6fd66a);font-weight:800; }
.scd-skribble-muted { color:var(--COLOR_PANEL_TEXT_SUB,#ffffffa8); }
.scd-skribble-ending { width:min(720px,100%);display:flex;flex-direction:column;gap:10px;align-items:center; }
.scd-skribble-ending-actions { width:100%;display:flex;justify-content:center;gap:8px;flex-wrap:wrap; }
.scd-skribble-practice,.scd-skribble-secondary { min-height:40px;border:0;border-radius:var(--BORDER_RADIUS,7px);padding:7px 14px;color:#fff;font:800 15px/1.1 'Nunito',sans-serif;cursor:pointer;text-shadow:2px 2px 0 #0003; }
.scd-skribble-practice { background:#2c8de7; }
.scd-skribble-practice:hover { background:#1671c5; }
.scd-skribble-secondary { background:var(--COLOR_PANEL_BUTTON,#2a51d1); }
.scd-skribble-secondary:hover:not(:disabled) { background:var(--COLOR_PANEL_BUTTON_HOVER,#1e44be); }
.scd-skribble-return { width:40px;padding:3px;display:grid;place-items:center; }
.scd-skribble-return img { width:32px;height:32px;object-fit:contain; }
.scd-progression-load { position:fixed;z-index:2147483647;inset:0;animation:scd-load-opacity .3s ease-in-out;background-color:rgba(0,0,0,.75); }
.scd-progression-load .container { position:absolute;left:50%;top:50%;animation:scd-load-position .3s ease-in-out; }
.scd-progression-load .icon { position:absolute;width:128px;height:128px; }
.scd-progression-load .graphic { position:absolute;left:-50%;top:-50%;width:100%;height:100%;background:url('/img/load.gif') center/contain no-repeat;filter:drop-shadow(0 0 5px rgba(0,0,0,.5));animation:scd-skribble-spin .8s ease-in-out infinite; }
.scd-skribble-coin-particle { position:fixed;z-index:2147483647;width:20px;height:20px;pointer-events:none;image-rendering:pixelated;filter:drop-shadow(2px 2px 0 rgba(0,0,0,.25)); }
.scd-skribble-overlay::-webkit-scrollbar,.scd-skribble-overlay *::-webkit-scrollbar { width:14px;height:14px;border-radius:7px;background-color:var(--COLOR_PANEL_LO); }
.scd-skribble-overlay::-webkit-scrollbar-thumb,.scd-skribble-overlay *::-webkit-scrollbar-thumb { border-radius:7px;background-color:var(--COLOR_PANEL_HI); }
@keyframes scd-skribble-fade { from { opacity:0; } to { opacity:1; } }
@keyframes scd-load-opacity { from { opacity:0; } to { opacity:1; } }
@keyframes scd-load-position { from { opacity:0;top:35%; } to { opacity:1;top:50%; } }
@keyframes scd-skribble-spin { from { transform:rotate(0); } to { transform:rotate(360deg); } }
@keyframes scd-skribble-cursor { 0%,49% { opacity:1; } 50%,100% { opacity:0; } }
@keyframes scd-skribble-reveal { from { opacity:0;transform:rotateY(90deg); } to { opacity:1;transform:rotateY(0); } }
@keyframes scd-skribble-jump { 0%,100% { transform:translateY(0) rotate(0); } 38% { transform:translateY(-16px) rotate(-5deg); } 72% { transform:translateY(2px) rotate(4deg); } }
@keyframes scd-skribble-fall { from { opacity:1;transform:translateY(0) rotate(0); } to { opacity:0;transform:translateY(240px) rotate(38deg); } }
@keyframes scd-skribble-loss-bounce { 0% { opacity:0;transform:translateY(-130px); } 72% { opacity:1;transform:translateY(8px); } 88% { transform:translateY(-5px); } 100% { opacity:1;transform:translateY(0); } }
@media (max-width:620px) {
  .scd-skribble-header { grid-template-columns:auto 1fr auto; }
  .scd-skribble-title { font-size:1.2em; }
  .scd-skribble-launcher { right:8px;top:22vh;width:min(240px,46vw); }
  .scd-coin-pill { min-width:0; }
}
@media (prefers-reduced-motion:reduce) {
  .scd-skribble-overlay,.scd-progression-load *,.scd-skribble-tile,.scd-skribble-coin-particle { animation:none !important; }
}
`;
    (document.head ?? document.documentElement).appendChild(style);
  }
}

export const SKRIBBLE_SHARE_TEXT_FOR_TESTING = shareText;
