export const GATEWAY_CONTRACT_VERSION = 1 as const;
export const GATEWAY_SOCKET_EVENT = 'gateway:message' as const;

export interface GatewaySocketAuth {
  accessToken?: string;
}

export type GatewayClientCapability =
  | 'skribbl-telemetry'
  | 'official-word-list'
  | 'typo'
  | 'typo-challenges'
  | 'typo-drops'
  | 'typo-image-lab';

export interface GatewayClientIdentity {
  accountId: string;
  displayName: string;
  discordUserId: string | null;
}

export interface GatewayHelloMessage {
  type: 'HELLO';
  contractVersion: typeof GATEWAY_CONTRACT_VERSION;
  clientVersion: string;
  capabilities: readonly GatewayClientCapability[];
  resumeMatchId?: string;
  lastServerRevision?: number;
}

export interface GatewayMatchmakingJoinMessage {
  type: 'MATCHMAKING_JOIN';
  requestId: string;
  format: 'casual' | 'ranked';
}

export interface GatewayMatchmakingLeaveMessage {
  type: 'MATCHMAKING_LEAVE';
  requestId: string;
}

export interface GatewayReadyMessage {
  type: 'READY_SET';
  matchId: string;
  ready: boolean;
}

export interface GatewayDraftPickMessage {
  type: 'DRAFT_PICK';
  matchId: string;
  challengeId: string;
  clientRevision: number;
}

export interface GatewayClaimCandidateMessage {
  type: 'CLAIM_CANDIDATE';
  matchId: string;
  candidateId: string;
  challengeId: string;
  definitionVersion: number;
  evidenceEventIds: readonly string[];
  occurredAt: number;
}

export interface GatewayTelemetryBatchMessage {
  type: 'TELEMETRY_BATCH';
  matchId: string;
  firstSequence: number;
  lastSequence: number;
  envelopes: readonly unknown[];
}

export interface GatewayDuelChatSendMessage {
  type: 'DUEL_CHAT_SEND';
  matchId: string;
  clientMessageId: string;
  message: string;
}

export interface GatewayPingMessage {
  type: 'PING';
  sentAt: number;
}

export type GatewayClientMessage =
  | GatewayHelloMessage
  | GatewayMatchmakingJoinMessage
  | GatewayMatchmakingLeaveMessage
  | GatewayReadyMessage
  | GatewayDraftPickMessage
  | GatewayClaimCandidateMessage
  | GatewayTelemetryBatchMessage
  | GatewayDuelChatSendMessage
  | GatewayPingMessage;

export interface GatewayWelcomeMessage {
  type: 'WELCOME';
  contractVersion: typeof GATEWAY_CONTRACT_VERSION;
  connectionId: string;
  identity: GatewayClientIdentity;
  serverTime: number;
  heartbeatIntervalMs: number;
}

export interface GatewayAuthRequiredMessage {
  type: 'AUTH_REQUIRED';
  reason: 'missing-token' | 'invalid-token' | 'expired-token';
}

export interface GatewayQueueStatusMessage {
  type: 'QUEUE_STATUS';
  format: 'casual' | 'ranked';
  queued: boolean;
  position: number | null;
}

export interface GatewayMatchSnapshotMessage {
  type: 'MATCH_SNAPSHOT';
  matchId: string;
  revision: number;
  state: unknown;
}

export interface GatewayMatchEventMessage {
  type: 'MATCH_EVENT';
  matchId: string;
  revision: number;
  event: unknown;
}

export interface GatewayClaimResolutionMessage {
  type: 'CLAIM_RESOLUTION';
  matchId: string;
  candidateId: string;
  challengeId: string;
  accepted: boolean;
  claimId: string | null;
  reason: string | null;
  revision: number;
}

export interface GatewayDuelChatMessage {
  type: 'DUEL_CHAT_MESSAGE';
  matchId: string;
  messageId: string;
  authorAccountId: string;
  authorDisplayName: string;
  message: string;
  occurredAt: number;
}

export interface GatewayPongMessage {
  type: 'PONG';
  clientSentAt: number;
  serverTime: number;
}

export interface GatewayErrorMessage {
  type: 'ERROR';
  code: string;
  message: string;
  recoverable: boolean;
  requestId?: string;
}

export type GatewayServerMessage =
  | GatewayWelcomeMessage
  | GatewayAuthRequiredMessage
  | GatewayQueueStatusMessage
  | GatewayMatchSnapshotMessage
  | GatewayMatchEventMessage
  | GatewayClaimResolutionMessage
  | GatewayDuelChatMessage
  | GatewayPongMessage
  | GatewayErrorMessage;
