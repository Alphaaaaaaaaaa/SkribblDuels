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
  const actor = candidate.actor as Record<string, unknown> | null | undefined;
  const context = candidate.context as unknown as Record<string, unknown> | null;
  const source = candidate.source as unknown as Record<string, unknown> | null;
  const nullableString = (item: unknown): boolean => item === null || typeof item === 'string';
  const nullableNumber = (item: unknown): boolean => item === null || (typeof item === 'number' && Number.isFinite(item));
  const validActor = actor === null || Boolean(actor
    && nullableNumber(actor.playerId)
    && nullableString(actor.name)
    && typeof actor.isSelf === 'boolean');
  const validContext = Boolean(context
    && nullableString(context.lobbySessionId)
    && Number.isInteger(context.lobbyGeneration)
    && Number(context.lobbyGeneration) >= 0
    && nullableString(context.lobbyId)
    && nullableNumber(context.lobbyType)
    && nullableNumber(context.languageId)
    && nullableString(context.languageName)
    && nullableString(context.gameSessionId)
    && nullableString(context.roundSessionId)
    && nullableNumber(context.roundIndex)
    && nullableNumber(context.roundNumber)
    && nullableNumber(context.maxRounds)
    && nullableNumber(context.gameStateId)
    && typeof context.gameStateName === 'string'
    && nullableNumber(context.meId)
    && nullableNumber(context.drawerId));
  const validSource = Boolean(source
    && (source.origin === 'lobby-change'
      || source.origin === 'decoded-packet'
      || source.origin === 'dom-adapter'
      || source.origin === 'system')
    && nullableString(source.rawRecordId)
    && nullableString(source.changeId)
    && (source.direction === null
      || source.direction === 'server-to-client'
      || source.direction === 'client-to-server')
    && nullableString(source.socketEvent)
    && nullableNumber(source.packetId));
  return candidate.schemaVersion === TELEMETRY_SCHEMA_VERSION &&
    typeof candidate.eventId === 'string' && candidate.eventId.length > 0 && candidate.eventId.length <= 160 &&
    Number.isInteger(candidate.telemetrySequence) && Number(candidate.telemetrySequence) >= 0 &&
    isTelemetryEventType(candidate.type) &&
    candidate.category === TELEMETRY_EVENT_CATEGORIES[candidate.type] &&
    typeof candidate.occurredAt === 'number' && Number.isFinite(candidate.occurredAt) &&
    typeof candidate.monotonicMs === 'number' && Number.isFinite(candidate.monotonicMs) && candidate.monotonicMs >= 0 &&
    validActor &&
    validContext &&
    validSource &&
    typeof candidate.payload === 'object' &&
    candidate.payload !== null &&
    (candidate.confidence === 'confirmed'
      || candidate.confidence === 'derived'
      || candidate.confidence === 'provisional') &&
    typeof candidate.highVolume === 'boolean';
}

export function isTelemetryEventOf<TType extends TelemetryEventType>(
  event: TelemetryEvent,
  type: TType
): event is TelemetryEventOf<TType> {
  return event.type === type;
}
