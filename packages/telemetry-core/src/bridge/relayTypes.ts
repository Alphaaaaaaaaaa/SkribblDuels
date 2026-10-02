export type RelayDirection = 'server-to-client' | 'client-to-server';
export type RelayName = 'skribblMessagePort' | 'skribblEmitPort' | 'skribblDuelsMessagePort' | 'skribblDuelsEmitPort';

export interface IncomingRelayEnvelope {
  direction: 'server-to-client';
  relayName: 'skribblMessagePort' | 'skribblDuelsMessagePort';
  data: unknown;
  portGeneration: number;
  occurredAt?: number;
  monotonicMs?: number;
}

export interface OutgoingRelayEnvelope {
  direction: 'client-to-server';
  relayName: 'skribblEmitPort' | 'skribblDuelsEmitPort';
  event: string | null;
  data: unknown;
  raw: unknown;
  portGeneration: number;
  occurredAt?: number;
  monotonicMs?: number;
}

export type RelayEnvelope = IncomingRelayEnvelope | OutgoingRelayEnvelope;

export interface RelayStatus {
  relayName: RelayName;
  connected: boolean;
  portGeneration: number;
  connectedAt: number | null;
  messageCount: number;
}
