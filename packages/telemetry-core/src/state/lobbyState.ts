import type { DecodedGameState, HintEntry, ScoreEntry, SkribblUser } from '../protocol/types';

export interface LobbyUserState extends SkribblUser {
  joinedAt: number;
  updatedAt: number;
  lastRoundScore: number;
  vote: number | null;
  wrongGuessCount: number;
}

export interface GuessState {
  playerId: number;
  position: number;
  occurredAt: number;
  monotonicMs: number;
  elapsedMs: number | null;
  serverTime: number | null;
  estimatedTimeAtGuess: number | null;
  includesWord: boolean;
}

export interface ChatMessageState {
  playerId: number;
  message: string;
  occurredAt: number;
  monotonicMs: number;
}

export interface TimeChangeState {
  previousAnchorTime: number | null;
  estimatedPreviousTime: number | null;
  newTime: number;
  occurredAt: number;
  monotonicMs: number;
}

export interface RoundResultState {
  reason: number | null;
  reasonName: string | null;
  word: string | null;
  scores: ScoreEntry[];
  occurredAt: number;
}

export interface CanonicalGameState {
  /** Stable local ID for one complete skribbl game. */
  gameSessionId: string | null;

  /** Stable local ID for one drawing/guessing round. */
  roundSessionId: string | null;

  stateId: number | null;
  stateName: string;
  serverTime: number | null;
  serverTimeAnchorMonotonicMs: number | null;
  stateEnteredAt: number | null;
  stateEnteredAtMonotonicMs: number | null;

  drawerId: number | null;
  drawingStartedAt: number | null;
  drawingStartedAtMonotonicMs: number | null;

  availableWords: string[] | null;
  word: string | null;
  wordLengths: number[] | null;
  hints: HintEntry[];

  guessOrder: GuessState[];
  firstGuesserId: number | null;
  guessOrderHydrated: boolean;

  drawCommandCount: number;
  drawPacketCount: number;
  clearCount: number;
  undoCount: number;
  canvasRevision: number;

  lastTimeChange: TimeChangeState | null;
  lastCloseWord: string | null;
  lastMessage: ChatMessageState | null;
  lastOutgoingText: string | null;
  pendingSelfText: string | null;

  revealedWord: string | null;
  roundResult: RoundResultState | null;
  lastDecodedState: DecodedGameState | null;
}

export interface CanonicalLobbyState {
  schemaVersion: 1;
  hydrated: boolean;

  lobbySessionId: string | null;
  lobbyGeneration: number;
  lobbyId: string | null;
  lobbyType: number | null;
  meId: number | null;
  ownerId: number | null;

  settings: number[];
  languageId: number | null;
  languageName: string | null;

  /** Raw zero-based round value received from skribbl.io. */
  serverRoundIndex: number | null;

  /** Human-readable one-based round number used by UI and challenges. */
  round: number | null;

  users: Record<string, LobbyUserState>;
  userOrder: number[];

  game: CanonicalGameState;

  lastRecordId: string | null;
  lastSequence: number;
  lastUpdatedAt: number | null;
  lastUpdatedAtMonotonicMs: number | null;
}

export type LobbyChangeKind =
  | 'LOBBY_HYDRATED'
  | 'LOBBY_CHANGED'
  | 'PLAYER_ADDED'
  | 'PLAYER_REMOVED'
  | 'PLAYER_UPDATED'
  | 'PLAYER_RENAMED'
  | 'PLAYER_SCORE_CHANGED'
  | 'PLAYER_GUESSED'
  | 'GAME_STATE_CHANGED'
  | 'TIME_CHANGED'
  | 'SETTING_CHANGED'
  | 'OWNER_CHANGED'
  | 'VOTE_RECEIVED'
  | 'HINT_REVEALED'
  | 'CANVAS_CLEARED'
  | 'UNDO_RECEIVED'
  | 'TEXT_RECEIVED'
  | 'LOGIN_SUBMITTED'
  | 'WORD_SELECTED'
  | 'UNKNOWN_REDUCER_INPUT';

export interface LobbyStateChange {
  changeId: string;
  kind: LobbyChangeKind;
  occurredAt: number;
  monotonicMs: number;
  rawRecordId: string;
  sequence: number;
  payload: unknown;
}

export interface LobbyStateStats {
  appliedRecords: number;
  meaningfulChanges: number;
  hydrations: number;
  lobbyChanges: number;
  drawPacketsApplied: number;
  lastChange: LobbyStateChange | null;
}

export function createEmptyGameState(): CanonicalGameState {
  return {
    gameSessionId: null,
    roundSessionId: null,

    stateId: null,
    stateName: 'DISCONNECTED',
    serverTime: null,
    serverTimeAnchorMonotonicMs: null,
    stateEnteredAt: null,
    stateEnteredAtMonotonicMs: null,

    drawerId: null,
    drawingStartedAt: null,
    drawingStartedAtMonotonicMs: null,

    availableWords: null,
    word: null,
    wordLengths: null,
    hints: [],

    guessOrder: [],
    firstGuesserId: null,
    guessOrderHydrated: false,

    drawCommandCount: 0,
    drawPacketCount: 0,
    clearCount: 0,
    undoCount: 0,
    canvasRevision: 0,

    lastTimeChange: null,
    lastCloseWord: null,
    lastMessage: null,
    lastOutgoingText: null,
    pendingSelfText: null,

    revealedWord: null,
    roundResult: null,
    lastDecodedState: null
  };
}

export function createEmptyLobbyState(): CanonicalLobbyState {
  return {
    schemaVersion: 1,
    hydrated: false,

    lobbySessionId: null,
    lobbyGeneration: 0,
    lobbyId: null,
    lobbyType: null,
    meId: null,
    ownerId: null,

    settings: [],
    languageId: null,
    languageName: null,
    serverRoundIndex: null,
    round: null,

    users: {},
    userOrder: [],

    game: createEmptyGameState(),

    lastRecordId: null,
    lastSequence: 0,
    lastUpdatedAt: null,
    lastUpdatedAtMonotonicMs: null
  };
}
