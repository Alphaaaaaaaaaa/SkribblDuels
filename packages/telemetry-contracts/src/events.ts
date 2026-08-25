import type {
  CanvasMetricsPayload,
  CorrectGuessPayload,
  DrawCommandBatchPayload,
  GameStateLifecyclePayload,
  HintEntry,
  RoundResultPayload,
  RoundScoreEntry,
  RoundStartedPayload,
  ScoreChangedPayload,
  SkribblUserSnapshot
} from './models';

export interface TelemetryPayloadMap {
  PROTOCOL_ANOMALY: {
    kind: string;
    known: boolean;
    issues: string[];
    packetId: number | null;
  };

  LOBBY_HYDRATED: {
    lobbyId: string | null;
    playerCount: number;
    stateName: string | null;
    lobbyGeneration: number;
    languageId: number | null;
    languageName: string | null;
    meId: number | null;
    ownerId: number | null;
    roundIndex: number | null;
    roundNumber: number | null;
    /** Player/score snapshot captured at lobby hydration for join-baseline challenges. */
    players?: SkribblUserSnapshot[];
  };
  LOBBY_CHANGED: { previousLobbyId: string | null; lobbyId: string | null };
  LOBBY_WAITING: GameStateLifecyclePayload;
  LOBBY_JOIN_REQUESTED: Record<string, unknown>;
  LOBBY_OWNER_CHANGED: Record<string, unknown>;
  LOBBY_SETTING_CHANGED: Record<string, unknown>;
  LOBBY_SETTING_SUBMITTED: Record<string, unknown>;
  PRIVATE_LOBBY_CREATE_REQUESTED: Record<string, unknown>;
  PRIVATE_LOBBY_READY: GameStateLifecyclePayload;
  LOGIN_SUBMITTED: Record<string, unknown>;

  PLAYER_JOINED: { user: SkribblUserSnapshot | null };
  PLAYER_LEFT: {
    playerId: number | null;
    player: SkribblUserSnapshot | null;
    reason: unknown;
    reasonName: unknown;
    /** True when the leaving/kicked/banned player was the active drawer. */
    wasDrawer: boolean;
  };
  PLAYER_UPDATED: Record<string, unknown>;
  PLAYER_RENAMED: Record<string, unknown>;
  SCORE_CHANGED: ScoreChangedPayload;

  GAME_STATE_CHANGED: GameStateLifecyclePayload;
  GAME_STARTING: GameStateLifecyclePayload;
  ROUND_ANNOUNCED: GameStateLifecyclePayload;
  WORD_SELECTION_STARTED: GameStateLifecyclePayload & { availableWords: string[] | null };
  ROUND_STARTED: RoundStartedPayload;
  DRAWING_STARTED: RoundStartedPayload;
  SERVER_TIME_CHANGED: Record<string, unknown>;
  ROUND_ENDED: RoundResultPayload;
  WORD_REVEALED: RoundResultPayload;
  ROUND_RESULTS_AVAILABLE: RoundResultPayload;
  GAME_ENDED: GameStateLifecyclePayload & { finalScores?: RoundScoreEntry[] };
  GAME_START_REQUESTED: Record<string, unknown>;
  GAME_END_REQUESTED: Record<string, unknown>;
  GAME_START_FAILED: Record<string, unknown>;
  WORD_SELECTED: Record<string, unknown>;
  HINT_REVEALED: { hints?: HintEntry[] } & Record<string, unknown>;

  TEXT_SUBMITTED: { message: string | null; eligibleGuess: boolean };
  CHAT_MESSAGE_RECEIVED: {
    playerId: number | null;
    message: string | null;
    countedAsWrongGuess: boolean;
  };
  SPAM_DETECTED: Record<string, unknown>;

  TYPO_DROP_CLAIMED: {
    own: true;
    dropId: number | string | null;
    catchTimeMs: number;
    firstClaim: boolean | null;
    clearedDrop: boolean;
    leagueMode: boolean | null;
    leagueWeight: number | null;
    username: string | null;
    method: 'typo-relay' | 'chat-fallback';
  };

