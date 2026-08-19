export type RelayDirection = 'server-to-client' | 'client-to-server';

export interface IncomingRelayEnvelope {
  direction: 'server-to-client';
  relayName: 'skribblMessagePort';
  data: unknown;
  portGeneration: number;
}

export interface OutgoingRelayEnvelope {
  direction: 'client-to-server';
  relayName: 'skribblEmitPort';
  event: string | null;
  data: unknown;
  raw: unknown;
  portGeneration: number;
}

export type RelayEnvelope = IncomingRelayEnvelope | OutgoingRelayEnvelope;

export interface RelayStatus {
  relayName: 'skribblMessagePort' | 'skribblEmitPort';
  connected: boolean;
  portGeneration: number;
  connectedAt: number | null;
  messageCount: number;
}
