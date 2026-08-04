export const TELEMETRY_SCHEMA_VERSION = 1 as const;
export const TELEMETRY_CONTRACT_VERSION = '1.0.0' as const;

export type TelemetryConfidence = 'confirmed' | 'derived' | 'provisional';

export type TelemetryCategory =
  | 'system'
  | 'lobby'
  | 'round'
  | 'guessing'
  | 'score'
  | 'chat'
  | 'drawing'
  | 'home'
  | 'moderation';

export type TelemetryRetention = 'retained' | 'live-only';

export type RelayDirection = 'server-to-client' | 'client-to-server';

export interface TelemetryActor {
  playerId: number | null;
  name: string | null;
  isSelf: boolean;
}

export interface TelemetryContext {
  lobbySessionId: string | null;
  lobbyGeneration: number;
  lobbyId: string | null;
  lobbyType: number | null;
  languageId: number | null;
  languageName: string | null;

  /** Stable local ID for the current skribbl game within a lobby session. */
  gameSessionId: string | null;

  /** Stable local ID for one drawing/guessing round. */
  roundSessionId: string | null;

  /** Raw zero-based value received from skribbl.io. */
  roundIndex: number | null;

  /** Human-readable one-based value used by UI and challenges. */
  roundNumber: number | null;
  maxRounds: number | null;

  gameStateId: number | null;
  gameStateName: string;
  meId: number | null;
  drawerId: number | null;
}

export interface TelemetrySource {
  origin: 'lobby-change' | 'decoded-packet' | 'dom-adapter' | 'system';
  rawRecordId: string | null;
  changeId: string | null;
  direction: RelayDirection | null;
  socketEvent: string | null;
  packetId: number | null;
}

export interface TelemetryProviderDescriptor {
  providerName: string;
  providerVersion: string;
  contractVersion: typeof TELEMETRY_CONTRACT_VERSION;
  schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  supportedEvents: readonly string[];
}

export type Unsubscribe = () => void;
