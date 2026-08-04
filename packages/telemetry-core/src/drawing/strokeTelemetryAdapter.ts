import type { Subscription } from 'rxjs';
import type {
  DrawCommandBatchPayload,
  TelemetryEvent
} from '@skribbl-duels/telemetry-contracts';
import { createId } from '../core/ids';
import type { LobbyStateStore } from '../state/lobbyStateStore';
import type { TelemetryStore } from '../telemetry/telemetryStore';

interface ActivePointerStroke {
  pointerId: number;
  roundSessionId: string;
  strokeId: string;
  startedAt: number;
  startedAtMonotonicMs: number;
  x: number;
  y: number;
  telemetryStarted: boolean;
  commandCount: number;
  colorIds: Set<number>;
  brushSizes: Set<number>;
}

function pencilCommands(payload: DrawCommandBatchPayload) {
  return payload.commands.filter(command => command.kind === 'PENCIL');
}

function resolveCanvas(target: EventTarget | null): HTMLCanvasElement | null {
  if (!(target instanceof Element)) return null;
  if (target instanceof HTMLCanvasElement) return target;
  const gameCanvas = target.closest('#game-canvas');
  if (gameCanvas instanceof HTMLCanvasElement) return gameCanvas;
  return gameCanvas?.querySelector<HTMLCanvasElement>('canvas') ?? null;
}

function canvasPoint(canvas: HTMLCanvasElement, event: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
  return {
    x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * scaleX)),
    y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * scaleY))
  };
}

/**
 * Correlates real pointer interactions on the game canvas with outgoing pencil
 * commands. A stroke is only emitted after at least one actual pencil command,
 * so empty clicks and tool interactions do not count as lines.
 */
export class StrokeTelemetryAdapter {
  private readonly subscription: Subscription;
  private active: ActivePointerStroke | null = null;
  private activeRoundSessionId: string | null = null;
  private validStrokeCount = 0;

  public constructor(
    private readonly telemetryStore: TelemetryStore,
    private readonly lobbyStore: LobbyStateStore
  ) {
    this.subscription = telemetryStore.events$.subscribe(event => this.handleTelemetry(event));
    document.addEventListener('pointerdown', this.handlePointerDown, true);
    document.addEventListener('pointerup', this.handlePointerUp, true);
    document.addEventListener('pointercancel', this.handlePointerCancel, true);
  }

  public destroy(): void {
    this.finishActiveStroke(Date.now(), performance.now());
    this.subscription.unsubscribe();
    document.removeEventListener('pointerdown', this.handlePointerDown, true);
    document.removeEventListener('pointerup', this.handlePointerUp, true);
    document.removeEventListener('pointercancel', this.handlePointerCancel, true);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const canvas = resolveCanvas(event.target);
    if (!canvas) return;

    const state = this.lobbyStore.getSnapshot();
    const roundSessionId = state.game.roundSessionId;
    if (state.lobbyType !== 0 || state.game.stateId !== 4) return;
    if (roundSessionId === null || state.meId === null || state.game.drawerId !== state.meId) return;

    if (this.active !== null) {
      this.finishActiveStroke(Date.now(), performance.now());
    }

    if (this.activeRoundSessionId !== roundSessionId) {
      this.activeRoundSessionId = roundSessionId;
      this.validStrokeCount = 0;
    }

    const point = canvasPoint(canvas, event);
    this.active = {
      pointerId: event.pointerId,
      roundSessionId,
      strokeId: createId(),
      startedAt: Date.now(),
      startedAtMonotonicMs: performance.now(),
      x: point.x,
      y: point.y,
      telemetryStarted: false,
      commandCount: 0,
      colorIds: new Set<number>(),
      brushSizes: new Set<number>()
    };
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.active?.pointerId !== event.pointerId) return;
    this.finishActiveStroke(Date.now(), performance.now());
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.active?.pointerId !== event.pointerId) return;
    this.finishActiveStroke(Date.now(), performance.now());
  };

  private handleTelemetry(event: TelemetryEvent): void {
    if (event.type === 'ROUND_STARTED') {
      this.finishActiveStroke(event.occurredAt, event.monotonicMs);
      this.activeRoundSessionId = event.context.roundSessionId;
      this.validStrokeCount = 0;
      return;
    }

    if (event.type === 'ROUND_ENDED' ||
        event.type === 'GAME_ENDED' ||
        event.type === 'LOBBY_CHANGED' ||
        event.type === 'LOBBY_HYDRATED') {
      this.finishActiveStroke(event.occurredAt, event.monotonicMs);
      this.activeRoundSessionId = null;
      this.validStrokeCount = 0;
      return;
    }

    if (event.type !== 'DRAW_COMMAND_BATCH_SUBMITTED') return;
    const active = this.active;
    if (!active || event.context.roundSessionId !== active.roundSessionId) return;
    if (event.context.meId === null || event.context.drawerId !== event.context.meId) return;

    const commands = pencilCommands(event.payload);
    if (commands.length === 0) return;

    if (!active.telemetryStarted) {
      active.telemetryStarted = true;
      this.validStrokeCount += 1;
      this.telemetryStore.emitDomEvent('STROKE_STARTED', {
        strokeId: active.strokeId,
        x: active.x,
        y: active.y
      }, {
        actor: event.actor,
        occurredAt: event.occurredAt,
        monotonicMs: event.monotonicMs
      });
    }

    active.commandCount += commands.length;
    for (const command of commands) {
      active.colorIds.add(command.color);
      active.brushSizes.add(command.brushSize);
    }
  }

  private finishActiveStroke(occurredAt: number, monotonicMs: number): void {
    const active = this.active;
    this.active = null;
    if (!active?.telemetryStarted || active.commandCount <= 0) return;

    this.telemetryStore.emitDomEvent('STROKE_ENDED', {
      strokeId: active.strokeId,
      commandCount: active.commandCount,
      validStrokeNumber: this.validStrokeCount,
      colorIds: Array.from(active.colorIds).sort((a, b) => a - b),
      brushSizes: Array.from(active.brushSizes).sort((a, b) => a - b),
      durationMs: Math.max(0, monotonicMs - active.startedAtMonotonicMs)
    }, {
      occurredAt,
      monotonicMs
    });
  }
}
