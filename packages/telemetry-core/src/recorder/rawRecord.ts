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
