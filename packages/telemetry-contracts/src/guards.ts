import { TELEMETRY_SCHEMA_VERSION } from './base';
import { TELEMETRY_EVENT_CATEGORIES, type TelemetryEventType } from './events';
import type { TelemetryEvent, TelemetryEventOf } from './contract';

const EVENT_TYPES = new Set<TelemetryEventType>(
  Object.keys(TELEMETRY_EVENT_CATEGORIES) as TelemetryEventType[]
);

export function isTelemetryEventType(value: unknown): value is TelemetryEventType {
  return typeof value === 'string' && EVENT_TYPES.has(value as TelemetryEventType);
}

export function isTelemetryEvent(value: unknown): value is TelemetryEvent {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<TelemetryEvent>;
  return candidate.schemaVersion === TELEMETRY_SCHEMA_VERSION &&
    typeof candidate.eventId === 'string' &&
    typeof candidate.telemetrySequence === 'number' &&
    isTelemetryEventType(candidate.type) &&
    candidate.category === TELEMETRY_EVENT_CATEGORIES[candidate.type] &&
    typeof candidate.occurredAt === 'number' &&
    typeof candidate.monotonicMs === 'number' &&
    typeof candidate.payload === 'object' &&
    candidate.payload !== null;
}

export function isTelemetryEventOf<TType extends TelemetryEventType>(
  event: TelemetryEvent,
  type: TType
): event is TelemetryEventOf<TType> {
  return event.type === type;
}
