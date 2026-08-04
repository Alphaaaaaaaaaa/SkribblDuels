export interface SkribblUserSnapshot {
  id: number;
  name: string;
  avatar: number[];
  score: number;
  guessed: boolean;
  flags: number;
}

export interface RoundScoreEntry {
  playerId: number;
  totalScore: number;
  roundScore: number;
}

export interface HintEntry {
  position: number;
  letter: string | number;
}

export interface PencilDrawCommand {
  kind: 'PENCIL';
  tool: 0;
  color: number;
  brushSize: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  raw: unknown[];
}

export interface FillDrawCommand {
  kind: 'FILL';
  tool: 1;
  color: number;
  startX: number;
  startY: number;
  raw: unknown[];
}

export interface UnknownDrawCommand {
  kind: 'UNKNOWN_DRAW_COMMAND';
  tool: number | null;
  raw: unknown[];
}

export type NormalizedDrawCommand =
  | PencilDrawCommand
  | FillDrawCommand
  | UnknownDrawCommand;

export interface DrawCommandBatchPayload {
  commandCount: number;
  tools: number[];
  colors: number[];
  brushSizes: number[];
  commands: NormalizedDrawCommand[];
}

export interface GameStateLifecyclePayload {
  previousStateId: number | null;
  stateId: number | null;
  stateName: string;
  time: number | null;
  roundIndex: number | null;
  roundNumber: number | null;
  maxRounds: number | null;
}

export interface RoundStartedPayload extends GameStateLifecyclePayload {
  drawerId: number | null;
  word: string | null;
  wordLengths: number[] | null;
  initialTime: number | null;
  /** Player snapshot at the beginning of this drawing turn. */
  players?: SkribblUserSnapshot[];
}

export interface RoundResultPayload extends GameStateLifecyclePayload {
  reason: number | null;
  reasonName: string | null;
  word: string | null;
  scores: RoundScoreEntry[];
}

export interface CorrectGuessPayload {
  playerId: number;
  position: number | null;
  elapsedMs: number | null;
  estimatedTimeAtGuess: number | null;
  serverTimeAnchorAtGuess: number | null;
  includesWord: boolean;
  word: string | null;
  wrongGuessesBeforeCorrect: number;
  isFirstGuesser: boolean;
}

export interface ScoreChangedPayload {
  playerId: number | null;
  previousScore: number | null;
  totalScore: number | null;
  roundScore: number | null;
  delta: number | null;
  coolNumber: boolean;
}

export interface CanvasMetricsPayload {
  width: number;
  height: number;
  totalPixels: number;
  whitePixels: number;
  nonWhitePixels: number;
  whiteRatio: number;
  validStrokeCount: number;
  trigger: string;
  /** Continuous duration for time-based white-canvas metrics. */
  whiteDurationMs?: number;
  /** Telemetry event that caused this snapshot, for example CORRECT_GUESS. */
  triggerEventId?: string;
  /** Player associated with the triggering event, when applicable. */
  sampledPlayerId?: number | null;
}
