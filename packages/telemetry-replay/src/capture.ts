import type {
  TelemetryEvent,
  TelemetryProvider,
  Unsubscribe
} from '@skribbl-duels/telemetry-contracts';
import { createTelemetryFixture } from './fixture';
import type {
  CreateTelemetryFixtureOptions,
  TelemetryFixture
} from './types';

export class TelemetryFixtureCapture {
  private readonly events: TelemetryEvent[] = [];
  private unsubscribe: Unsubscribe | null = null;

  public constructor(
    private readonly provider: TelemetryProvider,
    private readonly includeHighVolumeEvents = false
  ) {}

  public start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.provider.subscribe(event => {
      if (!this.includeHighVolumeEvents && event.highVolume) return;
      this.events.push(structuredClone(event));
    });
  }

  public stop(options: CreateTelemetryFixtureOptions = {}): TelemetryFixture {
    this.unsubscribe?.();
    this.unsubscribe = null;
    return createTelemetryFixture(this.events, {
      ...options,
      includeHighVolumeEvents: this.includeHighVolumeEvents
    });
  }

  public clear(): void {
    this.events.length = 0;
  }

  public getEventCount(): number {
    return this.events.length;
  }
}
