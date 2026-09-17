import {
  GATEWAY_SLOT_BASE_WEIGHTS,
  GATEWAY_SLOT_ICON_IDS,
  type GatewaySlotEffectStep,
  type GatewaySlotIconId,
  type GatewaySlotSpinOutcome,
  type GatewaySlotsState
} from '@skribbl-duels/gateway-contracts';
import {
  SocketIoGatewayClient,
  type GatewayConnectionSnapshot
} from '@skribbl-duels/gateway-client';
import type { ProgressionAssetId } from './generatedProgressionAssets';
import { progressionAsset } from './skribbleUi';

interface SkribblSlotsUiOptions {
  runtimeId: string;
  gateway: SocketIoGatewayClient;
  getGatewayState(): GatewayConnectionSnapshot;
  createCoinPill(compact?: boolean): HTMLDivElement;
  showToast(title: string, message: string, timeout?: number): void;
  onModalVisibilityChanged(): void;
  aboutIconUrl: string | null;
  registerTooltip(element: HTMLElement, text: string, lock?: 'X' | 'Y'): void;
}

interface PendingAction {
  requestId: string | null;
  kind: 'open' | 'spin';
  timer: number;
  send: () => string;
}

const SLOT_ASSETS: Readonly<Record<GatewaySlotIconId, ProgressionAssetId>> = {
  book: 'slotBook',
  slimy: 'slotSlimy',
  fill: 'slotFill',
  wizard: 'slotWizard',
  eraser: 'slotEraser',
  trash: 'slotTrash',
  dice: 'slotDice',
  heart: 'slotHeart',
  'skribbl-coin': 'slotCoin',
  '7': 'slotSeven',
  trophy: 'slotTrophy',
  crown: 'slotCrown',
  pen: 'slotPen',
  'skribbl-duels-logo': 'slotDuelsLogo',
  potion: 'slotPotion',
  drop: 'slotDrop',
  pizza: 'slotPizza',
  pumpkin: 'slotPumpkin',
  eggplant: 'slotEggplant',
  pineapple: 'slotPineapple',
  peach: 'slotPeach',
  ribbon: 'slotRibbon',
  skull: 'slotSkull',
  poop: 'slotPoop'
};

const SLOT_LABELS: Readonly<Record<GatewaySlotIconId, string>> = {
  book: 'Book',
  slimy: 'Slimy',
  fill: 'Fill',
  wizard: 'Wizard',
  eraser: 'Eraser',
  trash: 'Trash',
  dice: 'Dice',
  heart: 'Heart',
  'skribbl-coin': 'Skribbl Coin',
  '7': 'Seven',
  trophy: 'Trophy',
  crown: 'Crown',
  pen: 'Pen',
  'skribbl-duels-logo': 'Skribbl Duels',
  potion: 'Potion',
  drop: 'Drop',
  pizza: 'Pizza',
  pumpkin: 'Pumpkin',
  eggplant: 'Eggplant',
  pineapple: 'Pineapple',
  peach: 'Peach',
  ribbon: 'Ribbon',
  skull: 'Skull',
  poop: 'Poop'
};

const SLOT_FALLBACKS: Readonly<Record<GatewaySlotIconId, string>> = {
  book: '📕', slimy: '🟢', fill: '▣', wizard: '🧙', eraser: '▱', trash: '🗑',
  dice: '🎲', heart: '♥', 'skribbl-coin': '◎', '7': '7', trophy: '🏆', crown: '♛',
  pen: '✎', 'skribbl-duels-logo': 'SD', potion: '⚗', drop: '💧', pizza: '🍕',
  pumpkin: '🎃', eggplant: '🍆', pineapple: '🍍', peach: '🍑', ribbon: '🎀',
  skull: '☠', poop: '●'
};

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

function slotsFingerprint(state: GatewaySlotsState | null): string {
  return state ? JSON.stringify(state) : '';
}

function isWin(outcome: GatewaySlotSpinOutcome): boolean {
  return outcome.coinReward > 0 || outcome.awardedFreeSpins > 0;
}

export class SkribblSlotsFeatureUi {
  private launcher: HTMLButtonElement | null = null;
  private modal: HTMLDivElement | null = null;
  private gatewayState: GatewayConnectionSnapshot;
  private visibleState: GatewaySlotsState | null = null;
  private visibleFingerprint = '';
  private displayIcons: [GatewaySlotIconId, GatewaySlotIconId, GatewaySlotIconId] = [
    'skribbl-coin', '7', 'crown'
  ];
  private latestOutcome: GatewaySlotSpinOutcome | null = null;
  private lastSpinRequestId: string | null = null;
  private pendingAction: PendingAction | null = null;
  private helpOpen = false;
  private resultMessage = 'Match three icons on the single payline.';
  private animating = false;
  private animationGeneration = 0;
  private readonly animationTimers = new Set<number>();
  private mountTimer: number | null = null;
  private bulbTimer: number | null = null;
  private bulbIndex = 0;
  private bulbDirection: 1 | -1 = 1;
  private bulbsFlashing = false;

