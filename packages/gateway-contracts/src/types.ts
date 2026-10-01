import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';

export const GATEWAY_CONTRACT_VERSION = 18 as const;
export const GATEWAY_SOCKET_EVENT = 'gateway:message' as const;

export const GATEWAY_SLOT_ICON_IDS = [
  'book', 'slimy', 'fill', 'wizard', 'eraser', 'trash', 'dice', 'heart',
  'skribbl-coin', '7', 'trophy', 'crown', 'pen', 'skribbl-duels-logo',
  'potion', 'drop', 'pizza', 'pumpkin', 'eggplant', 'pineapple', 'peach',
  'ribbon', 'skull', 'poop'
] as const;

export type GatewaySlotIconId = typeof GATEWAY_SLOT_ICON_IDS[number];
export type GatewayFreeSpinSource = 'book' | 'slimy' | 'heart';

/** Integer entries in each independently sampled base reel (126 total). */
export const GATEWAY_SLOT_BASE_WEIGHTS: Readonly<Record<GatewaySlotIconId, number>> = {
  book: 7,
  slimy: 3,
  fill: 2,
  wizard: 2,
  eraser: 4,
  trash: 1,
  dice: 4,
  heart: 8,
  'skribbl-coin': 1,
  '7': 2,
  trophy: 3,
  crown: 3,
  pen: 4,
  'skribbl-duels-logo': 4,
  potion: 5,
  drop: 5,
  pizza: 7,
  pumpkin: 7,
  eggplant: 7,
  pineapple: 9,
  peach: 9,
  ribbon: 9,
  skull: 15,
  poop: 15
};

export const GATEWAY_SLOT_COIN_REWARDS: Readonly<Partial<Record<GatewaySlotIconId, number>>> = {
  'skribbl-coin': 100,
  '7': 77,
  trophy: 50,
  crown: 50,
  pen: 40,
  'skribbl-duels-logo': 40,
  potion: 30,
  drop: 30,
  pizza: 20,
  pumpkin: 20,
  eggplant: 20,
  pineapple: 10,
  peach: 10,
  ribbon: 10
};

export const GATEWAY_SLOT_FREE_SPIN_REWARDS: Readonly<Partial<Record<GatewaySlotIconId, number>>> = {
  book: 5,
  slimy: 10
};

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
  invisibleAvatarEntitled?: boolean;
  preferredLanguage?: 'de' | 'en';
  nameColorIndex?: number;
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

export interface GatewayInviteCreateMessage {
  type: 'INVITE_CREATE';
  requestId: string;
  format: 'casual' | 'ranked';
  page: 'home';
}

export interface GatewayInviteAcceptMessage {
  type: 'INVITE_ACCEPT';
  requestId: string;
  token: string;
  page: 'home';
}

export interface GatewayInviteCancelMessage {
  type: 'INVITE_CANCEL';
  requestId: string;
  inviteId: string;
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
  throughSequence: number;
}

export interface GatewayTelemetryEnvelope {
  contractVersion: 1;
  matchId: string;
  sequence: number;
  sentAt: number;
  event: TelemetryEvent;
}

export interface GatewayTelemetryBatchMessage {
  type: 'TELEMETRY_BATCH';
  matchId: string;
  firstSequence: number;
  lastSequence: number;
  envelopes: readonly GatewayTelemetryEnvelope[];
}

export interface GatewayDuelChatSendMessage {
  type: 'DUEL_CHAT_SEND';
  matchId: string;
  clientMessageId: string;
  message: string;
}

export interface GatewayMatchForfeitMessage {
  type: 'MATCH_FORFEIT';
  matchId: string;
  actionId: string;
}

export interface GatewayRematchRequestMessage {
  type: 'MATCH_REMATCH';
  matchId: string;
  actionId: string;
}

export interface GatewayDrawProposeMessage {
  type: 'DRAW_PROPOSE';
  matchId: string;
  actionId: string;
}

export interface GatewayDrawRespondMessage {
  type: 'DRAW_RESPOND';
  matchId: string;
  proposalId: string;
  actionId: string;
  accept: boolean;
}

export interface GatewayDrawWithdrawMessage {
  type: 'DRAW_WITHDRAW';
  matchId: string;
  proposalId: string;
  actionId: string;
}

export interface GatewayPingMessage {
  type: 'PING';
  sentAt: number;
}

