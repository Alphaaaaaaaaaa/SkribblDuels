import type { Subscription } from 'rxjs';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';
import type { TelemetryStore } from '../telemetry/telemetryStore';

const DEFAULT_WHITE_CHANNEL_THRESHOLD = 250;

export interface CanvasPixelMetrics {
  width: number;
  height: number;
  totalPixels: number;
  whitePixels: number;
  nonWhitePixels: number;
  whiteRatio: number;
}

function candidateCanvases(): HTMLCanvasElement[] {
  const candidates = [
    ...document.querySelectorAll<HTMLCanvasElement>('canvas#game-canvas'),
    ...document.querySelectorAll<HTMLCanvasElement>('#game-canvas canvas'),
    ...document.querySelectorAll<HTMLCanvasElement>('#game canvas'),
    ...document.querySelectorAll<HTMLCanvasElement>('canvas.game-canvas')
  ];

  return Array.from(new Set(candidates))
    .filter(canvas => canvas.width > 0 && canvas.height > 0)
    .sort((a, b) => {
      const preferredA = a.width === 800 && a.height === 600 ? 1 : 0;
      const preferredB = b.width === 800 && b.height === 600 ? 1 : 0;
      return preferredB - preferredA || (b.width * b.height) - (a.width * a.height);
    });
}

export function calculateCanvasPixelMetrics(
  imageData: ImageData,
  whiteChannelThreshold = DEFAULT_WHITE_CHANNEL_THRESHOLD
): CanvasPixelMetrics {
  const totalPixels = imageData.width * imageData.height;
  let whitePixels = 0;
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const alpha = data[index + 3] ?? 0;
    if (alpha === 0 ||
        (red >= whiteChannelThreshold &&
         green >= whiteChannelThreshold &&
         blue >= whiteChannelThreshold)) {
      whitePixels += 1;
    }
  }

  const nonWhitePixels = Math.max(0, totalPixels - whitePixels);
  return {
    width: imageData.width,
    height: imageData.height,
    totalPixels,
    whitePixels,
    nonWhitePixels,
    whiteRatio: totalPixels > 0 ? whitePixels / totalPixels : 0
  };
}

/** Emits an exact canvas snapshot when another player correctly guesses the local drawer's image. */
export class CanvasSnapshotTelemetryAdapter {
  private readonly subscription: Subscription;
  private validStrokeCount = 0;
  private roundSessionId: string | null = null;

  public constructor(
    private readonly telemetryStore: TelemetryStore,
    private readonly canvasResolver: () => HTMLCanvasElement | null = () => candidateCanvases()[0] ?? null
  ) {
    this.subscription = telemetryStore.events$.subscribe(event => this.handleEvent(event));
  }

  public destroy(): void {
    this.subscription.unsubscribe();
  }

  private handleEvent(event: TelemetryEvent): void {
    if (event.type === 'ROUND_STARTED') {
      this.roundSessionId = event.context.roundSessionId;
      this.validStrokeCount = 0;
      return;
    }

    if (event.type === 'STROKE_STARTED' &&
        event.context.roundSessionId !== null &&
        event.context.roundSessionId === this.roundSessionId) {
      this.validStrokeCount += 1;
      return;
    }

    if (event.type !== 'CORRECT_GUESS') return;
    if (event.context.lobbyType !== 0 || event.context.roundSessionId === null) return;
    if (event.context.meId === null || event.context.drawerId !== event.context.meId) return;
    if (event.payload.playerId === event.context.meId) return;

    const canvas = this.canvasResolver();
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return;

    try {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      const metrics = calculateCanvasPixelMetrics(
        context.getImageData(0, 0, canvas.width, canvas.height)
      );

      this.telemetryStore.emitDomEvent('CANVAS_METRICS', {
        ...metrics,
        validStrokeCount: this.validStrokeCount,
        trigger: 'correct-guess-snapshot',
        triggerEventId: event.eventId,
        sampledPlayerId: event.payload.playerId
      }, {
        actor: event.actor,
        occurredAt: event.occurredAt,
        monotonicMs: event.monotonicMs
      });
    } catch (error) {
      console.warn('[Skribbl Duels Canvas Snapshot] Unable to inspect canvas pixels.', error);
    }
  }
}
