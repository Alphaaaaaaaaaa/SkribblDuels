import type {
  GatewayClientCapability,
  GatewayClientIdentity,
  GatewayClaimResolutionMessage,
  GatewayDuelChatMessage,
  GatewayInviteStatusMessage,
  GatewayMatchEventMessage,
  GatewayMatchSnapshotMessage,
  GatewayQueueStatusMessage,
  GatewayTelemetryAckMessage
} from '@skribbl-duels/gateway-contracts';

export const GATEWAY_CLIENT_VERSION = '0.59.0' as const;

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
  invite: GatewayInviteStatusMessage | null;
  match: GatewayMatchSnapshotMessage | null;
  lastMatchEvent: GatewayMatchEventMessage | null;
  duelChatMessages: readonly GatewayDuelChatMessage[];
  lastClaimResolution: GatewayClaimResolutionMessage | null;
  telemetryAck: GatewayTelemetryAckMessage | null;
  error: string | null;
}

export interface GatewayTransportStats {
  readonly matchId: string | null;
  readonly queuedTelemetry: number;
  readonly inFlightTelemetry: number;
  readonly pendingClaimCandidates: number;
  readonly acknowledgedSequence: number;
}

export interface SocketIoGatewayClientOptions {
  endpoint: string | null;
  clientVersion: string;
  capabilities: readonly GatewayClientCapability[];
}