export interface GatewaySkribbleOpenMessage {
  type: 'SKRIBBLE_OPEN';
  requestId: string;
  languageId: number;
  mode: 'daily' | 'practice';
}

export interface GatewaySkribbleGuessMessage {
  type: 'SKRIBBLE_GUESS';
  requestId: string;
  sessionId: string;
  guess: string;
}

export interface GatewaySlotsOpenMessage {
  type: 'SLOTS_OPEN';
  requestId: string;
}

export interface GatewaySlotsSpinMessage {
  type: 'SLOTS_SPIN';
  requestId: string;
  sessionId: string;
}

export type GatewaySocialAvailability = 'online' | 'idle' | 'offline';
export type GatewaySocialVisibility = 'everyone' | 'friends' | 'nobody';
export type GatewaySocialPresenceKind = 'duel' | GatewaySocialAvailability;

export interface GatewaySocialLobbyPresence {
  lobbyId: string | null;
  lobbyType: 'public' | 'private';
  languageName: string;
  playerCount: number;
  maxPlayers: number;
}

export interface GatewaySocialPreferences {
  availability: GatewaySocialAvailability;
  profileStatusVisibility: GatewaySocialVisibility;
  lobbyStatusVisibility: GatewaySocialVisibility;
  lobbyJoinMode: 'public' | 'private' | 'none';
  receiveFriendRequests: boolean;
  receiveMatchInvites: boolean;
}

export interface GatewaySocialSyncMessage { type: 'SOCIAL_SYNC'; requestId: string; }
export interface GatewaySocialPreferencesSetMessage {
  type: 'SOCIAL_PREFERENCES_SET'; requestId: string; preferences: GatewaySocialPreferences;
}
export interface GatewaySocialProfileStatusSetMessage {
  type: 'SOCIAL_PROFILE_STATUS_SET'; requestId: string; challengeId: string | null; text: string;
}
export interface GatewaySocialPresenceSetMessage {
  type: 'SOCIAL_PRESENCE_SET'; requestId: string; page: 'home' | 'lobby'; lobby: GatewaySocialLobbyPresence | null;
}
export interface GatewaySocialPinnedStat { id: string; value: string; }
export interface GatewaySocialProfileStatsSetMessage {
  type: 'SOCIAL_PROFILE_STATS_SET'; requestId: string; stats: readonly GatewaySocialPinnedStat[];
}
export interface GatewayFriendProfileGetMessage { type: 'FRIEND_PROFILE_GET'; requestId: string; accountId: string; }
export interface GatewayFriendChatHistoryGetMessage {
  type: 'FRIEND_CHAT_HISTORY_GET'; requestId: string; accountId: string; beforeSequence: number | null;
}
export interface GatewayFriendChatReadMessage {
  type: 'FRIEND_CHAT_READ'; requestId: string; accountId: string; throughSequence: number;
}

export interface GatewayFriendSearchMessage { type: 'FRIEND_SEARCH'; requestId: string; discordUsername: string; }
export interface GatewayFriendRequestSendMessage { type: 'FRIEND_REQUEST_SEND'; requestId: string; accountId: string; }
export interface GatewayFriendRequestRespondMessage {
  type: 'FRIEND_REQUEST_RESPOND'; requestId: string; friendRequestId: string;
  response: 'accept' | 'decline' | 'ignore' | 'block';
}
export interface GatewayFriendRequestWithdrawMessage {
  type: 'FRIEND_REQUEST_WITHDRAW'; requestId: string; friendRequestId: string;
}
export interface GatewayFriendUnblockMessage { type: 'FRIEND_UNBLOCK'; requestId: string; accountId: string; }
export interface GatewayFriendRemoveMessage { type: 'FRIEND_REMOVE'; requestId: string; accountId: string; }
export interface GatewayFriendPinSetMessage {
  type: 'FRIEND_PIN_SET'; requestId: string; accountId: string; pinned: boolean;
}
export interface GatewayFriendMessageSendMessage {
  type: 'FRIEND_MESSAGE_SEND'; clientMessageId: string; accountId: string; message: string;
}
export interface GatewayFriendMatchInviteSendMessage {
  type: 'FRIEND_MATCH_INVITE_SEND'; requestId: string; accountId: string; format: 'casual' | 'ranked';
}
export interface GatewayFriendMatchInviteRespondMessage {
  type: 'FRIEND_MATCH_INVITE_RESPOND'; requestId: string; inviteId: string; accept: boolean;
}

