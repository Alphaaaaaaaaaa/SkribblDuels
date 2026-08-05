export const GATEWAY_CONTRACT_VERSION = 4 as const;
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
  discordUsername?: string;
  avatarSource?: 'discord' | 'skribbl';
  avatarUrl?: string | null;
  skribblAvatar?: readonly [number, number, number, number] | null;
  specialAvatarId?: string | null;
  preferredLanguage?: 'de' | 'en';
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
  page: 'home';
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
  resumeStatus: 'not-requested' | 'resumed' | 'not-found' | 'mismatch';
  resumedMatchId: string | null;
}

export interface GatewayAuthRequiredMessage {
  type: 'AUTH_REQUIRED';
  reason: 'missing-token' | 'invalid-token' | 'expired-token';
}

export interface GatewayQueueStatusMessage {
  type: 'QUEUE_STATUS';
  requestId: string;
  format: 'casual' | 'ranked';
  queued: boolean;
  position: number | null;
  joinedAt: number | null;
}

export interface GatewayMatchmakingParticipant {
  accountId: string;
  displayName: string;
  ready: boolean;
  simulated: boolean;
  avatarSource: 'discord' | 'skribbl';
  avatarUrl: string | null;
  skribblAvatar: readonly [number, number, number, number] | null;
  specialAvatarId: string | null;
}

export interface GatewayDraftPick {
  pickNumber: number;
  accountId: string | null;
  challengeId: string;
  definitionVersion: number;
  automatic: boolean;
  source: 'player' | 'selection-timeout' | 'simulated-selection' | 'server-random';
  pickedAt: number;
}

export interface GatewayDraftBoardField {
  fieldIndex: number;
  challengeId: string;
  definitionVersion: number;
}

export interface GatewayDraftBoardSnapshot {
  boardId: string;
  format: 'casual' | 'ranked';
  size: 9 | 25;
  winTarget: 5 | 13;
  seed: number;
  createdAt: number;
  fields: readonly GatewayDraftBoardField[];
  manifestVersion: 1;
}

export interface GatewayDraftState {
  status: 'selecting' | 'finalizing' | 'complete';
  requiredPickCount: 9 | 25;
  playerPickCount: 8 | 24;
  turnAccountId: string | null;
  selectionDeadlineAt: number | null;
  picks: readonly GatewayDraftPick[];
  offeredChallengeIds: readonly string[];
  finalCandidateChallengeIds: readonly string[];
  finalRevealAt: number | null;
  board: GatewayDraftBoardSnapshot | null;
}

export interface GatewayMatchmakingState {
  format: 'casual' | 'ranked';
  phase: 'ready-check' | 'draft' | 'countdown' | 'running' | 'cancelled';
  participants: readonly GatewayMatchmakingParticipant[];
  readyDeadlineAt: number | null;
  countdownEndsAt: number | null;
  startedAt: number | null;
  startingAccountId: string;
  createdAt: number;
  draft?: GatewayDraftState | null;
}

export interface GatewayMatchmakingEvent {
  type:
    | 'MATCH_ABORTED'
    | 'READY_CHANGED'
    | 'READY_CHECK_COMPLETED'
    | 'READY_CHECK_EXPIRED'
    | 'DRAFT_STARTED'
    | 'DRAFT_PICKED'
    | 'DRAFT_PICK_TIMED_OUT'
    | 'DRAFT_FINAL_RANDOM_STARTED'
    | 'DRAFT_FINAL_RANDOM_SELECTED'
    | 'DRAFT_COMPLETED'
    | 'MATCH_COUNTDOWN_STARTED'
    | 'MATCH_STARTED';
  accountId: string | null;
  reason: string | null;
  challengeId?: string;
  pickNumber?: number;
  automatic?: boolean;
}

export interface GatewayMatchSnapshotMessage {
  type: 'MATCH_SNAPSHOT';
  matchId: string;
  revision: number;
  state: GatewayMatchmakingState;
}

export interface GatewayMatchEventMessage {
  type: 'MATCH_EVENT';
  matchId: string;
  revision: number;
  event: GatewayMatchmakingEvent;
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
