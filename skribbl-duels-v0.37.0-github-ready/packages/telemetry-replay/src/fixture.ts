import {
  TELEMETRY_CONTRACT_VERSION,
  TELEMETRY_SCHEMA_VERSION,
  isTelemetryEvent,
  type TelemetryEvent,
  type TelemetryEventType,
  type TelemetryProvider
} from '@skribbl-duels/telemetry-contracts';
import {
  TELEMETRY_FIXTURE_VERSION,
  type CreateTelemetryFixtureOptions,
  type TelemetryFixture,
  type TelemetryFixtureEntry,
  type TelemetryFixtureValidationResult
} from './types';

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sortEvents(events: readonly TelemetryEvent[]): TelemetryEvent[] {
  return [...events].sort((left, right) => {
    const sequenceDifference = left.telemetrySequence - right.telemetrySequence;
    if (sequenceDifference !== 0) return sequenceDifference;
    const monotonicDifference = left.monotonicMs - right.monotonicMs;
    if (monotonicDifference !== 0) return monotonicDifference;
    return left.occurredAt - right.occurredAt;
  });
}

export function createTelemetryFixture(
  inputEvents: readonly TelemetryEvent[],
  options: CreateTelemetryFixtureOptions = {}
): TelemetryFixture {
  const includeHighVolumeEvents = options.includeHighVolumeEvents === true;
  const sortedEvents = sortEvents(inputEvents)
    .filter(event => includeHighVolumeEvents || !event.highVolume)
    .map(event => clone(event));

  const firstMonotonicMs = sortedEvents[0]?.monotonicMs ?? 0;
  const entries: TelemetryFixtureEntry[] = sortedEvents.map(event => ({
    offsetMs: Math.max(0, event.monotonicMs - firstMonotonicMs),
    event
  }));

  const eventTypes = Array.from(
    new Set(sortedEvents.map(event => event.type))
  ).sort() as TelemetryEventType[];

  const durationMs = entries.length > 0
    ? entries[entries.length - 1]?.offsetMs ?? 0
    : 0;

  return {
    fixtureVersion: TELEMETRY_FIXTURE_VERSION,
    metadata: {
      fixtureId: options.fixtureId ?? createId(),
      name: options.name ?? `Telemetry fixture ${new Date().toISOString()}`,
      description: options.description ?? null,
      createdAt: options.createdAt ?? Date.now(),
      source: options.source ?? 'live-session',
      tags: [...(options.tags ?? [])],
      contractVersion: TELEMETRY_CONTRACT_VERSION,
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      eventCount: entries.length,
      durationMs,
      eventTypes,
      omittedHighVolumeEvents: !includeHighVolumeEvents &&
        inputEvents.some(event => event.highVolume)
    },
    events: entries
  };
}

export function createFixtureFromProvider(
  provider: TelemetryProvider,
  options: CreateTelemetryFixtureOptions = {}
): TelemetryFixture {
  return createTelemetryFixture(provider.getRecent(), options);
}

export function validateTelemetryFixture(
  value: unknown
): TelemetryFixtureValidationResult {
  const issues: string[] = [];

  if (typeof value !== 'object' || value === null) {
    return { valid: false, issues: ['Fixture must be an object.'], fixture: null };
  }

  const candidate = value as Partial<TelemetryFixture>;
  if (candidate.fixtureVersion !== TELEMETRY_FIXTURE_VERSION) {
    issues.push(`Unsupported fixtureVersion: ${String(candidate.fixtureVersion)}.`);
  }

  if (typeof candidate.metadata !== 'object' || candidate.metadata === null) {
    issues.push('Fixture metadata is missing.');
  }

  if (!Array.isArray(candidate.events)) {
    issues.push('Fixture events must be an array.');
  } else {
    let previousOffset = -1;
    for (let index = 0; index < candidate.events.length; index += 1) {
      const entry = candidate.events[index] as Partial<TelemetryFixtureEntry>;
      if (typeof entry !== 'object' || entry === null) {
        issues.push(`events[${index}] must be an object.`);
        continue;
      }
      if (typeof entry.offsetMs !== 'number' || !Number.isFinite(entry.offsetMs) || entry.offsetMs < 0) {
        issues.push(`events[${index}].offsetMs must be a finite non-negative number.`);
      } else {
        if (entry.offsetMs < previousOffset) {
          issues.push(`events[${index}].offsetMs is out of order.`);
        }
        previousOffset = entry.offsetMs;
      }
      if (!isTelemetryEvent(entry.event)) {
        issues.push(`events[${index}].event is not a valid telemetry event.`);
      }
    }
  }

  const metadata = candidate.metadata as TelemetryFixture['metadata'] | undefined;
  if (metadata) {
    if (metadata.contractVersion !== TELEMETRY_CONTRACT_VERSION) {
      issues.push(
        `Fixture contract ${String(metadata.contractVersion)} does not match ${TELEMETRY_CONTRACT_VERSION}.`
      );
    }
    if (metadata.schemaVersion !== TELEMETRY_SCHEMA_VERSION) {
      issues.push(
        `Fixture schema ${String(metadata.schemaVersion)} does not match ${TELEMETRY_SCHEMA_VERSION}.`
      );
    }
    if (typeof metadata.fixtureId !== 'string' || metadata.fixtureId.length === 0) {
      issues.push('metadata.fixtureId must be a non-empty string.');
    }
    if (typeof metadata.name !== 'string' || metadata.name.length === 0) {
      issues.push('metadata.name must be a non-empty string.');
    }
    if (Array.isArray(candidate.events)) {
      const actualEventCount = candidate.events.length;
      const actualDurationMs = actualEventCount > 0
        ? candidate.events[actualEventCount - 1]?.offsetMs ?? 0
        : 0;
      const actualEventTypes = Array.from(new Set(
        candidate.events
          .map(entry => entry?.event?.type)
          .filter((type): type is TelemetryEventType => typeof type === 'string')
      )).sort();

      if (metadata.eventCount !== actualEventCount) {
        issues.push(`metadata.eventCount is ${String(metadata.eventCount)}, expected ${actualEventCount}.`);
      }
      if (metadata.durationMs !== actualDurationMs) {
        issues.push(`metadata.durationMs is ${String(metadata.durationMs)}, expected ${actualDurationMs}.`);
      }
      if (JSON.stringify([...metadata.eventTypes].sort()) !== JSON.stringify(actualEventTypes)) {
        issues.push('metadata.eventTypes does not match the fixture events.');
      }
    }
  }

  if (issues.length > 0) {
    return { valid: false, issues, fixture: null };
  }

  return {
    valid: true,
    issues: [],
    fixture: clone(value as TelemetryFixture)
  };
}

export function parseTelemetryFixture(json: string): TelemetryFixtureValidationResult {
  try {
    return validateTelemetryFixture(JSON.parse(json));
  } catch (error) {
    return {
      valid: false,
      issues: [error instanceof Error ? error.message : String(error)],
      fixture: null
    };
  }
}
