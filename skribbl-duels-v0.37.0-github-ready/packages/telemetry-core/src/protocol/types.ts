import type { RelayDirection } from '../bridge/relayTypes';
import type { RawSocketRecord } from '../recorder/rawRecord';

export interface SkribblUser {
  id: number;
  name: string;
  avatar: number[];
  score: number;
  guessed: boolean;
  flags: number;
}

export interface ScoreEntry {
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

export type DrawCommand = PencilDrawCommand | FillDrawCommand | UnknownDrawCommand;

export interface WaitingGameState {
  stateId: 0;
  stateName: 'WAITING_FOR_PLAYERS';
  time: number;
  round: number | null;
  rawData: unknown;
}

export interface StartingGameState {
  stateId: 1;
  stateName: 'GAME_STARTING';
  time: number;
  round: number | null;
  rawData: unknown;
}

export interface RoundAnnouncementGameState {
  stateId: 2;
  stateName: 'ROUND_ANNOUNCEMENT';
  time: number;
  round: number | null;
  rawData: unknown;
}

export interface WordSelectionGameState {
  stateId: 3;
  stateName: 'WORD_SELECTION';
  time: number;
  drawerId: number | null;
  availableWords: string[] | null;
  rawData: unknown;
}

export interface DrawingGameState {
  stateId: 4;
  stateName: 'DRAWING';
  time: number;
  drawerId: number | null;
  word: string | number[] | null;
  hints: HintEntry[];
  drawCommands: DrawCommand[];
  rawData: unknown;
}

export interface RoundResultsGameState {
  stateId: 5;
  stateName: 'ROUND_RESULTS';
  time: number;
  reason: number | null;
  reasonName: string | null;
  word: string | null;
  scores: ScoreEntry[];
  rawScores: number[];
  rawData: unknown;
}

export interface GameResultsGameState {
  stateId: 6;
  stateName: 'GAME_RESULTS';
  time: number;
  rawData: unknown;
}

export interface PrivateLobbyGameState {
  stateId: 7;
  stateName: 'PRIVATE_LOBBY_SETUP';
  time: number;
  round: number | null;
  rawData: unknown;
}

export interface UnknownGameState {
  stateId: number;
  stateName: 'UNKNOWN_GAME_STATE';
  time: number;
  rawData: unknown;
}

export type DecodedGameState =
  | WaitingGameState
  | StartingGameState
  | RoundAnnouncementGameState
  | WordSelectionGameState
  | DrawingGameState
  | RoundResultsGameState
  | GameResultsGameState
  | PrivateLobbyGameState
  | UnknownGameState;

export interface LobbyDataPayload {
  settings: number[];
  languageId: number | null;
  languageName: string | null;
  lobbyId: string;
  lobbyType: number;
  meId: number;
  ownerId: number;
  users: SkribblUser[];
  round: number;
  state: DecodedGameState | null;
}

export interface DecodedPacket<K extends string = string, P = unknown> {
  known: boolean;
  kind: K;
  direction: RelayDirection;
  socketEvent: string | null;
  packetId: number | null;
  payload: P;
  issues: string[];
  rawData: unknown;
}

export interface DecodedSocketRecord {
  rawRecordId: string;
  sessionId: string;
  sequence: number;
  occurredAt: number;
  monotonicMs: number;
  decoded: DecodedPacket;
}

export interface ProtocolStats {
  total: number;
  known: number;
  unknown: number;
  withIssues: number;
  byKind: Record<string, number>;
  lastRecord: DecodedSocketRecord | null;
}

export type DecodeFunction = (record: RawSocketRecord) => DecodedPacket;
