import type {
  ChallengeCategory,
  ChallengeDefinitionSummary
} from '@skribbl-duels/challenge-engine';
import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';

export const PRODUCT_CORE_VERSION = '0.4.0' as const;
export const MATCH_STATE_CONTRACT_VERSION = 3 as const;
export const UI_SETTINGS_VERSION = 2 as const;

export type DuelFormat = 'casual' | 'ranked';
export type DuelPlayerSide = 'self' | 'opponent';
export type MatchPhase =
  | 'idle'
  | 'matchmaking'
  | 'ready-check'
  | 'draft'
  | 'countdown'
  | 'running'
  | 'finished';

export type ChallengeCapability =
  | 'skribbl-telemetry'
  | 'official-word-list'
  | 'typo'
  | 'typo-challenges'
  | 'typo-drops'
  | 'typo-image-lab';

export interface ChallengeManifestEntry {
  id: string;
  definitionVersion: number;
  name: string;
  description: string;
  category: ChallengeCategory;
  difficulty: number;
  rankedEligible: boolean;
  formats: readonly DuelFormat[];
  capabilities: readonly ChallengeCapability[];
  conflictKeys: readonly string[];
  overlapGroups: readonly string[];
  tags: readonly string[];
}

export interface ChallengeManifestSnapshot {
  manifestVersion: 1;
  createdAt: number;
  definitionsVersion: string;
  entries: readonly ChallengeManifestEntry[];
}

export interface DraftCapabilities {
  available: ReadonlySet<ChallengeCapability>;
}

export interface DraftConstraints {
  maxPerOverlapGroup: Readonly<Record<string, number>>;
  maxPerCategory: Readonly<Partial<Record<ChallengeCategory, number>>>;
}

export interface DraftRequest {
  format: DuelFormat;
  seed?: number;
  includeIds?: readonly string[];
  excludeIds?: readonly string[];
  capabilities?: DraftCapabilities;
  constraints?: Partial<DraftConstraints>;
}

export interface DraftBoardField {
  fieldIndex: number;
  challengeId: string;
  definitionVersion: number;
}

export interface DraftBoard {
  boardId: string;
  format: DuelFormat;
  size: 9 | 25;
  winTarget: 5 | 13;
  seed: number;
  createdAt: number;
  fields: readonly DraftBoardField[];
  manifestVersion: 1;
}

export interface DraftValidationIssue {
  code:
    | 'duplicate-challenge'
    | 'conflict-key'
    | 'overlap-limit'
    | 'category-limit'
    | 'missing-capability'
    | 'wrong-board-size'
    | 'unknown-challenge';
  message: string;
  challengeIds: readonly string[];
}

export interface DraftResult {
  board: DraftBoard | null;
  issues: readonly DraftValidationIssue[];
  candidateCount: number;
}

export type MatchFieldStatus = 'available' | 'pending' | 'claimed' | 'lost';

export interface MatchBoardFieldState extends DraftBoardField {
  status: MatchFieldStatus;
  owner: DuelPlayerSide | null;
  pendingCandidateId: string | null;
  claimId: string | null;
  updatedAt: number;
}

export interface DuelParticipant {
  playerId: string;
  displayName: string;
  side: DuelPlayerSide;
}

export interface MatchFreezeState {
  frozen: boolean;
  reason: 'match-ended' | 'manual' | null;
  frozenAt: number | null;
}

export interface MatchState {
  contractVersion: typeof MATCH_STATE_CONTRACT_VERSION;
  matchId: string | null;
  phase: MatchPhase;
  format: DuelFormat | null;
  boardId: string | null;
  winTarget: number;
  fields: readonly MatchBoardFieldState[];
  participants: readonly DuelParticipant[];
  scores: Readonly<Record<DuelPlayerSide, number>>;
  outcome: 'win' | 'draw' | null;
  winner: DuelPlayerSide | null;
  finishReason: string | null;
  countdownEndsAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  freeze: MatchFreezeState;
  revision: number;
}

export interface MatchStateEvent {
  type:
    | 'MATCH_COUNTDOWN_STARTED'
    | 'MATCH_STARTED'
    | 'FIELD_PENDING'
    | 'FIELD_CLAIMED'
    | 'FIELD_REJECTED'
    | 'MATCH_FINISHED'
    | 'MATCH_RESET'
    | 'MATCH_RESTORED';
  occurredAt: number;
  state: MatchState;
  fieldIndex: number | null;
  side: DuelPlayerSide | null;
  reason: string | null;
}

export interface OutboundTelemetryEnvelope {
  contractVersion: 1;
  matchId: string;
  sequence: number;
  sentAt: number;
  event: TelemetryEvent;
}

export interface TelemetryGatewayStats {
  locallyObserved: number;
  forwarded: number;
  suppressedAfterFreeze: number;
  missingTransport: number;
  lastForwardedEventId: string | null;
  lastSuppressedEventId: string | null;
}

export type BoardAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface BoardUiSettings {
  visible: boolean;
  mode: 'anchor' | 'custom';
  anchor: BoardAnchor;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  locked: boolean;
  collapsed: boolean;
  clickThroughWhenLocked: boolean;
  showNames: boolean;
}

export interface ProductUiSettings {
  version: typeof UI_SETTINGS_VERSION;
  board: BoardUiSettings;
  panelOpen: boolean;
  panelTab: 'duel' | 'match' | 'chat' | 'settings' | 'about';
  completionMessages: boolean;
  winAnimation: boolean;
}

export interface ChallengeManifestSource {
  definitionsVersion: string;
  definitions: readonly ChallengeDefinitionSummary[];
}
