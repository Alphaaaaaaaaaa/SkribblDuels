import {
  TELEMETRY_CONTRACT_VERSION,
  TELEMETRY_SCHEMA_VERSION,
  type TelemetryActor,
  type TelemetryConfidence,
  type TelemetryContext,
  type TelemetryProviderDescriptor,
  type TelemetrySource,
  type Unsubscribe
} from './base';
import {
  LIVE_ONLY_TELEMETRY_EVENTS,
  TELEMETRY_EVENT_CATEGORIES,
  type TelemetryEventType,
  type TelemetryPayloadMap
} from './events';

interface TelemetryEventShape<TType extends TelemetryEventType> {
  schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  eventId: string;
  telemetrySequence: number;
  type: TType;
  category: typeof TELEMETRY_EVENT_CATEGORIES[TType];
  occurredAt: number;
  monotonicMs: number;
  actor: TelemetryActor | null;
  context: TelemetryContext;
  source: TelemetrySource;
  payload: TelemetryPayloadMap[TType];
  confidence: TelemetryConfidence;
  highVolume: TType extends typeof LIVE_ONLY_TELEMETRY_EVENTS[number] ? true : boolean;
}

export type TelemetryEvent = {
  [TType in TelemetryEventType]: TelemetryEventShape<TType>
}[TelemetryEventType];

export type TelemetryEventOf<TType extends TelemetryEventType> =
  Extract<TelemetryEvent, { type: TType }>;

export type TelemetryEventHandler<TType extends TelemetryEventType = TelemetryEventType> =
  (event: TelemetryEventOf<TType>) => void;

export interface TelemetryStats {
  total: number;
  retained: number;
  omittedHighVolume: number;
  byType: Partial<Record<TelemetryEventType, number>>;
  lastEvent: TelemetryEvent | null;
}

export interface TelemetryExportOptions {
  includeHighVolumeEvents?: boolean;
}

export interface TelemetryProvider {
  readonly descriptor: TelemetryProviderDescriptor;
  getStats(): TelemetryStats;
  getRecent(options?: TelemetryExportOptions): TelemetryEvent[];
  getByType<TType extends TelemetryEventType>(type: TType): TelemetryEventOf<TType>[];
  subscribe(listener: (event: TelemetryEvent) => void): Unsubscribe;
}

export function createTelemetryProviderDescriptor(
  providerName: string,
  providerVersion: string,
  supportedEvents: readonly TelemetryEventType[]
): TelemetryProviderDescriptor {
  return {
    providerName,
    providerVersion,
    contractVersion: TELEMETRY_CONTRACT_VERSION,
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    supportedEvents
  };
}