  public constructor(private readonly options: SkribblSlotsUiOptions) {
    this.gatewayState = options.getGatewayState();
    this.visibleState = this.gatewayState.slots?.state ?? null;
    this.visibleFingerprint = slotsFingerprint(this.visibleState);
    const outcome = this.gatewayState.lastSlotsSpin?.accepted
      ? this.gatewayState.lastSlotsSpin.outcome
      : null;
    if (outcome) {
      this.latestOutcome = outcome;
      this.displayIcons = [...outcome.finalIcons];
      this.resultMessage = this.outcomeMessage(outcome);
    }
  }

  public start(): void {
    this.ensureStyles();
    this.ensureMounted();
    this.mountTimer = window.setInterval(() => this.ensureMounted(), 700);
    this.bulbTimer = window.setInterval(() => this.advanceBulb(), 190);
  }

  public stop(): void {
    if (this.mountTimer !== null) window.clearInterval(this.mountTimer);
    if (this.bulbTimer !== null) window.clearInterval(this.bulbTimer);
    this.mountTimer = null;
    this.bulbTimer = null;
    this.clearPendingAction();
    this.cancelAnimations();
    this.close();
    this.launcher?.remove();
    this.launcher = null;
  }

  public update(state: GatewayConnectionSnapshot): void {
    this.gatewayState = state;
    this.trySendPendingAction();
    const incoming = state.slots?.state ?? null;
    const fingerprint = slotsFingerprint(incoming);
    let rerender = false;
    if (incoming && fingerprint !== this.visibleFingerprint) {
      this.visibleState = structuredClone(incoming);
      this.visibleFingerprint = fingerprint;
      rerender = true;
    }

    const result = state.lastSlotsSpin;
    if (result && result.requestId !== this.lastSpinRequestId) {
      this.lastSpinRequestId = result.requestId;
      if (this.pendingAction?.requestId === result.requestId) this.clearPendingAction();
      this.visibleState = structuredClone(result.state);
      this.visibleFingerprint = slotsFingerprint(result.state);
      if (result.accepted && result.outcome) {
        this.latestOutcome = structuredClone(result.outcome);
        if (this.modal) {
          this.renderModal();
          void this.animateOutcome(result.outcome);
        } else {
          this.displayIcons = [...result.outcome.finalIcons];
          this.resultMessage = this.outcomeMessage(result.outcome);
        }
      } else {
        this.resultMessage = result.reason === 'insufficient-coins'
          ? 'You need one Skribbl Coin or a Free Spin.'
          : 'This Slots session expired. A fresh machine is ready.';
        this.options.showToast('Skribbl Slots', this.resultMessage, 5_000);
        rerender = true;
      }
    }
    if (state.slots?.requestId && this.pendingAction?.requestId === state.slots.requestId) {
      this.clearPendingAction();
      rerender = true;
    }

    this.ensureMounted();
    if (this.modal && rerender && !this.animating) this.renderModal();
    else this.syncLoadingOverlay();
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

  private homepageVisible(): boolean {
    const home = document.querySelector<HTMLElement>('#home');
    return window.location.pathname === '/'
      && Boolean(home && getComputedStyle(home).display !== 'none' && home.getClientRects().length > 0);
  }

  private ensureMounted(): void {
    if (!this.launcher) {
      const launcher = element('button', 'scd-slots-launcher') as HTMLButtonElement;
      launcher.id = 'skribbl-duels-slots-launcher';
      launcher.type = 'button';
      launcher.dataset.scdRuntimeId = this.options.runtimeId;
      launcher.setAttribute('aria-label', 'Open Skribbl Slots');
      const logo = progressionAsset('slotsLogo');
      if (logo) {
        const image = element('img') as HTMLImageElement;
        image.src = logo;
        image.alt = 'Skribbl Slots';
        launcher.appendChild(image);
      } else launcher.appendChild(element('span', 'scd-slots-logo-fallback', 'SKRIBBL SLOTS'));
      launcher.addEventListener('click', () => this.open());
      this.options.registerTooltip(launcher, 'Open Skribbl Slots', 'X');
      this.launcher = launcher;
    }
    if (!this.launcher.isConnected) (document.body ?? document.documentElement).appendChild(this.launcher);
    this.launcher.style.display = this.accountConnected() && this.homepageVisible() ? 'grid' : 'none';
    if (!this.gatewayState.identity
        && this.gatewayState.status !== 'connecting'
        && this.modal) this.close();
  }

  private open(): void {
    if (this.modal || !this.accountConnected()) return;
    const overlay = element('div', 'scd-slots-overlay');
    overlay.id = 'skribbl-duels-slots';
    overlay.dataset.scdRuntimeId = this.options.runtimeId;
    overlay.addEventListener('click', event => {
      if (event.target === overlay) this.close();
    });
    this.modal = overlay;
    (document.body ?? document.documentElement).appendChild(overlay);
    document.documentElement.dataset.scdSlotsScrollLock = this.options.runtimeId;
    if (document.body) document.body.dataset.scdSlotsScrollLock = this.options.runtimeId;
    this.options.onModalVisibilityChanged();
    this.renderModal();
    if (!this.visibleState) this.beginRequest('open', () => this.options.gateway.openSkribblSlots());
  }

  private close(): void {
    this.clearPendingAction();
    this.cancelAnimations();
    this.modal?.remove();
    this.modal = null;
    this.helpOpen = false;
    for (const node of [document.documentElement, document.body]) {
      if (node?.dataset.scdSlotsScrollLock === this.options.runtimeId) delete node.dataset.scdSlotsScrollLock;
    }
    this.options.onModalVisibilityChanged();
  }

  private beginRequest(kind: PendingAction['kind'], send: () => string): void {
    if (this.pendingAction || this.animating) return;
    const timer = window.setTimeout(() => {
      if (!this.pendingAction || this.pendingAction.timer !== timer) return;
      this.pendingAction = null;
      this.syncLoadingOverlay();
      this.options.showToast(
        'Gateway unavailable',
        'Skribbl Duels did not answer within 5 seconds. The current Slots machine was kept unchanged.',
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
      // Reconnect snapshots retry the exact action until the shared timeout.
    }
  }

  private clearPendingAction(): void {
    if (!this.pendingAction) return;
    window.clearTimeout(this.pendingAction.timer);
    this.pendingAction = null;
    this.syncLoadingOverlay();
  }

  private renderModal(): void {
    const overlay = this.modal;
    if (!overlay) return;
    overlay.replaceChildren();
    const shell = element('div', 'scd-slots-modal');
    shell.appendChild(this.bulbs());

    const header = element('div', 'scd-slots-header');
    header.appendChild(this.options.createCoinPill(false));
    const title = element('div', 'scd-slots-title');
    const logo = progressionAsset('slotsLogo');
    if (logo) {
      const image = element('img') as HTMLImageElement;
      image.src = logo;
      image.alt = 'Skribbl Slots';
      title.appendChild(image);
    } else title.textContent = 'SKRIBBL SLOTS';
    const actions = element('div', 'scd-slots-actions');
    const help = this.headerIconButton('About and help', false);
    help.addEventListener('click', () => {
      this.helpOpen = !this.helpOpen;
      this.renderModal();
    });
    const close = this.headerIconButton('Close Skribbl Slots', true);
    close.addEventListener('click', () => this.close());
    actions.append(help, close);
    header.append(title, actions);

    const content = element('div', 'scd-slots-content');
    if (this.helpOpen) content.appendChild(this.helpCard());
    if (!this.visibleState) {
      content.appendChild(element('div', 'scd-slots-muted', 'Preparing the server-authoritative machine…'));
    } else {
      const machine = element('div', 'scd-slots-machine');
      const reels = element('div', 'scd-slots-reels');
      this.displayIcons.forEach((icon, index) => reels.appendChild(this.reel(icon, index)));
      const controls = element('div', 'scd-slots-controls');
      controls.appendChild(this.spinButton());
      controls.appendChild(this.heartProgress());
      machine.append(reels, controls);
      content.append(
        machine,
        element('div', `scd-slots-result${this.latestOutcome && isWin(this.latestOutcome) ? ' win' : ''}`, this.resultMessage)
      );
    }
    shell.append(header, content);
    overlay.appendChild(shell);
    this.syncBulbs();
    this.syncLoadingOverlay();
  }

  private bulbs(): HTMLElement {
    const row = element('div', 'scd-slots-bulbs');
    for (let index = 0; index < 7; index += 1) {
      const image = element('img', 'scd-slots-bulb') as HTMLImageElement;
      image.alt = '';
      image.dataset.index = String(index);
      image.style.setProperty('--scd-bulb-turn', `${index % 2 === 0 ? -10 : 10}deg`);
      row.appendChild(image);
    }
    return row;
  }

  private advanceBulb(): void {
    if (this.bulbsFlashing) return;
    if (this.bulbIndex >= 6) this.bulbDirection = -1;
    else if (this.bulbIndex <= 0) this.bulbDirection = 1;
    this.bulbIndex += this.bulbDirection;
    this.syncBulbs();
  }

  private syncBulbs(forceOn: boolean | null = null): void {
    const bulbs = this.modal?.querySelectorAll<HTMLImageElement>('.scd-slots-bulb');
    if (!bulbs) return;
    const on = progressionAsset('slotBulbOn');
    const off = progressionAsset('slotBulbOff');
    bulbs.forEach((bulb, index) => {
      const lit = forceOn === null ? index === this.bulbIndex : forceOn;
      const source = lit ? on : off;
      if (source) {
        bulb.src = source;
        bulb.style.display = 'block';
      } else {
        bulb.removeAttribute('src');
        bulb.style.display = 'block';
        bulb.classList.toggle('fallback-on', lit);
      }
    });
  }

  private async flashBulbs(generation: number): Promise<void> {
    this.bulbsFlashing = true;
    for (let index = 0; index < 6; index += 1) {
      if (generation !== this.animationGeneration) return;
      this.syncBulbs(index % 2 === 0);
      if (!await this.wait(85, generation)) return;
    }
    this.bulbsFlashing = false;
    this.syncBulbs();
  }

  private reel(icon: GatewaySlotIconId, index: number): HTMLElement {
    const reel = element('div', 'scd-slot-reel');
    reel.dataset.index = String(index);
    const payline = element('div', 'scd-slot-payline');
    payline.appendChild(this.slotIcon(icon));
    reel.appendChild(payline);
    return reel;
  }

  private slotIcon(icon: GatewaySlotIconId): HTMLElement {
    const wrapper = element('span', 'scd-slot-icon');
    wrapper.dataset.icon = icon;
    const source = progressionAsset(SLOT_ASSETS[icon]);
    if (source) {
      const image = element('img') as HTMLImageElement;
      image.src = source;
      image.alt = SLOT_LABELS[icon];
      wrapper.appendChild(image);
    } else wrapper.appendChild(element('span', 'scd-slot-icon-fallback', SLOT_FALLBACKS[icon]));
    return wrapper;
  }

  private setReelIcon(index: number, icon: GatewaySlotIconId): void {
    this.displayIcons[index] = icon;
    const payline = this.modal?.querySelector<HTMLElement>(`.scd-slot-reel[data-index="${index}"] .scd-slot-payline`);
    if (payline) payline.replaceChildren(this.slotIcon(icon));
  }

  private spinButton(): HTMLButtonElement {
    const state = this.visibleState!;
    const free = state.freeSpins > 0;
    const button = element('button', 'scd-slots-spin') as HTMLButtonElement;
    button.type = 'button';
    button.disabled = this.animating || Boolean(this.pendingAction) || !state.canSpin;
    button.appendChild(document.createTextNode(free ? 'Free Spin ' : `Spin for ${state.spinCost} `));
    const icon = free && state.nextFreeSpinSource
      ? this.slotIcon(state.nextFreeSpinSource)
      : this.imageOrFallback(progressionAsset('coin'), '◎', 'Skribbl Coin');
    icon.classList.add('scd-spin-cost-icon');
    button.appendChild(icon);
    button.addEventListener('click', () => {
      this.beginRequest('spin', () => this.options.gateway.spinSkribblSlots(state.sessionId));
    });
    this.options.registerTooltip(
      button,
      free ? `${state.freeSpins} Free Spin${state.freeSpins === 1 ? '' : 's'} available` : 'One authoritative spin costs one Skribbl Coin'
    );
    return button;
  }

  private heartProgress(): HTMLElement {
    const state = this.visibleState!;
    const row = element('div', 'scd-slots-heart-progress');
    row.setAttribute('aria-label', `${state.heartProgress} of ${state.heartTarget} hearts collected`);
    for (let index = 0; index < state.heartTarget; index += 1) {
      const heart = this.slotIcon('heart');
      if (index >= state.heartProgress) heart.classList.add('empty');
      row.appendChild(heart);
    }
    this.options.registerTooltip(row, 'Collect three Hearts across spins to earn one Free Spin');
    return row;
  }

  private imageOrFallback(source: string | null, fallback: string, alt: string): HTMLElement {
    const wrapper = element('span', 'scd-slot-icon');
    if (source) {
      const image = element('img') as HTMLImageElement;
      image.src = source;
      image.alt = alt;
      wrapper.appendChild(image);
    } else wrapper.textContent = fallback;
    return wrapper;
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
    const card = element('section', 'scd-slots-help');
    const intro = element('div', 'scd-slots-help-intro');
    const warningSource = progressionAsset('slotsWarning');
    if (warningSource) {
      const warning = element('img') as HTMLImageElement;
      warning.src = warningSource;
      warning.alt = 'Important';
      intro.appendChild(warning);
    }
    const copy = element('div');
    copy.append(
      element('strong', '', 'How Skribbl Slots works'),
      element('p', '', 'Each server-authoritative spin uses three reels and one payline. Match all three final icons to receive the listed reward. Effects resolve in this order: Fill, Wizard, Eraser, Trash, Dice.'),
      element('p', '', 'Skribbl Coins cannot be purchased, have no cash value and never affect competitive Duels. Every spend and reward is recorded in the append-only Coin ledger.')
    );
    intro.appendChild(copy);
    card.appendChild(intro);
    const total = Object.values(GATEWAY_SLOT_BASE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    const odds = element('div', 'scd-slots-odds');
    odds.appendChild(element('strong', '', `Transparent base reel weights · ${total} total`));
    const grid = element('div', 'scd-slots-odds-grid');
    for (const icon of GATEWAY_SLOT_ICON_IDS) {
      const item = element('div', 'scd-slots-odds-item');
      item.append(
        this.slotIcon(icon),
        element('span', '', SLOT_LABELS[icon]),
        element('span', 'scd-slots-muted', `${GATEWAY_SLOT_BASE_WEIGHTS[icon]}/${total}`)
      );
      grid.appendChild(item);
    }
    odds.appendChild(grid);
    card.appendChild(odds);
    return card;
  }

  private async animateOutcome(outcome: GatewaySlotSpinOutcome): Promise<void> {
    this.cancelAnimations();
    const generation = ++this.animationGeneration;
    this.animating = true;
    this.resultMessage = 'Spinning…';
    this.displayIcons = [...outcome.initialIcons];
    this.renderModal();
    await Promise.all(outcome.initialIcons.map((icon, index) => (
      this.animateReel(index, icon, 760 + index * 220 + Math.floor(Math.random() * 180), generation)
    )));
    if (generation !== this.animationGeneration) return;
    for (const step of outcome.effectSteps) {
      if (!await this.animateEffect(step, generation)) return;
    }
    this.displayIcons = [...outcome.finalIcons];
    this.displayIcons.forEach((icon, index) => this.setReelIcon(index, icon));
    this.resultMessage = this.outcomeMessage(outcome);
    this.animating = false;
    this.renderModal();
    if (isWin(outcome)) void this.flashBulbs(generation);
  }

  private async animateReel(
    index: number,
    finalIcon: GatewaySlotIconId,
    duration: number,
    generation: number
  ): Promise<void> {
    const reel = this.modal?.querySelector<HTMLElement>(`.scd-slot-reel[data-index="${index}"]`);
    reel?.classList.add('spinning');
    const interval = window.setInterval(() => {
      if (generation !== this.animationGeneration) return;
      const icon = GATEWAY_SLOT_ICON_IDS[Math.floor(Math.random() * GATEWAY_SLOT_ICON_IDS.length)]!;
      this.setReelIcon(index, icon);
    }, 72 + index * 9);
    this.animationTimers.add(interval);
    await this.wait(duration, generation);
    window.clearInterval(interval);
    this.animationTimers.delete(interval);
    if (generation !== this.animationGeneration) return;
    this.setReelIcon(index, finalIcon);
    reel?.classList.remove('spinning');
    reel?.classList.add('stopped');
  }

  private async animateEffect(step: GatewaySlotEffectStep, generation: number): Promise<boolean> {
    const source = this.modal?.querySelector<HTMLElement>(`.scd-slot-reel[data-index="${step.sourceIndex}"]`);
    source?.classList.add('effect-active');
    if (!await this.wait(1_000, generation)) return false;
    const targets = step.targetIndices.map(index => (
      this.modal?.querySelector<HTMLElement>(`.scd-slot-reel[data-index="${index}"]`)
    )).filter((node): node is HTMLElement => Boolean(node));

    if (step.kind === 'fill') {
      for (const targetIndex of step.targetIndices) {
        const target = this.modal?.querySelector<HTMLElement>(`.scd-slot-reel[data-index="${targetIndex}"]`);
        target?.classList.add('effect-fill-target');
        if (!await this.wait(210, generation)) return false;
        this.setReelIcon(targetIndex, step.iconsAfter[targetIndex]!);
        if (!await this.wait(250, generation)) return false;
        target?.classList.remove('effect-fill-target');
        if (!await this.wait(90, generation)) return false;
      }
      source?.classList.remove('effect-active');
      return this.wait(180, generation);
    }

    if (step.kind === 'eraser') {
      source?.classList.add('effect-eraser');
      targets.forEach(target => target.classList.add('effect-eraser-target'));
      if (!await this.wait(460, generation)) return false;
      targets.forEach(target => target.classList.remove('effect-eraser-target'));
      step.targetIndices.forEach(targetIndex => this.setReelIcon(targetIndex, step.iconsAfter[targetIndex]!));
      targets.forEach(target => target.classList.add('effect-eraser-cascade'));
      if (!await this.wait(460, generation)) return false;
      source?.classList.remove('effect-active', 'effect-eraser');
      targets.forEach(target => target.classList.remove('effect-eraser-cascade'));
      step.iconsAfter.forEach((icon, index) => this.setReelIcon(index, icon));
      return this.wait(180, generation);
    }

    if (step.kind === 'wizard') {
      const destination = step.targetIndices.find(index => index !== step.sourceIndex) ?? step.sourceIndex;
      source?.style.setProperty('--scd-wizard-x', `${(destination - step.sourceIndex) * 110}%`);
    }
    source?.classList.add(`effect-${step.kind}`);
    targets.forEach(target => target.classList.add(`effect-${step.kind}-target`));
    if (step.kind === 'dice') {
      for (let index = 0; index < 5; index += 1) {
        if (!await this.wait(75, generation)) return false;
        this.setReelIcon(step.sourceIndex, GATEWAY_SLOT_ICON_IDS[(index * 7 + step.sourceIndex) % GATEWAY_SLOT_ICON_IDS.length]!);
      }
    } else if (step.kind === 'trash') {
      step.targetIndices.forEach(targetIndex => this.setReelIcon(targetIndex, step.iconsAfter[targetIndex]!));
      if (!await this.wait(460, generation)) return false;
    } else {
      if (!await this.wait(230, generation)) return false;
      step.targetIndices.forEach(targetIndex => this.setReelIcon(targetIndex, step.iconsAfter[targetIndex]!));
      if (!await this.wait(230, generation)) return false;
    }
    step.iconsAfter.forEach((icon, index) => this.setReelIcon(index, icon));
    source?.classList.remove('effect-active', `effect-${step.kind}`);
    source?.style.removeProperty('--scd-wizard-x');
    targets.forEach(target => target.classList.remove(`effect-${step.kind}-target`));
    return this.wait(180, generation);
  }

  private outcomeMessage(outcome: GatewaySlotSpinOutcome): string {
    const rewards: string[] = [];
    if (outcome.coinReward > 0) rewards.push(`+${outcome.coinReward} Skribbl Coin${outcome.coinReward === 1 ? '' : 's'}`);
    if (outcome.awardedFreeSpins > 0) rewards.push(`+${outcome.awardedFreeSpins} Free Spin${outcome.awardedFreeSpins === 1 ? '' : 's'}`);
    if (rewards.length > 0) return `You won ${rewards.join(' and ')}!`;
    if (outcome.heartProgressAfter !== outcome.heartProgressBefore) {
      return `Heart collected · ${outcome.heartProgressAfter}/3 toward a Free Spin.`;
    }
    return 'No match this time.';
  }

  private cancelAnimations(): void {
    this.animationGeneration += 1;
    for (const timer of this.animationTimers) {
      window.clearTimeout(timer);
      window.clearInterval(timer);
    }
    this.animationTimers.clear();
    this.animating = false;
    this.bulbsFlashing = false;
    if (this.latestOutcome) this.displayIcons = [...this.latestOutcome.finalIcons];
  }

  private wait(milliseconds: number, generation: number): Promise<boolean> {
    return new Promise(resolve => {
      const timer = window.setTimeout(() => {
        this.animationTimers.delete(timer);
        resolve(generation === this.animationGeneration);
      }, milliseconds);
      this.animationTimers.add(timer);
    });
  }

  private syncLoadingOverlay(): void {
    const shell = this.modal?.querySelector<HTMLElement>('.scd-slots-modal');
    if (!shell) return;
    shell.querySelector('.scd-progression-load')?.remove();
    if (!this.pendingAction) return;
    const load = element('div', 'scd-progression-load');
    const container = element('div', 'container');
    const icon = element('div', 'icon');
    icon.appendChild(element('div', 'graphic'));
    container.appendChild(icon);
    load.appendChild(container);
    shell.appendChild(load);
  }

  private ensureStyles(): void {
    if (document.getElementById('skribbl-duels-slots-styles')) return;
    const style = document.createElement('style');
    style.id = 'skribbl-duels-slots-styles';
    style.textContent = `
html[data-scd-slots-scroll-lock],body[data-scd-slots-scroll-lock] { overflow:hidden !important;overscroll-behavior:none !important; }
.scd-slots-launcher { position:fixed;right:18px;top:calc(25vh + 158px);z-index:2147483643;display:grid;place-items:center;width:min(300px,32vw);min-height:80px;border:0;padding:0;background:transparent;cursor:pointer;filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25));transition:filter .1s ease-in-out,transform .1s ease-in-out; }
.scd-slots-launcher:hover { filter:drop-shadow(4px 4px 0 rgba(0,0,0,.32)) brightness(1.08);transform:scale(1.06); }
.scd-slots-launcher img { display:block;width:100%;height:auto;max-height:152px;object-fit:contain; }
.scd-slots-logo-fallback { padding:10px 14px;border-radius:8px;background:var(--COLOR_PANEL_BUTTON,#2a51d1);color:#fff;font-weight:900;letter-spacing:.08em;text-shadow:2px 2px 0 #0005; }
.scd-slots-overlay { position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:42px 12px 12px;background:rgba(0,0,0,.58);backdrop-filter:blur(4px);animation:scd-slots-fade .2s ease-out;font-family:'Nunito',sans-serif; }
.scd-slots-modal { position:relative;width:min(940px,calc(100vw - 24px));max-height:calc(100vh - 54px);display:flex;flex-direction:column;overflow:visible;border-radius:10px;background:var(--COLOR_PANEL_BG,rgba(22,24,31,.97));color:var(--COLOR_PANEL_TEXT,#fff);box-shadow:0 0 50px rgba(0,0,0,.25);font-family:'Nunito',sans-serif; }
.scd-slots-bulbs { position:absolute;z-index:4;left:5%;right:5%;top:-36px;display:flex;align-items:flex-end;justify-content:space-between;pointer-events:none; }
.scd-slots-bulb { width:58px;height:58px;object-fit:contain;transform:rotate(var(--scd-bulb-turn));filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25)); }
.scd-slots-bulb:not([src]) { border-radius:50%;background:#555;box-shadow:inset 0 0 0 5px #222; }
.scd-slots-bulb:not([src]).fallback-on { background:#ffe822;box-shadow:0 0 18px #fff36a,inset 0 0 0 5px #b58e00; }
.scd-slots-header { min-height:92px;display:grid;grid-template-columns:minmax(130px,1fr) minmax(280px,2fr) minmax(130px,1fr);align-items:center;gap:10px;padding:12px;overflow:hidden;border-radius:10px 10px 0 0; }
.scd-slots-title { justify-self:center;font-size:2em;font-weight:900;letter-spacing:.08em;text-shadow:2px 2px 0 #0004; }
.scd-slots-title img { display:block;width:min(520px,54vw);max-height:82px;object-fit:contain; }
.scd-slots-actions { justify-self:end;display:flex;gap:6px; }
.scd-slots-actions .scd-icon-button { width:42px;height:42px; }
.scd-slots-actions .scd-icon { width:36px;height:36px; }
.scd-slots-content { min-height:330px;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;align-items:center;gap:16px;padding:10px 24px 24px;text-align:center; }
.scd-slots-machine { width:100%;display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,220px);align-items:center;gap:22px; }
.scd-slots-reels { min-width:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px; }
.scd-slot-reel { position:relative;min-width:0;aspect-ratio:1/.9;display:grid;place-items:center;overflow:hidden;border:5px solid #48a2ff;border-radius:13px;background:#fff;box-shadow:inset 0 8px 12px #0002;transition:transform 1s ease,filter .2s ease; }
.scd-slot-reel::before,.scd-slot-reel::after { content:'';position:absolute;z-index:2;left:0;right:0;height:19%;pointer-events:none;background:linear-gradient(to bottom,rgba(0,0,0,.2),transparent); }
.scd-slot-reel::before { top:0; }
.scd-slot-reel::after { bottom:0;transform:rotate(180deg); }
.scd-slot-payline { width:78%;height:78%;display:grid;place-items:center;transition:transform .2s ease,opacity .2s ease; }
.scd-slot-icon { display:grid;place-items:center;min-width:0;min-height:0; }
.scd-slot-icon img { display:block;width:100%;height:100%;max-width:128px;max-height:128px;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25)); }
.scd-slot-icon-fallback { display:grid;place-items:center;width:100%;height:100%;font-size:clamp(28px,7vw,86px);font-weight:900;color:#222;text-shadow:3px 3px 0 #0003; }
.scd-slot-reel.spinning .scd-slot-payline { animation:scd-reel-spin .15s linear infinite; }
.scd-slot-reel.stopped { animation:scd-reel-stop .26s ease-out; }
.scd-slot-reel.effect-active { z-index:3;transform:scale(1.2);filter:drop-shadow(0 0 15px #fff9); }
.scd-slot-reel.effect-fill-target .scd-slot-payline { animation:scd-slot-pop .46s ease; }
.scd-slot-reel.effect-wizard { animation:scd-slot-wizard .46s ease; }
.scd-slot-reel.effect-wizard-target .scd-slot-payline { animation:scd-slot-magic .46s ease; }
.scd-slot-reel.effect-eraser-target .scd-slot-payline { animation:scd-slot-erase .46s ease; }
.scd-slot-reel.effect-eraser-cascade .scd-slot-payline { animation:scd-slot-cascade .46s ease; }
.scd-slot-reel.effect-trash-target .scd-slot-payline { animation:scd-slot-cascade .46s ease; }
.scd-slot-reel.effect-dice-target .scd-slot-payline { animation:scd-slot-dice .15s linear infinite; }
.scd-slots-controls { display:flex;flex-direction:column;align-items:center;gap:12px; }
.scd-slots-spin { min-height:48px;display:flex;align-items:center;justify-content:center;gap:7px;border:0;border-radius:var(--BORDER_RADIUS,7px);padding:7px 14px;background:var(--COLOR_PANEL_BUTTON,#2a51d1);color:#fff;font:800 18px/1.1 'Nunito',sans-serif;cursor:pointer;text-shadow:2px 2px 0 #0003; }
.scd-slots-spin:hover:not(:disabled) { background:var(--COLOR_PANEL_BUTTON_HOVER,#1e44be); }
.scd-slots-spin:disabled { opacity:.55;cursor:not-allowed; }
.scd-spin-cost-icon { width:36px;height:36px; }
.scd-spin-cost-icon img { width:36px;height:36px; }
.scd-slots-heart-progress { display:flex;gap:5px; }
.scd-slots-heart-progress .scd-slot-icon { width:30px;height:30px;transition:opacity .15s ease,transform .15s ease; }
.scd-slots-heart-progress .scd-slot-icon.empty { opacity:.25;filter:grayscale(1); }
.scd-slots-heart-progress .scd-slot-icon:hover { opacity:1;transform:scale(1.12); }
.scd-slots-result { min-height:1.4em;font-weight:800;color:var(--COLOR_PANEL_TEXT_SUB,#ffffffb3); }
.scd-slots-result.win { color:var(--COLOR_CHAT_TEXT_GUESSED,#6fd66a); }
.scd-slots-help { width:100%;box-sizing:border-box;padding:12px;border-radius:8px;background:var(--COLOR_PANEL_LO,rgba(0,0,0,.16));text-align:left; }
.scd-slots-help-intro { display:flex;align-items:flex-start;gap:12px; }
.scd-slots-help-intro > img { width:64px;height:64px;object-fit:contain;flex:0 0 auto;filter:drop-shadow(3px 3px 0 rgba(0,0,0,.25)); }
.scd-slots-help p { margin:.55em 0 0; }
.scd-slots-odds { margin-top:14px; }
.scd-slots-odds-grid { margin-top:8px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px; }
.scd-slots-odds-item { min-width:0;display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:5px;padding:4px 6px;border-radius:6px;background:var(--COLOR_PANEL_BG,rgba(0,0,0,.15)); }
.scd-slots-odds-item .scd-slot-icon { width:30px;height:30px; }
.scd-slots-odds-item .scd-slot-icon-fallback { font-size:18px; }
.scd-slots-muted { color:var(--COLOR_PANEL_TEXT_SUB,#ffffffa8); }
.scd-slots-modal > .scd-progression-load { border-radius:10px;overflow:hidden; }
.scd-slots-overlay::-webkit-scrollbar,.scd-slots-overlay *::-webkit-scrollbar { width:14px;height:14px;border-radius:7px;background-color:var(--COLOR_PANEL_LO); }
.scd-slots-overlay::-webkit-scrollbar-thumb,.scd-slots-overlay *::-webkit-scrollbar-thumb { border-radius:7px;background-color:var(--COLOR_PANEL_HI); }
@keyframes scd-slots-fade { from { opacity:0; } to { opacity:1; } }
@keyframes scd-reel-spin { from { transform:translateY(-12%) scale(.92);filter:blur(1px); } to { transform:translateY(12%) scale(1.04);filter:blur(2px); } }
@keyframes scd-reel-stop { 0% { transform:translateY(-8%); } 65% { transform:translateY(4%); } 100% { transform:translateY(0); } }
@keyframes scd-slot-pop { 0%,100% { transform:scale(1); } 45% { transform:scale(.2);opacity:.3; } 72% { transform:scale(1.2);opacity:1; } }
@keyframes scd-slot-wizard { 0%,100% { translate:0 0; } 40% { translate:var(--scd-wizard-x,110%) -35%; } 70% { translate:var(--scd-wizard-x,110%) 0; } }
@keyframes scd-slot-magic { 0%,100% { filter:none; } 45% { filter:hue-rotate(160deg) brightness(1.7);transform:scale(.55) rotate(180deg); } }
@keyframes scd-slot-erase { 0% { transform:translateY(0);opacity:1; } 50% { transform:translateY(-28%) rotate(-8deg);opacity:.5; } 100% { transform:translateY(30%);opacity:0; } }
@keyframes scd-slot-cascade { from { transform:translateY(-140%);opacity:0; } to { transform:translateY(0);opacity:1; } }
@keyframes scd-slot-dice { from { transform:rotate(0) scale(.9); } to { transform:rotate(90deg) scale(1.08); } }
@media (max-width:720px) {
  .scd-slots-header { grid-template-columns:auto 1fr auto; }
  .scd-slots-title { font-size:1.2em; }
  .scd-slots-launcher { right:8px;top:calc(22vh + 130px);width:min(240px,46vw); }
  .scd-slots-machine { grid-template-columns:1fr; }
  .scd-slots-reels { gap:6px; }
  .scd-slots-odds-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .scd-slots-bulb { width:42px;height:42px; }
  .scd-slots-bulbs { top:-27px; }
}
@media (prefers-reduced-motion:reduce) {
  .scd-slots-overlay,.scd-slot-reel,.scd-slot-payline,.scd-slots-bulb { animation:none !important;transition:none !important; }
}
`;
    (document.head ?? document.documentElement).appendChild(style);
  }
}

export const SKRIBBL_SLOTS_ASSET_MAP_FOR_TESTING = SLOT_ASSETS;