export type GatewayClientMessage =
  | GatewayHelloMessage
  | GatewayMatchmakingJoinMessage
  | GatewayMatchmakingLeaveMessage
  | GatewayInviteCreateMessage
  | GatewayInviteAcceptMessage
  | GatewayInviteCancelMessage
  | GatewayReadyMessage
  | GatewayDraftPickMessage
  | GatewayClaimCandidateMessage
  | GatewayTelemetryBatchMessage
  | GatewayDuelChatSendMessage
  | GatewayMatchForfeitMessage
  | GatewayRematchRequestMessage
  | GatewayDrawProposeMessage
  | GatewayDrawRespondMessage
  | GatewayDrawWithdrawMessage
  | GatewaySkribbleOpenMessage
  | GatewaySkribbleGuessMessage
  | GatewaySlotsOpenMessage
  | GatewaySlotsSpinMessage
  | GatewaySocialSyncMessage
  | GatewaySocialProfileStatsSetMessage
  | GatewayFriendProfileGetMessage
  | GatewayFriendChatHistoryGetMessage
  | GatewayFriendChatReadMessage
  | GatewaySocialPreferencesSetMessage
  | GatewaySocialProfileStatusSetMessage
  | GatewaySocialPresenceSetMessage
  | GatewayFriendSearchMessage
  | GatewayFriendRequestSendMessage
  | GatewayFriendRequestRespondMessage
  | GatewayFriendRequestWithdrawMessage
  | GatewayFriendUnblockMessage
  | GatewayFriendRemoveMessage
  | GatewayFriendPinSetMessage
  | GatewayFriendMessageSendMessage
  | GatewayFriendMatchInviteSendMessage
  | GatewayFriendMatchInviteRespondMessage
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

export interface GatewayInviteStatusMessage {
  type: 'INVITE_STATUS';
  requestId: string;
  inviteId: string;
  format: 'casual' | 'ranked';
  status: 'waiting' | 'accepted' | 'cancelled' | 'expired';
  token: string | null;
  expiresAt: number;
  matchId: string | null;
  reason: string | null;
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
  invisibleAvatarEntitled: boolean;
  nameColorIndex: number;
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
  phase: 'ready-check' | 'draft' | 'countdown' | 'running' | 'finished' | 'cancelled';
  participants: readonly GatewayMatchmakingParticipant[];
  readyDeadlineAt: number | null;
  countdownEndsAt: number | null;
  startedAt: number | null;
  startingAccountId: string;
  createdAt: number;
  draft?: GatewayDraftState | null;
  claims: readonly GatewayAuthoritativeClaim[];
  drawProposal: GatewayDrawProposal | null;
  conclusion: GatewayMatchConclusion | null;
  rematchReadyAccountIds: readonly string[];
  /** Finished-match participants who explicitly left instead of waiting for a rematch. */
  departedAccountIds: readonly string[];
}

export interface GatewayDrawProposal {
  proposalId: string;
  proposerAccountId: string;
  createdAt: number;
  expiresAt: number;
}

export interface GatewayMatchConclusion {
  outcome: 'win' | 'draw';
  reason: 'win-target-reached' | 'player-forfeit' | 'player-disconnect' | 'mutual-draw';
  winnerAccountId: string | null;
  loserAccountId: string | null;
  initiatedByAccountId: string | null;
  occurredAt: number;
}

export interface GatewayAuthoritativeClaim {
  claimId: string;
  candidateId: string;
  challengeId: string;
  definitionVersion: number;
  ownerAccountId: string;
  occurredAt: number;
  revision: number;
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
    | 'MATCH_STARTED'
    | 'DRAW_PROPOSED'
    | 'DRAW_WITHDRAWN'
    | 'DRAW_REJECTED'
    | 'DRAW_EXPIRED'
    | 'MATCH_FORFEITED'
    | 'MATCH_FINISHED'
    | 'REMATCH_READY_CHANGED'
    | 'REMATCH_STARTED';
  accountId: string | null;
  reason: string | null;
  challengeId?: string;
  pickNumber?: number;
  automatic?: boolean;
  proposalId?: string;
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
  definitionVersion: number;
  ownerAccountId: string;
  accepted: boolean;
  claimId: string | null;
  reason: string | null;
  revision: number;
  occurredAt: number;
}