  TYPO_SKD_FILE_LOADED: {
    fileName: string;
    fingerprint: string;
    commandCount: number;
    loadedFromFile: true;
    method: 'typo-relay' | 'file-input-fallback';
  };
  TYPO_SKD_PASTED: {
    fileName: string | null;
    fingerprint: string;
    commandCount: number;
    loadedFromFile: true;
    clearBeforePaste: boolean | null;
    pasteInstant: boolean | null;
    method: 'typo-relay' | 'command-match-fallback' | 'imagelab-ui-fallback';
  };

  TYPO_CHALLENGE_STATE_CHANGED: {
    challengeId: number | null;
    challengeKey: string;
    challengeName: string;
    selected: boolean | null;
    effectActive: boolean;
    featureActive: boolean | null;
    reason:
      | 'selection-changed'
      | 'trigger-applied'
      | 'challenge-destroyed'
      | 'feature-destroyed'
      | 'dom-fallback';
    method: 'typo-relay' | 'dom-fallback';
  };
  TYPO_CHALLENGE_GUESS_ATTEMPT: {
    sourceGuessEventId: string;
    message: string | null;
    activeChallengeKeys: string[];
    selectedChallengeKeys: string[];
    method: 'typo-relay' | 'dom-fallback' | 'mixed';
  };

  GUESS_SUBMITTED: { message: string | null; submittedAtServerTime: number | null };
  WRONG_GUESS: {
    playerId: number | null;
    message: string | null;
    wrongGuessCountThisRound: number | null;
  };
  CLOSE_GUESS: { word: string | null };
  CORRECT_GUESS: CorrectGuessPayload;
  FIRST_GUESS: CorrectGuessPayload;

  VOTE_SUBMITTED: Record<string, unknown>;
  VOTE_RECEIVED: Record<string, unknown>;
  LIKE_RECEIVED: Record<string, unknown>;
  DISLIKE_RECEIVED: Record<string, unknown>;

  DRAW_COMMAND_BATCH: DrawCommandBatchPayload;
  DRAW_COMMAND_BATCH_SUBMITTED: DrawCommandBatchPayload;
  CANVAS_CLEARED: Record<string, unknown>;
  CLEAR_CANVAS_SUBMITTED: Record<string, unknown>;
  STROKE_UNDONE: Record<string, unknown>;
  UNDO_SUBMITTED: Record<string, unknown>;

  RED_AVATAR_LOGIN_CONFIRMED: { avatar: number[]; skinColorId: 0 };

  PLAYER_REPORT_SUBMITTED: Record<string, unknown>;
  PLAYER_MUTE_SUBMITTED: Record<string, unknown>;
  PLAYER_VOTEKICK_SUBMITTED: Record<string, unknown>;
  PLAYER_VOTEKICK_UPDATED: Record<string, unknown>;
  HOST_KICK_SUBMITTED: Record<string, unknown>;
  HOST_BAN_SUBMITTED: Record<string, unknown>;

  /** Reserved DOM-adapter events used by future Skribbl Duels challenges. */
  CREDITS_LINK_CLICKED: { href: string; pathname: string; navigationId: string };
  CREDITS_OPENED: {
    pathname: string;
    readyState: 'complete';
    linkClickObserved: boolean;
    navigationId: string | null;
    linkClickedAt: number | null;
    loadElapsedMs: number | null;
  };
  AVATAR_RANDOMIZED: {
    previousAvatar: number[] | null;
    avatar: number[] | null;
    redSkin: boolean;
    /** A correlated randomize-button click is authoritative; heuristic is a strict fallback. */
    method: 'randomize-button' | 'heuristic';
    validRandomization: true;
    randomizeClickObserved: boolean;
    randomizeClickId: string | null;
    changedIndices: number[];
    absoluteDeltas: number[];
  };
  LOGO_AVATAR_CLICKED: { avatarIndex: number; clickCount: number; clickId: string };
  SPECIAL_AVATAR_FOUND: {
    avatarIndex: number;
    clickId: string;
    specialId: number | null;
    specialBackgroundPosition: string;
    stableForMs: number;
  };
  STROKE_STARTED: { strokeId: string; x: number; y: number };
  STROKE_ENDED: {
    strokeId: string;
    commandCount: number;
    validStrokeNumber: number;
    colorIds: number[];
    brushSizes: number[];
    durationMs: number;
  };
  CANVAS_METRICS: CanvasMetricsPayload;
}

export type TelemetryEventType = keyof TelemetryPayloadMap;

