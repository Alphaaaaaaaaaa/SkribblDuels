import type { GatewaySkribbleAttempt, GatewaySkribbleState } from '@skribbl-duels/gateway-contracts';
import {
  SocketIoGatewayClient,
  type GatewayConnectionSnapshot
} from '@skribbl-duels/gateway-client';
import {
  EMBEDDED_PROGRESSION_ASSETS,
  type ProgressionAssetId
} from './generatedProgressionAssets';

interface SkribbleUiOptions {
  runtimeId: string;
  gateway: SocketIoGatewayClient;
  getGatewayState(): GatewayConnectionSnapshot;
  showToast(title: string, message: string, timeout?: number): void;
  onModalVisibilityChanged(): void;
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

function asset(id: ProgressionAssetId): string | null {
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

function shareText(state: GatewaySkribbleState): string {
  const grid = state.attempts.map(attempt => attempt.marks.map(mark => (
    mark === 'correct' ? '🟩' : mark === 'semicorrect' ? '🟨' : '⬛'
  )).join('')).join('\n');
  const result = state.status === 'solved'
    ? `Solved in ${state.attempts.length} of ${state.maxAttempts} tries.`
    : `Out of ${state.maxAttempts} tries.`;
  return `Skribble\nLanguage: ${state.languageName}\n\n${result}\n\n${grid}`;
}

export class SkribbleFeatureUi {
  private launcher: HTMLButtonElement | null = null;
  private modal: HTMLDivElement | null = null;
  private gatewayState: GatewayConnectionSnapshot;
  private draft = '';
  private inputFocused = false;
  private pendingGuess = false;
  private helpOpen = false;
  private invalidMessage: string | null = null;
  private lastGuessRequestId: string | null = null;
  private lastTransactionId: string | null = null;
  private readonly celebratedSessions = new Set<string>();
  private readonly lostSessions = new Set<string>();
  private readonly coinNodes = new Set<HTMLElement>();
  private visualCoinBalance = 0;
  private coinAnimationGeneration = 0;
  private coinAnimationFinalBalance: number | null = null;
  private readonly coinAnimationTimers = new Set<number>();
  private mountTimer: number | null = null;
  private countdownTimer: number | null = null;
  private readonly resize = (): void => {
    if (this.modal) this.renderModal();
  };

  public constructor(private readonly options: SkribbleUiOptions) {
    this.gatewayState = options.getGatewayState();
    this.visualCoinBalance = this.gatewayState.coins?.balance ?? 0;
  }

  public start(): void {
    this.ensureStyles();
    this.ensureMounted();
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
    this.finishCoinAnimation();
    this.close();
    this.launcher?.remove();
    this.launcher = null;
    this.coinNodes.clear();
  }

  public update(state: GatewayConnectionSnapshot): void {
    const previous = this.gatewayState;
    this.gatewayState = state;
    const result = state.lastSkribbleGuess;
    if (result && result.requestId !== this.lastGuessRequestId) {
      this.lastGuessRequestId = result.requestId;
      this.pendingGuess = false;
      if (result.accepted) {
        this.draft = '';
        this.invalidMessage = null;
      } else {
        this.invalidMessage = result.reason === 'word-not-found'
          ? `Word not found inside provided ${result.state.languageName} wordlist.`
          : result.reason === 'invalid-length'
            ? 'Skribble words must contain between 2 and 32 characters.'
            : result.reason === 'session-not-found'
              ? 'This Skribble session expired. Start a fresh round.'
              : 'This Skribble round has already ended.';
      }
    }
    const transaction = state.coins?.transaction;
    if (transaction && transaction.transactionId !== this.lastTransactionId) {
      this.lastTransactionId = transaction.transactionId;
      if (transaction.sourceSinkType === 'skribble-daily-solve' && transaction.amount > 0) {
        this.animateCoinReward(transaction.amount, transaction.balanceBefore, transaction.balanceAfter);
      } else {
        this.visualCoinBalance = transaction.balanceAfter;
      }
    } else if (!this.coinAnimationFinalBalance && state.coins?.balance !== previous.coins?.balance) {
      this.visualCoinBalance = state.coins?.balance ?? 0;
    }
    this.refreshCoinNodes();
    if (this.modal) this.renderModal();
    const skribble = state.skribble?.state;
    if (skribble?.status === 'solved' && !this.celebratedSessions.has(skribble.sessionId)) {
      this.celebratedSessions.add(skribble.sessionId);
      requestAnimationFrame(() => this.animateSolvedRow());
    }
    if (skribble?.status === 'lost' && !this.lostSessions.has(skribble.sessionId)) {
      this.lostSessions.add(skribble.sessionId);
      requestAnimationFrame(() => this.animateLoss());
    }
  }

  public createCoinPill(compact = true): HTMLButtonElement {
    const pill = element('button', `scd-coin-pill${compact ? ' compact' : ''}`) as HTMLButtonElement;
    pill.type = 'button';
    pill.setAttribute('aria-label', 'Open Skribble and view Skribbl Coin balance');
    const image = element('img') as HTMLImageElement;
    image.alt = '';
    image.src = asset('coin') ?? '';
    if (!image.src) image.style.display = 'none';
    pill.append(image, element('span', 'scd-coin-balance', String(this.visualCoinBalance)));
    pill.addEventListener('click', () => this.open());
    this.coinNodes.add(pill);
    return pill;
  }

  public isModalOpen(): boolean {
    return this.modal !== null;
  }

  public closeForMatchFound(): void {
    this.close();
  }

  private ensureMounted(): void {
    if (!this.launcher) {
      const launcher = element('button', 'scd-skribble-launcher') as HTMLButtonElement;
      launcher.id = 'skribbl-duels-skribble-launcher';
      launcher.type = 'button';
      launcher.dataset.scdRuntimeId = this.options.runtimeId;
      launcher.setAttribute('aria-label', 'Open Skribble');
      const logo = asset('skribbleLogo');
      if (logo) {
        const image = element('img') as HTMLImageElement;
        image.src = logo;
        image.alt = 'Skribble';
        launcher.appendChild(image);
      } else {
        launcher.appendChild(element('span', 'scd-skribble-logo-fallback', 'SKRIBBLE'));
      }
      launcher.addEventListener('click', () => this.open());
      this.launcher = launcher;
    }
    if (!this.launcher.isConnected) (document.body ?? document.documentElement).appendChild(this.launcher);
    const home = document.querySelector<HTMLElement>('#home');
    const visible = window.location.pathname === '/'
      && Boolean(home && getComputedStyle(home).display !== 'none' && home.getClientRects().length > 0);
    this.launcher.style.display = visible ? 'grid' : 'none';
  }

  private open(): void {
    if (this.modal) return;
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
    if (this.gatewayState.status !== 'connected') return;
    try {
      this.options.gateway.openSkribble(languageId(), 'daily');
    } catch (error) {
      this.options.showToast('Skribble unavailable', error instanceof Error ? error.message : String(error), 6_000);
    }
  }

  private close(): void {
    this.finishCoinAnimation();
    this.modal?.remove();
    this.modal = null;
    this.draft = '';
    this.inputFocused = false;
    this.pendingGuess = false;
    this.helpOpen = false;
    this.invalidMessage = null;
    for (const node of [document.documentElement, document.body]) {
      if (node?.dataset.scdSkribbleScrollLock === this.options.runtimeId) {
        delete node.dataset.scdSkribbleScrollLock;
      }
    }
    this.options.onModalVisibilityChanged();
  }

  private renderModal(): void {
    const overlay = this.modal;
    if (!overlay) return;
    const previousInputFocused = this.inputFocused;
    overlay.replaceChildren();
    const shell = element('div', 'scd-skribble-modal');
    const header = element('div', 'scd-skribble-header');
    header.appendChild(this.createCoinPill(false));
    const logo = asset('skribbleLogo');
    const title = element('div', 'scd-skribble-title');
    if (logo) {
      const image = element('img') as HTMLImageElement;
      image.src = logo;
      image.alt = 'Skribble';
      title.appendChild(image);
    } else {
      title.textContent = 'SKRIBBLE';
    }
    const actions = element('div', 'scd-skribble-actions');
    const help = element('button', 'scd-skribble-icon-button', '?') as HTMLButtonElement;
    help.type = 'button';
    help.setAttribute('aria-label', 'Skribble help');
    help.addEventListener('click', () => {
      this.helpOpen = !this.helpOpen;
      this.renderModal();
    });
    const close = element('button', 'scd-skribble-icon-button', '×') as HTMLButtonElement;
    close.type = 'button';
    close.setAttribute('aria-label', 'Close Skribble');
    close.addEventListener('click', () => this.close());
    actions.append(help, close);
    header.append(title, actions);
    const content = element('div', 'scd-skribble-content');
    const state = this.gatewayState.skribble?.state ?? null;

    if (this.helpOpen) content.appendChild(this.helpCard());
    if (this.gatewayState.status !== 'connected') {
      content.append(
        element('strong', '', 'Connect Skribbl Duels first'),
        element('p', 'scd-skribble-muted', 'Sign in with Discord and connect the authenticated Gateway in the Skribbl Duels Hub before starting the Daily Word.')
      );
    } else if (!state) {
      content.append(
        element('div', 'scd-skribble-loading'),
        element('div', 'scd-skribble-muted', 'Loading the authoritative Daily Word…')
      );
    } else if (state.availability === 'unsupported') {
      content.append(
        element('strong', '', `${state.languageName} is not available`),
        element('p', 'scd-skribble-warning', state.unavailableReason ?? 'This official word list could not be fetched.')
      );
    } else {
      content.appendChild(element(
        'div',
        'scd-skribble-mode',
        `${state.mode === 'daily' ? 'Daily Word' : 'Practice'} · ${state.languageName} · ${state.attempts.length}/${state.maxAttempts}`
      ));
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
        attempt,
        index,
        state.attempts.length,
        state.status === 'solved' && index === state.attempts.length - 1
      )));
      if (state.status === 'playing') board.appendChild(this.inputRow(state));
      if (state.status === 'lost') board.appendChild(this.lossMessageRow());
      content.appendChild(board);
      if (this.invalidMessage) content.appendChild(element('div', 'scd-skribble-warning', this.invalidMessage));
      if (state.mode === 'practice') {
        content.appendChild(element('div', 'scd-skribble-muted', 'Practice rounds never award Skribbl Coins.'));
      }
      if (state.status !== 'playing') content.appendChild(this.ending(state));
    }
    shell.append(header, content);
    overlay.appendChild(shell);
    if (previousInputFocused && state?.status === 'playing') {
      queueMicrotask(() => {
        const input = overlay.querySelector<HTMLInputElement>('.scd-skribble-native-input');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      });
    }
    this.refreshCoinNodes();
  }

  private helpCard(): HTMLElement {
    const card = element('section', 'scd-skribble-help');
    card.append(
      element('strong', '', 'How Skribble works'),
      element('p', '', 'Guess a word from the official word list for your selected Skribbl language. Words may contain spaces, hyphens and every Unicode character used by that language.'),
      element('p', '', 'Green means correct letter and position. Yellow means the character exists elsewhere. Gray means it is not available in the remaining answer.'),
      element('p', '', 'You have ten attempts and no clues. The Gateway checks every guess without sending the answer to the browser in advance.'),
      element('p', '', 'Only the first Daily solve on an account each UTC day awards Coins. Practice is always unrewarded.')
    );
    return card;
  }

  private attemptRow(
    attempt: GatewaySkribbleAttempt,
    index: number,
    total: number,
    won: boolean
  ): HTMLElement {
    const row = element('div', `scd-skribble-row${won ? ' won' : ''}`);
    const characters = codePoints(attempt.guess);
    row.style.setProperty('--scd-row-tile-count', String(Math.max(1, characters.length)));
    row.style.opacity = String(Math.max(0.1, 1 - (total - index - 1) * 0.1));
    row.addEventListener('mouseenter', () => { row.style.opacity = '1'; });
    row.addEventListener('mouseleave', () => {
      row.style.opacity = String(Math.max(0.1, 1 - (total - index - 1) * 0.1));
    });
    characters.forEach((character, characterIndex) => {
      const mark = attempt.marks[characterIndex] ?? 'incorrect';
      const tile = this.tile(character, mark === 'semicorrect' ? 'semicorrectTile' : `${mark}Tile` as ProgressionAssetId);
      tile.style.animationDelay = `${characterIndex * 90}ms`;
      if (index === total - 1) tile.classList.add('reveal');
      row.appendChild(tile);
    });
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
      this.renderModal();
    });
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (event.shiftKey || this.pendingGuess) return;
      const length = codePoints(this.draft.trim()).length;
      if (length < state.minimumLength || length > state.maximumLength) {
        this.invalidMessage = `Enter between ${state.minimumLength} and ${state.maximumLength} characters.`;
        this.renderModal();
        return;
      }
      this.pendingGuess = true;
      try {
        this.options.gateway.submitSkribbleGuess(state.sessionId, this.draft);
      } catch (error) {
        this.pendingGuess = false;
        this.options.showToast('Guess not sent', error instanceof Error ? error.message : String(error));
      }
    });
    row.appendChild(input);
    row.addEventListener('click', () => input.focus());
    queueMicrotask(() => input.focus());
    return row;
  }

  private tile(character: string, assetId: ProgressionAssetId): HTMLElement {
    const tile = element('span', `scd-skribble-tile ${assetId}`);
    const source = asset(assetId);
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
    const countdown = element('div', 'scd-skribble-countdown');
    countdown.dataset.nextDailyAt = String(state.nextDailyAt);
    end.appendChild(countdown);
    const actions = element('div', 'scd-skribble-ending-actions');
    const practice = element('button', 'scd-skribble-practice', 'Practice') as HTMLButtonElement;
    practice.type = 'button';
    practice.addEventListener('click', () => {
      this.draft = '';
      this.invalidMessage = null;
      this.options.gateway.openSkribble(state.languageId, 'practice');
    });
    const share = element('button', 'scd-skribble-secondary', 'Copy result') as HTMLButtonElement;
    share.type = 'button';
    share.addEventListener('click', () => void this.copyResult(state));
    actions.append(practice, share);
    if (state.status === 'solved' && state.mode === 'daily') {
      const replay = element('button', 'scd-skribble-secondary', 'Replay celebration · 1 Coin') as HTMLButtonElement;
      replay.type = 'button';
      replay.disabled = (this.gatewayState.coins?.balance ?? 0) < 1;
      replay.addEventListener('click', () => {
        try {
          this.options.gateway.replaySkribbleCelebration(state.dateKey);
          this.animateSolvedRow();
        } catch (error) {
          this.options.showToast('Celebration unavailable', error instanceof Error ? error.message : String(error));
        }
      });
      actions.appendChild(replay);
    }
    end.append(
      actions,
      element('div', 'scd-skribble-muted', 'Practice rounds and celebration replays never award additional Skribbl Coins.')
    );
    return end;
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
      this.options.showToast('Skribble result copied', 'The spoiler-free result is ready to share.');
    } catch {
      this.options.showToast('Clipboard blocked', text, 8_000);
    }
  }

  private updateCountdown(): void {
    const node = this.modal?.querySelector<HTMLElement>('.scd-skribble-countdown');
    if (!node) return;
    const deadline = Number(node.dataset.nextDailyAt);
    const remaining = Math.max(0, deadline - Date.now());
    const hours = Math.floor(remaining / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    const seconds = Math.floor((remaining % 60_000) / 1_000);
    node.textContent = `Next official Skribble in ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} UTC`;
  }

  private animateSolvedRow(): void {
    const tiles = this.modal?.querySelectorAll<HTMLElement>('.scd-skribble-row.won .scd-skribble-tile');
    tiles?.forEach((tile, index) => {
      tile.style.animationDelay = `${(index * 73) % 310}ms`;
      tile.classList.remove('jump');
      void tile.offsetWidth;
      tile.classList.add('jump');
    });
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
    const coinSource = asset('coin');
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
        const dx = (Math.random() - 0.5) * Math.min(360, window.innerWidth * 0.45);
        const up = 70 + Math.random() * 150;
        const down = 35 + Math.random() * 75;
        const loot = coin.animate([
          { transform: 'translate(0,0) scale(.55)', opacity: 0 },
          { transform: `translate(${dx * 0.55}px,${-up}px) scale(1)`, opacity: 1, offset: .55 },
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
      if (!node.isConnected && node !== this.modal) {
        this.coinNodes.delete(node);
        continue;
      }
      const value = node.querySelector<HTMLElement>('.scd-coin-balance');
      if (value) value.textContent = String(this.visualCoinBalance);
    }
  }

  private ensureStyles(): void {
    if (document.getElementById('skribbl-duels-skribble-styles')) return;
    const style = document.createElement('style');
    style.id = 'skribbl-duels-skribble-styles';
    style.textContent = `
html[data-scd-skribble-scroll-lock],body[data-scd-skribble-scroll-lock] { overflow:hidden !important;overscroll-behavior:none !important; }
.scd-skribble-launcher { position:fixed;right:18px;top:25vh;z-index:2147483643;display:grid;place-items:center;min-width:96px;min-height:54px;border:0;padding:0;background:transparent;cursor:pointer;filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25));transition:filter .1s ease-in-out; }
.scd-skribble-launcher:hover { filter:drop-shadow(4px 4px 0 rgba(0,0,0,.32)) brightness(1.08); }
.scd-skribble-launcher img { display:block;max-width:150px;max-height:76px;object-fit:contain; }
.scd-skribble-logo-fallback { padding:10px 14px;border-radius:8px;background:var(--COLOR_PANEL_BUTTON,#2a51d1);color:#fff;font-weight:900;letter-spacing:.08em;text-shadow:2px 2px 0 #0005; }
.scd-skribble-overlay { position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:12px;background:rgba(0,0,0,.58);backdrop-filter:blur(4px);animation:scd-skribble-fade .2s ease-out; }
.scd-skribble-modal { width:min(980px,calc(100vw - 24px));max-height:calc(100vh - 24px);display:flex;flex-direction:column;overflow:hidden;border-radius:10px;background:var(--COLOR_PANEL_BG,rgba(22,24,31,.97));color:var(--COLOR_PANEL_TEXT,#fff);box-shadow:0 0 50px rgba(0,0,0,.25); }
.scd-skribble-header { min-height:68px;display:grid;grid-template-columns:minmax(130px,1fr) minmax(140px,2fr) minmax(130px,1fr);align-items:center;gap:10px;padding:8px 12px; }
.scd-skribble-title { justify-self:center;font-size:2em;font-weight:900;letter-spacing:.08em;text-shadow:2px 2px 0 #0004; }
.scd-skribble-title img { display:block;max-width:min(260px,38vw);max-height:60px;object-fit:contain; }
.scd-skribble-actions { justify-self:end;display:flex;gap:6px; }
.scd-skribble-icon-button { width:42px;height:42px;border:0;padding:0;background:transparent;color:#fff;font:900 32px/1 Arial;cursor:pointer;text-shadow:2px 2px 0 #0004; }
.scd-coin-pill { min-width:96px;max-width:160px;height:48px;justify-self:start;display:flex;align-items:center;gap:7px;border:0;border-radius:8px;padding:4px 10px 4px 4px;background:var(--SCD_ACCENT,var(--COLOR_PANEL_BUTTON,#2a51d1));color:#fff;font:800 16px/1 Arial;cursor:pointer;text-shadow:2px 2px 0 #0004; }
.scd-coin-pill.compact { min-width:0;width:auto;height:38px;padding:3px 8px 3px 3px; }
.scd-coin-pill:hover { background:var(--SCD_ACCENT_HOVER,var(--COLOR_PANEL_BUTTON_HOVER,#1e44be)); }
.scd-coin-pill img { width:40px;height:40px;object-fit:contain;image-rendering:pixelated; }
.scd-coin-pill.compact img { width:32px;height:32px; }
.scd-skribble-content { min-height:330px;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 18px 18px;text-align:center; }
.scd-skribble-mode { font-weight:800;opacity:.86; }
.scd-skribble-board { width:100%;display:flex;flex-direction:column;align-items:center;gap:6px; }
.scd-skribble-row { --scd-row-tile-count:2;width:100%;display:grid;grid-template-columns:repeat(var(--scd-row-tile-count),var(--scd-board-tile-size,32px));gap:2px;justify-content:center;transition:opacity .16s ease-in-out; }
.scd-skribble-tile { position:relative;width:var(--scd-board-tile-size,32px);aspect-ratio:1/1;justify-self:center;display:grid;place-items:center;border-radius:3px;background-color:#d8b773;background-position:center;background-size:100% 100%;background-repeat:no-repeat;filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25));transition:filter .16s ease-in-out,opacity .16s ease-in-out,transform .16s ease-in-out; }
.scd-skribble-tile.correctTile { background-color:#69bd45; }
.scd-skribble-tile.semicorrectTile { background-color:#e4aa32; }
.scd-skribble-tile.incorrectTile { background-color:#68717e; }
.scd-skribble-character { position:relative;transform:translate(4px,-2px);max-width:100%;overflow:hidden;color:#111;font:900 clamp(5px,calc(var(--scd-board-tile-size,32px) * .5),16px)/1 Arial,sans-serif;text-shadow:1px 1px 0 #fff5; }
.scd-skribble-tile.indicator { opacity:.6; }
.scd-skribble-tile.active::after { content:'';position:absolute;left:calc(50% + 5px);top:20%;width:2px;height:58%;background:#111;animation:scd-skribble-cursor .75s steps(1) infinite; }
.scd-skribble-native-input { position:fixed !important;left:-10000px !important;top:auto !important;width:1px !important;height:1px !important;opacity:0 !important;pointer-events:none !important; }
.scd-skribble-input-row { cursor:text; }
.scd-skribble-input-row.invalid .scd-skribble-tile { filter:brightness(75%) contrast(200%) saturate(300%) hue-rotate(310deg) drop-shadow(3px 3px 0 rgba(0,0,0,.25)); }
.scd-skribble-tile.reveal { opacity:0;animation:scd-skribble-reveal .28s ease-out forwards; }
.scd-skribble-tile.jump { animation:scd-skribble-jump .72s cubic-bezier(.2,.8,.3,1) 2; }
.scd-skribble-tile.fall { animation:scd-skribble-fall .72s ease-in forwards; }
.scd-skribble-loss-message .scd-skribble-tile { opacity:0;animation:scd-skribble-loss-bounce .55s cubic-bezier(.2,.85,.35,1.25) forwards; }
.scd-skribble-help { width:min(680px,100%);padding:12px;border-radius:8px;background:var(--COLOR_PANEL_LO,rgba(0,0,0,.16));text-align:left; }
.scd-skribble-help p { margin:.55em 0 0; }
.scd-skribble-warning { color:var(--COLOR_CHAT_TEXT_LEAVE,#ff8c66);font-weight:700; }
.scd-skribble-success { color:var(--COLOR_CHAT_TEXT_GUESSED,#6fd66a); }
.scd-skribble-muted { color:var(--COLOR_PANEL_TEXT_SUB,#ffffffa8); }
.scd-skribble-ending { width:min(720px,100%);display:flex;flex-direction:column;gap:10px;align-items:center; }
.scd-skribble-ending-actions { width:100%;display:flex;justify-content:center;gap:8px;flex-wrap:wrap; }
.scd-skribble-practice,.scd-skribble-secondary { min-height:40px;border:0;border-radius:var(--BORDER_RADIUS,7px);padding:7px 14px;color:#fff;font:800 15px/1.1 Arial;cursor:pointer;text-shadow:2px 2px 0 #0003; }
.scd-skribble-practice { background:#2c8de7; }
.scd-skribble-practice:hover { background:#1671c5; }
.scd-skribble-secondary { background:var(--COLOR_PANEL_BUTTON,#2a51d1); }
.scd-skribble-secondary:hover:not(:disabled) { background:var(--COLOR_PANEL_BUTTON_HOVER,#1e44be); }
.scd-skribble-secondary:disabled { opacity:.45;cursor:not-allowed; }
.scd-skribble-loading { width:64px;height:64px;background:url('/img/load.gif') center/contain no-repeat;animation:scd-skribble-spin .8s ease-in-out infinite; }
.scd-skribble-coin-particle { position:fixed;z-index:2147483647;width:20px;height:20px;pointer-events:none;image-rendering:pixelated;filter:drop-shadow(2px 2px 0 rgba(0,0,0,.25)); }
.scd-skribble-overlay::-webkit-scrollbar,.scd-skribble-overlay *::-webkit-scrollbar { width:14px;height:14px;border-radius:7px;background-color:var(--COLOR_PANEL_LO); }
.scd-skribble-overlay::-webkit-scrollbar-thumb,.scd-skribble-overlay *::-webkit-scrollbar-thumb { border-radius:7px;background-color:var(--COLOR_PANEL_HI); }
@keyframes scd-skribble-fade { from { opacity:0; } to { opacity:1; } }
@keyframes scd-skribble-spin { from { transform:rotate(0); } to { transform:rotate(360deg); } }
@keyframes scd-skribble-cursor { 0%,49% { opacity:1; } 50%,100% { opacity:0; } }
@keyframes scd-skribble-reveal { from { opacity:0;transform:rotateY(90deg); } to { opacity:1;transform:rotateY(0); } }
@keyframes scd-skribble-jump { 0%,100% { transform:translateY(0) rotate(0); } 38% { transform:translateY(-20px) rotate(-5deg); } 72% { transform:translateY(2px) rotate(4deg); } }
@keyframes scd-skribble-fall { from { opacity:1;transform:translateY(0) rotate(0); } to { opacity:0;transform:translateY(240px) rotate(38deg); } }
@keyframes scd-skribble-loss-bounce { 0% { opacity:0;transform:translateY(-130px); } 72% { opacity:1;transform:translateY(8px); } 88% { transform:translateY(-5px); } 100% { opacity:1;transform:translateY(0); } }
@media (max-width:620px) {
  .scd-skribble-header { grid-template-columns:auto 1fr auto; }
  .scd-skribble-title { font-size:1.2em; }
  .scd-skribble-launcher { right:8px;top:22vh;transform:scale(.8);transform-origin:right center; }
  .scd-coin-pill { min-width:0; }
}
@media (prefers-reduced-motion:reduce) {
  .scd-skribble-overlay,.scd-skribble-loading,.scd-skribble-tile,.scd-skribble-coin-particle { animation:none !important; }
}
`;
    (document.head ?? document.documentElement).appendChild(style);
  }
}

export const SKRIBBLE_SHARE_TEXT_FOR_TESTING = shareText;
