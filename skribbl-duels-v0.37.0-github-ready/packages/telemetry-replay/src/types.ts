import type {
  TelemetryEvent,
  TelemetryEventType
} from '@skribbl-duels/telemetry-contracts';

export const TELEMETRY_FIXTURE_VERSION = 1 as const;
export const TELEMETRY_REPLAY_VERSION = '0.1.0' as const;

export type TelemetryFixtureSource =
  | 'live-session'
  | 'synthetic'
  | 'imported';

export interface TelemetryFixtureEntry {
  /** Relative event time from the first fixture event. */
  offsetMs: number;
  event: TelemetryEvent;
}

export interface TelemetryFixtureMetadata {
  fixtureId: string;
  name: string;
  description: string | null;
  createdAt: number;
  source: TelemetryFixtureSource;
  tags: string[];

  contractVersion: string;
  schemaVersion: number;

  eventCount: number;
  durationMs: number;
  eventTypes: TelemetryEventType[];
  omittedHighVolumeEvents: boolean;
}

export interface TelemetryFixture {
  fixtureVersion: typeof TELEMETRY_FIXTURE_VERSION;
  metadata: TelemetryFixtureMetadata;
  events: TelemetryFixtureEntry[];
}

export interface CreateTelemetryFixtureOptions {
  fixtureId?: string;
  name?: string;
  description?: string | null;
  source?: TelemetryFixtureSource;
  tags?: string[];
  includeHighVolumeEvents?: boolean;
  createdAt?: number;
}

export interface TelemetryFixtureValidationResult {
  valid: boolean;
  issues: string[];
  fixture: TelemetryFixture | null;
}

export type ReplayStatus =
  | 'idle'
  | 'ready'
  | 'running'
  | 'paused'
  | 'completed'
  | 'stopped'
  | 'error';

export type ReplayTimestampMode = 'preserve' | 'rebase';
export type ReplayMode = 'instant' | 'realtime' | 'scaled';

export interface ReplayOptions {
  mode?: ReplayMode;
  /** Used by scaled mode. 2 means twice as fast. */
  speed?: number;
  timestampMode?: ReplayTimestampMode;
  restartFromBeginning?: boolean;
}

export interface ReplayState {
  status: ReplayStatus;
  fixtureId: string | null;
  fixtureName: string | null;
  currentIndex: number;
  totalEvents: number;
  emittedEvents: number;
  speed: number;
  timestampMode: ReplayTimestampMode;
  startedAt: number | null;
  completedAt: number | null;
  lastEvent: TelemetryEvent | null;
  error: string | null;
}

export interface ReplayResult {
  status: ReplayStatus;
  fixtureId: string | null;
  emittedEvents: number;
  totalEvents: number;
  startedAt: number | null;
  completedAt: number | null;
}