export const TELEMETRY_EVENT_CATEGORIES = {
  PROTOCOL_ANOMALY: 'system',

  LOBBY_HYDRATED: 'lobby',
  LOBBY_CHANGED: 'lobby',
  LOBBY_WAITING: 'round',
  LOBBY_JOIN_REQUESTED: 'lobby',
  LOBBY_OWNER_CHANGED: 'lobby',
  LOBBY_SETTING_CHANGED: 'lobby',
  LOBBY_SETTING_SUBMITTED: 'lobby',
  PRIVATE_LOBBY_CREATE_REQUESTED: 'lobby',
  PRIVATE_LOBBY_READY: 'lobby',
  LOGIN_SUBMITTED: 'lobby',

  PLAYER_JOINED: 'lobby',
  PLAYER_LEFT: 'lobby',
  PLAYER_UPDATED: 'lobby',
  PLAYER_RENAMED: 'lobby',
  SCORE_CHANGED: 'score',

  GAME_STATE_CHANGED: 'round',
  GAME_STARTING: 'round',
  ROUND_ANNOUNCED: 'round',
  WORD_SELECTION_STARTED: 'round',
  ROUND_STARTED: 'round',
  DRAWING_STARTED: 'drawing',
  SERVER_TIME_CHANGED: 'round',
  ROUND_ENDED: 'round',
  WORD_REVEALED: 'round',
  ROUND_RESULTS_AVAILABLE: 'score',
  GAME_ENDED: 'round',
  GAME_START_REQUESTED: 'round',
  GAME_END_REQUESTED: 'round',
  GAME_START_FAILED: 'round',
  WORD_SELECTED: 'round',
  HINT_REVEALED: 'round',

  TEXT_SUBMITTED: 'chat',
  CHAT_MESSAGE_RECEIVED: 'chat',
  SPAM_DETECTED: 'chat',
  TYPO_DROP_CLAIMED: 'system',
  TYPO_SKD_FILE_LOADED: 'system',
  TYPO_SKD_PASTED: 'drawing',
  TYPO_CHALLENGE_STATE_CHANGED: 'system',
  TYPO_CHALLENGE_GUESS_ATTEMPT: 'guessing',

  GUESS_SUBMITTED: 'guessing',
  WRONG_GUESS: 'guessing',
  CLOSE_GUESS: 'guessing',
  CORRECT_GUESS: 'guessing',
  FIRST_GUESS: 'guessing',

  VOTE_SUBMITTED: 'drawing',
  VOTE_RECEIVED: 'drawing',
  LIKE_RECEIVED: 'drawing',
  DISLIKE_RECEIVED: 'drawing',

  DRAW_COMMAND_BATCH: 'drawing',
  DRAW_COMMAND_BATCH_SUBMITTED: 'drawing',
  CANVAS_CLEARED: 'drawing',
  CLEAR_CANVAS_SUBMITTED: 'drawing',
  STROKE_UNDONE: 'drawing',
  UNDO_SUBMITTED: 'drawing',

  RED_AVATAR_LOGIN_CONFIRMED: 'home',

  PLAYER_REPORT_SUBMITTED: 'moderation',
  PLAYER_MUTE_SUBMITTED: 'moderation',
  PLAYER_VOTEKICK_SUBMITTED: 'moderation',
  PLAYER_VOTEKICK_UPDATED: 'moderation',
  HOST_KICK_SUBMITTED: 'moderation',
  HOST_BAN_SUBMITTED: 'moderation',

  CREDITS_LINK_CLICKED: 'home',
  CREDITS_OPENED: 'home',
  AVATAR_RANDOMIZED: 'home',
  LOGO_AVATAR_CLICKED: 'home',
  SPECIAL_AVATAR_FOUND: 'home',
  STROKE_STARTED: 'drawing',
  STROKE_ENDED: 'drawing',
  CANVAS_METRICS: 'drawing'
} as const satisfies Record<TelemetryEventType, import('./base').TelemetryCategory>;

export const LIVE_ONLY_TELEMETRY_EVENTS = [
  'DRAW_COMMAND_BATCH',
  'DRAW_COMMAND_BATCH_SUBMITTED'
] as const satisfies readonly TelemetryEventType[];

export type LiveOnlyTelemetryEventType = typeof LIVE_ONLY_TELEMETRY_EVENTS[number];
