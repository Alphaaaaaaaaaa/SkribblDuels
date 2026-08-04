import type {
  GatewayClientCapability,
  GatewayClientIdentity,
  GatewayMatchEventMessage,
  GatewayMatchSnapshotMessage,
  GatewayQueueStatusMessage
} from '@skribbl-duels/gateway-contracts';

export const GATEWAY_CLIENT_VERSION = '0.38.0' as const;

export type GatewayConnectionStatus =
  | 'not-configured'
  | 'signed-out'
  | 'connecting'
  | 'connected'
  | 'error';

export interface GatewayConnectionSnapshot {
  status: GatewayConnectionStatus;
  endpoint: string | null;
  connectionId: string | null;
  identity: GatewayClientIdentity | null;
  connectedAt: number | null;
  serverTimeOffsetMs: number | null;
  queue: GatewayQueueStatusMessage | null;
  match: GatewayMatchSnapshotMessage | null;
  lastMatchEvent: GatewayMatchEventMessage | null;
  error: string | null;
}

export interface SocketIoGatewayClientOptions {
  endpoint: string | null;
  clientVersion: string;
  capabilities: readonly GatewayClientCapability[];
}
