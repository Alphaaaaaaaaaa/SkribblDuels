import type { Subscription } from 'rxjs';
import type {
  DrawCommandBatchPayload,
  TelemetryEvent
} from '@skribbl-duels/telemetry-contracts';
import type { TelemetryStore } from '../telemetry/telemetryStore';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const DEFAULT_WHITE_DURATION_MS = 60_000;

interface ActiveWhiteWindow {
  roundSessionId: string;
  drawerId: number;
  meId: number;
  startedAt: number;
  startedAtMonotonicMs: number;
  emitted: boolean;
}

function hasNonWhiteCommand(payload: DrawCommandBatchPayload): boolean {
  return payload.commands.some(command =>
    command.kind === 'UNKNOWN_DRAW_COMMAND' ||
    ((command.kind === 'PENCIL' || command.kind === 'FILL') && command.color !== 0)
  );
}

/**
 * Emits a compact CANVAS_METRICS event when a foreign drawer keeps the canvas
 * continuously white for the configured duration. Draw packets remain live-only;
 * the resulting metric is retained and challenge-friendly.
 */
export class CanvasWhiteTelemetryAdapter {
  private readonly subscription: Subscription;
  private active: ActiveWhiteWindow | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  public constructor(
    private readonly telemetryStore: TelemetryStore,
    private readonly whiteDurationMs = DEFAULT_WHITE_DURATION_MS
  ) {
    this.subscription = telemetryStore.events$.subscribe(event => this.handleEvent(event));
  }

  public destroy(): void {
    this.cancelWindow();
    this.subscription.unsubscribe();
  }

  private handleEvent(event: TelemetryEvent): void {
    if (event.type === 'ROUND_STARTED') {
      this.cancelWindow();
      const { roundSessionId, drawerId, meId, lobbyType } = event.context;
      if (lobbyType !== 0 || roundSessionId === null || drawerId === null || meId === null) return;
      if (drawerId === meId) return;
      this.startWindow(roundSessionId, drawerId, meId, event.occurredAt, event.monotonicMs);
      return;
    }

    if (event.type === 'DRAW_COMMAND_BATCH') {
      if (!this.matchesActiveRound(event)) return;
      if (hasNonWhiteCommand(event.payload)) this.cancelWindow();
      return;
    }

    if (event.type === 'CANVAS_CLEARED') {
      const { roundSessionId, drawerId, meId, lobbyType } = event.context;
      if (lobbyType !== 0 || roundSessionId === null || drawerId === null || meId === null) return;
      if (drawerId === meId) return;
      this.startWindow(roundSessionId, drawerId, meId, event.occurredAt, event.monotonicMs);
      return;
    }

    if (event.type === 'PLAYER_LEFT' && event.payload.wasDrawer === true) {
      this.cancelWindow();
      return;
    }

    if (event.type === 'ROUND_ENDED' ||
        event.type === 'GAME_ENDED' ||
        event.type === 'LOBBY_CHANGED' ||
        event.type === 'LOBBY_HYDRATED') {
      this.cancelWindow();
    }
  }

  private matchesActiveRound(event: TelemetryEvent): boolean {
    return this.active !== null &&
      event.context.roundSessionId === this.active.roundSessionId &&
      event.context.drawerId === this.active.drawerId;
  }

  private startWindow(
    roundSessionId: string,
    drawerId: number,
    meId: number,
    occurredAt: number,
    monotonicMs: number
  ): void {
    this.cancelTimer();
    this.active = {
      roundSessionId,
      drawerId,
      meId,
      startedAt: occurredAt,
      startedAtMonotonicMs: monotonicMs,
      emitted: false
    };

    this.timer = setTimeout(() => {
      const active = this.active;
      if (!active || active.emitted || active.roundSessionId !== roundSessionId) return;
      active.emitted = true;
      const totalPixels = CANVAS_WIDTH * CANVAS_HEIGHT;
      this.telemetryStore.emitDomEvent('CANVAS_METRICS', {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        totalPixels,
        whitePixels: totalPixels,
        nonWhitePixels: 0,
        whiteRatio: 1,
        validStrokeCount: 0,
        trigger: 'continuous-white-duration',
        whiteDurationMs: this.whiteDurationMs
      }, {
        occurredAt: active.startedAt + this.whiteDurationMs,
        monotonicMs: active.startedAtMonotonicMs + this.whiteDurationMs
      });
    }, this.whiteDurationMs);
  }

  private cancelWindow(): void {
    this.cancelTimer();
    this.active = null;
  }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