export interface GatewayDuelChatMessage {
  type: 'DUEL_CHAT_MESSAGE';
  matchId: string;
  messageId: string;
  clientMessageId: string;
  authorAccountId: string;
  authorDisplayName: string;
  message: string;
  occurredAt: number;
}

export interface GatewayTelemetryAckMessage {
  type: 'TELEMETRY_ACK';
  matchId: string;
  lastSequence: number;
}

export interface GatewayPongMessage {
  type: 'PONG';
  clientSentAt: number;
  serverTime: number;
}

export type GatewaySkribbleMark = 'correct' | 'semicorrect' | 'incorrect';

export interface GatewaySkribbleAttempt {
  guess: string;
  marks: readonly GatewaySkribbleMark[];
  submittedAt: number;
}

export interface GatewaySkribbleState {
  sessionId: string;
  mode: 'daily' | 'practice';
  dateKey: string;
  nextDailyAt: number;
  languageId: number;
  languageName: string;
  availability: 'ready' | 'unsupported';
  unavailableReason: string | null;
  status: 'playing' | 'solved' | 'lost';
  /** Present only after the round ends; the Daily answer is never sent early. */
  answer: string | null;
  maxAttempts: 10;
  minimumLength: 2;
  maximumLength: 32;
  attempts: readonly GatewaySkribbleAttempt[];
  canEarn: boolean;
  rewarded: boolean;
  rewardAmount: number;
}

export interface GatewaySkribbleStateMessage {
  type: 'SKRIBBLE_STATE';
  requestId: string;
  state: GatewaySkribbleState;
}

export interface GatewaySkribbleGuessResultMessage {
  type: 'SKRIBBLE_GUESS_RESULT';
  requestId: string;
  accepted: boolean;
  reason: 'accepted' | 'word-not-found' | 'invalid-length' | 'session-ended' | 'session-not-found';
  state: GatewaySkribbleState;
}

export interface GatewayCoinTransactionSummary {
  transactionId: string;
  idempotencyKey: string;
  amount: number;
  sourceSinkType: string;
  sourceEntityId: string;
  balanceBefore: number;
  balanceAfter: number;
  rulesVersion: number;
  occurredAt: number;
  reversalOfTransactionId: string | null;
}

export interface GatewayCoinBalanceMessage {
  type: 'COIN_BALANCE';
  requestId: string | null;
  balance: number;
  revision: number;
  transaction: GatewayCoinTransactionSummary | null;
}

export type GatewaySlotEffectKind = 'fill' | 'wizard' | 'eraser' | 'trash' | 'dice';

export interface GatewaySlotEffectStep {
  kind: GatewaySlotEffectKind;
  sourceIndex: number;
  targetIndices: readonly number[];
  iconsAfter: readonly [GatewaySlotIconId, GatewaySlotIconId, GatewaySlotIconId];
}

export interface GatewaySlotsState {
  sessionId: string;
  rulesVersion: number;
  reelCount: 3;
  spinCost: 1;
  freeSpins: number;
  nextFreeSpinSource: GatewayFreeSpinSource | null;
  heartProgress: number;
  heartTarget: 3;
  canSpin: boolean;
}

export interface GatewaySlotsStateMessage {
  type: 'SLOTS_STATE';
  requestId: string;
  state: GatewaySlotsState;
}

export interface GatewaySlotSpinOutcome {
  spinId: string;
  initialIcons: readonly [GatewaySlotIconId, GatewaySlotIconId, GatewaySlotIconId];
  effectSteps: readonly GatewaySlotEffectStep[];
  finalIcons: readonly [GatewaySlotIconId, GatewaySlotIconId, GatewaySlotIconId];
  usedFreeSpin: boolean;
  usedFreeSpinSource: GatewayFreeSpinSource | null;
  coinCost: 0 | 1;
  coinReward: number;
  awardedFreeSpins: number;
  freeSpinsBefore: number;
  freeSpinsAfter: number;
  nextFreeSpinSource: GatewayFreeSpinSource | null;
  heartProgressBefore: number;
  heartProgressAfter: number;
  balanceBefore: number;
  balanceAfter: number;
  occurredAt: number;
}

export interface GatewaySlotsSpinResultMessage {
  type: 'SLOTS_SPIN_RESULT';
  requestId: string;
  accepted: boolean;
  reason: 'accepted' | 'session-not-found' | 'insufficient-coins';
  state: GatewaySlotsState;
  outcome: GatewaySlotSpinOutcome | null;
  coinRevision: number;
}

