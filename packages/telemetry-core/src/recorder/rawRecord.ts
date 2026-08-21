import type { RelayDirection } from '../bridge/relayTypes';

export interface RawSocketRecord {
  recordId: string;
  sessionId: string;
  sequence: number;

  direction: RelayDirection;
  relayName: 'skribblMessagePort' | 'skribblEmitPort';
  portGeneration: number;

  socketEvent: string | null;
  packetId: number | null;
  packetData: unknown;
  raw: unknown;

  occurredAt: number;
  monotonicMs: number;

  page: {
    href: string;
    pathname: string;
    search: string;
    visibilityState: DocumentVisibilityState;
  };
}

export interface RecordingSession {
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
  hrefAtStart: string;
  userAgent: string;
  buildVersion: string;
}

export function extractPacketId(socketEvent: string | null, packetData: unknown): number | null {
  if (socketEvent !== null && socketEvent !== 'data') return null;

  if (
    typeof packetData === 'object' &&
    packetData !== null &&
    'id' in packetData &&
    typeof (packetData as { id?: unknown }).id === 'number'
  ) {
    return (packetData as { id: number }).id;
  }

  return null;
}

export function redactSensitivePacketData(socketEvent: string | null, packetData: unknown): unknown {
  if (socketEvent !== 'login' || packetData === null || typeof packetData !== 'object' || Array.isArray(packetData)) {
    return packetData;
  }
  const { code: _privateLobbyCode, ...safe } = packetData as Record<string, unknown>;
  return safe;
}

export function redactSensitiveRawValue(socketEvent: string | null, raw: unknown): unknown {
  if (socketEvent !== 'login' || !Array.isArray(raw)) return raw;
  return raw.map((value, index) => index === 1
    ? redactSensitivePacketData(socketEvent, value)
    : value);
}

export function redactSensitiveRawRecord(record: RawSocketRecord): RawSocketRecord {
  const packetData = redactSensitivePacketData(record.socketEvent, record.packetData);
  const raw = redactSensitiveRawValue(record.socketEvent, record.raw);
  if (packetData === record.packetData && raw === record.raw) return record;
  return { ...record, packetData, raw };
}