export interface GatewaySocialProfile {
  accountId: string;
  displayName: string;
  discordUsername: string;
  avatarSource: 'discord' | 'skribbl';
  avatarUrl: string | null;
  skribblAvatar: readonly [number, number, number, number] | null;
  specialAvatarId: string | null;
  invisibleAvatarEntitled: boolean;
  nameColorIndex: number;
  statusChallengeId: string | null;
  statusText: string;
  presence: GatewaySocialPresenceKind;
  activity?: 'home' | 'lobby' | null;
  lastSeenAt: number | null;
  lobby: GatewaySocialLobbyPresence | null;
  canJoinLobby: boolean;
  pinned: boolean;
}

export interface GatewayFriendRequestSummary {
  friendRequestId: string;
  direction: 'incoming' | 'outgoing';
  status: 'pending' | 'ignored';
  profile: GatewaySocialProfile;
  createdAt: number;
}

export interface GatewaySocialSnapshotMessage {
  type: 'SOCIAL_SNAPSHOT';
  requestId: string | null;
  revision: number;
  preferences: GatewaySocialPreferences;
  statusChallengeId: string | null;
  statusText: string;
  friends: readonly GatewaySocialProfile[];
  requests: readonly GatewayFriendRequestSummary[];
}

export interface GatewayFriendSearchResultMessage {
  type: 'FRIEND_SEARCH_RESULT';
  requestId: string;
  profile: GatewaySocialProfile | null;
  relationship: 'self' | 'friend' | 'incoming-request' | 'outgoing-request' | 'blocked' | 'none';
  canUnblock: boolean;
}

export type GatewaySocialEventKind =
  | 'friend-request-received'
  | 'friend-request-accepted'
  | 'friend-removed'
  | 'friend-message-received'
  | 'friend-message-sent'
  | 'match-invite-received'
  | 'match-invite-sent'
  | 'match-invite-accepted'
  | 'match-invite-declined'
  | 'match-invite-cancelled'
  | 'match-invite-expired';

export interface GatewaySocialEventMessage {
  type: 'SOCIAL_EVENT';
  eventId: string;
  kind: GatewaySocialEventKind;
  profile: GatewaySocialProfile;
  friendRequestId: string | null;
  clientMessageId: string | null;
  message: string | null;
  inviteId: string | null;
  inviteToken: string | null;
  format: 'casual' | 'ranked' | null;
  occurredAt: number;
  chatMessage?: GatewayFriendChatMessage;
  inviteExpiresAt?: number;
}

export interface GatewayFriendChatMessage {
  messageId: string;
  clientMessageId: string;
  sequence: number;
  senderId: string;
  recipientId: string;
  message: string;
  occurredAt: number;
  readAt: number | null;
}
export interface GatewayFriendChatHistoryMessage {
  type: 'FRIEND_CHAT_HISTORY'; requestId: string; accountId: string;
  messages: readonly GatewayFriendChatMessage[]; nextBeforeSequence: number | null;
}
export interface GatewayFriendChatInboxMessage {
  type: 'FRIEND_CHAT_INBOX'; requestId: string | null;
  unread: readonly { accountId: string; count: number }[];
}
export interface GatewayFriendProfileMessage {
  type: 'FRIEND_PROFILE'; requestId: string; profile: GatewaySocialProfile | null;
  relationship: GatewayFriendSearchResultMessage['relationship']; canUnblock: boolean;
  pinnedStats: readonly GatewaySocialPinnedStat[];
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
  | GatewayInviteStatusMessage
  | GatewayMatchSnapshotMessage
  | GatewayMatchEventMessage
  | GatewayClaimResolutionMessage
  | GatewayDuelChatMessage
  | GatewayTelemetryAckMessage
  | GatewaySkribbleStateMessage
  | GatewaySkribbleGuessResultMessage
  | GatewaySlotsStateMessage
  | GatewaySlotsSpinResultMessage
  | GatewaySocialSnapshotMessage
  | GatewayFriendChatHistoryMessage
  | GatewayFriendChatInboxMessage
  | GatewayFriendProfileMessage
  | GatewayFriendSearchResultMessage
  | GatewaySocialEventMessage
  | GatewayCoinBalanceMessage
  | GatewayPongMessage
  | GatewayErrorMessage;
