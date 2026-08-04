import type { DecodedSocketRecord, DrawCommand } from '../protocol/types';
import type {
  CanonicalLobbyState,
  LobbyStateChange,
  LobbyUserState
} from '../state/lobbyState';
import type {
  TelemetryActor,
  TelemetryContext,
  TelemetryEvent,
  TelemetryEventType,
  TelemetrySource
} from '@skribbl-duels/telemetry-contracts';

export interface TelemetryDraft {
  type: TelemetryEventType;
  category: import('@skribbl-duels/telemetry-contracts').TelemetryCategory;
  actor?: TelemetryActor | null;
  payload?: unknown;
  confidence?: TelemetryEvent['confidence'];
  highVolume?: boolean;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function playerById(state: CanonicalLobbyState, playerId: number | null): LobbyUserState | null {
  if (playerId === null) return null;
  return state.users[String(playerId)] ?? null;
}

export function actorForPlayer(
  state: CanonicalLobbyState,
  playerId: number | null,
  fallbackName: string | null = null
): TelemetryActor | null {
  if (playerId === null && fallbackName === null) return null;
  const player = playerById(state, playerId);
  return {
    playerId,
    name: player?.name ?? fallbackName,
    isSelf: playerId !== null && playerId === state.meId
  };
}

export function createTelemetryContext(state: CanonicalLobbyState): TelemetryContext {
  const maxRounds = typeof state.settings[3] === 'number' ? state.settings[3] : null;
  return {
    lobbySessionId: state.lobbySessionId,
    lobbyGeneration: state.lobbyGeneration,
    lobbyId: state.lobbyId,
    lobbyType: state.lobbyType,
    languageId: state.languageId,
    languageName: state.languageName,

    gameSessionId: state.game.gameSessionId,
    roundSessionId: state.game.roundSessionId,

    roundIndex: state.serverRoundIndex,
    roundNumber: state.round,
    maxRounds,

    gameStateId: state.game.stateId,
    gameStateName: state.game.stateName,
    meId: state.meId,
    drawerId: state.game.drawerId
  };
}

export function sourceFromChange(change: LobbyStateChange): TelemetrySource {
  return {
    origin: 'lobby-change',
    rawRecordId: change.rawRecordId,
    changeId: change.changeId,
    direction: null,
    socketEvent: null,
    packetId: null
  };
}

export function sourceFromDecoded(record: DecodedSocketRecord): TelemetrySource {
  return {
    origin: 'decoded-packet',
    rawRecordId: record.rawRecordId,
    changeId: null,
    direction: record.decoded.direction,
    socketEvent: record.decoded.socketEvent,
    packetId: record.decoded.packetId
  };
}

function latestGuessForPlayer(state: CanonicalLobbyState, playerId: number): CanonicalLobbyState['game']['guessOrder'][number] | null {
  for (let index = state.game.guessOrder.length - 1; index >= 0; index -= 1) {
    const guess = state.game.guessOrder[index];
    if (guess?.playerId === playerId) return guess;
  }
  return null;
}

function gameStateDrafts(
  state: CanonicalLobbyState,
  payload: UnknownRecord
): TelemetryDraft[] {
  const previousStateId = numberValue(payload.previousStateId);
  const stateId = numberValue(payload.stateId);
  const stateName = stringValue(payload.stateName) ?? state.game.stateName;
  const changed = previousStateId !== stateId;
  const basePayload = {
    previousStateId,
    stateId,
    stateName,
    time: numberValue(payload.time),
    gameSessionId: state.game.gameSessionId,
    roundSessionId: state.game.roundSessionId,

    roundIndex: state.serverRoundIndex,
    roundNumber: state.round,
    maxRounds: typeof state.settings[3] === 'number' ? state.settings[3] : null
  };

  const drafts: TelemetryDraft[] = [{
    type: 'GAME_STATE_CHANGED',
    category: 'round',
    payload: basePayload,
    confidence: 'confirmed'
  }];

  if (!changed || stateId === null) return drafts;

  if (stateId === 0) {
    drafts.push({ type: 'LOBBY_WAITING', category: 'round', payload: basePayload });
  } else if (stateId === 1) {
    drafts.push({ type: 'GAME_STARTING', category: 'round', payload: basePayload });
  } else if (stateId === 2) {
    drafts.push({ type: 'ROUND_ANNOUNCED', category: 'round', payload: basePayload });
  } else if (stateId === 3) {
    drafts.push({
      type: 'WORD_SELECTION_STARTED',
      category: 'round',
      actor: actorForPlayer(state, state.game.drawerId),
      payload: {
        ...basePayload,
        availableWords: state.game.availableWords?.slice() ?? null
      }
    });
  } else if (stateId === 4) {
    const drawingPayload = {
      ...basePayload,
      drawerId: state.game.drawerId,
      word: state.game.word,
      wordLengths: state.game.wordLengths?.slice() ?? null,
      initialTime: state.game.serverTime,
      players: state.userOrder
        .map(playerId => state.users[String(playerId)])
        .filter((user): user is NonNullable<typeof user> => user !== undefined)
        .map(user => ({
          id: user.id,
          name: user.name,
          avatar: user.avatar.slice(),
          score: user.score,
          guessed: user.guessed,
          flags: user.flags
        }))
    };
    drafts.push({ type: 'ROUND_STARTED', category: 'round', payload: drawingPayload });
    drafts.push({
      type: 'DRAWING_STARTED',
      category: 'drawing',
      actor: actorForPlayer(state, state.game.drawerId),
      payload: drawingPayload
    });
  } else if (stateId === 5) {
    const result = state.game.roundResult;
    const resultPayload = {
      ...basePayload,
      reason: result?.reason ?? null,
      reasonName: result?.reasonName ?? null,
      word: result?.word ?? state.game.revealedWord,
      scores: result?.scores.map(score => ({ ...score })) ?? []
    };
    drafts.push({ type: 'ROUND_ENDED', category: 'round', payload: resultPayload });
    drafts.push({ type: 'WORD_REVEALED', category: 'round', payload: resultPayload });
    drafts.push({ type: 'ROUND_RESULTS_AVAILABLE', category: 'score', payload: resultPayload });
  } else if (stateId === 6) {
    const finalScores = state.userOrder
      .map(playerId => state.users[String(playerId)])
      .filter((user): user is NonNullable<typeof user> => user !== undefined)
      .map(user => ({
        playerId: user.id,
        totalScore: user.score,
        roundScore: user.lastRoundScore
      }));
    drafts.push({
      type: 'GAME_ENDED',
      category: 'round',
      payload: {
        ...basePayload,
        finalScores
      }
    });
  } else if (stateId === 7) {
    drafts.push({ type: 'PRIVATE_LOBBY_READY', category: 'lobby', payload: basePayload });
  }

  return drafts;
}

export function mapLobbyChangeToTelemetry(
  change: LobbyStateChange,
  state: CanonicalLobbyState
): TelemetryDraft[] {
  const payload = isRecord(change.payload) ? change.payload : {};

  switch (change.kind) {
    case 'LOBBY_HYDRATED':
      return [{
        type: 'LOBBY_HYDRATED',
        category: 'lobby',
        payload: {
          ...payload,
          lobbyGeneration: state.lobbyGeneration,
          languageId: state.languageId,
          languageName: state.languageName,
          meId: state.meId,
          ownerId: state.ownerId,
          gameSessionId: state.game.gameSessionId,
          roundSessionId: state.game.roundSessionId,
          roundIndex: state.serverRoundIndex,
          roundNumber: state.round,
          players: state.userOrder
            .map(playerId => state.users[String(playerId)])
            .filter((user): user is NonNullable<typeof user> => user !== undefined)
            .map(user => ({
              id: user.id,
              name: user.name,
              avatar: user.avatar.slice(),
              score: user.score,
              guessed: user.guessed,
              flags: user.flags
            }))
        },
        confidence: 'confirmed'
      }];

    case 'LOBBY_CHANGED':
      return [{ type: 'LOBBY_CHANGED', category: 'lobby', payload }];

    case 'PLAYER_ADDED': {
      const user = isRecord(payload.user) ? payload.user : null;
      const playerId = user ? numberValue(user.id) : null;
      return [{
        type: 'PLAYER_JOINED',
        category: 'lobby',
        actor: actorForPlayer(state, playerId, user ? stringValue(user.name) : null),
        payload: { user }
      }];
    }

    case 'PLAYER_REMOVED': {
      const playerId = numberValue(payload.playerId);
      const player = isRecord(payload.player) ? payload.player : null;
      return [{
        type: 'PLAYER_LEFT',
        category: 'lobby',
        actor: actorForPlayer(state, playerId, player ? stringValue(player.name) : null),
        payload
      }];
    }

    case 'PLAYER_UPDATED':
      return [{
        type: 'PLAYER_UPDATED',
        category: 'lobby',
        actor: actorForPlayer(state, numberValue(payload.playerId)),
        payload
      }];

    case 'PLAYER_RENAMED':
      return [{
        type: 'PLAYER_RENAMED',
        category: 'lobby',
        actor: actorForPlayer(state, numberValue(payload.playerId), stringValue(payload.name)),
        payload
      }];

    case 'PLAYER_SCORE_CHANGED': {
      const playerId = numberValue(payload.playerId);
      const previousScore = numberValue(payload.previousScore);
      const totalScore = numberValue(payload.totalScore);
      const roundScore = numberValue(payload.roundScore);
      return [{
        type: 'SCORE_CHANGED',
        category: 'score',
        actor: actorForPlayer(state, playerId),
        payload: {
          playerId,
          previousScore,
          totalScore,
          roundScore,
          delta: previousScore === null || totalScore === null ? null : totalScore - previousScore,
          coolNumber: totalScore !== null && totalScore > 0 && totalScore % 250 === 0
        }
      }];
    }

    case 'PLAYER_GUESSED': {
      const playerId = numberValue(payload.playerId);
      if (playerId === null) return [];
      const guess = latestGuessForPlayer(state, playerId);
      const user = playerById(state, playerId);
      const guessPayload = {
        playerId,
        position: numberValue(payload.position) ?? guess?.position ?? null,
        elapsedMs: numberValue(payload.elapsedMs) ?? guess?.elapsedMs ?? null,
        estimatedTimeAtGuess: guess?.estimatedTimeAtGuess ?? null,
        serverTimeAnchorAtGuess: guess?.serverTime ?? null,
        includesWord: booleanValue(payload.includesWord),
        word: stringValue(payload.word),
        wrongGuessesBeforeCorrect: user?.wrongGuessCount ?? 0,
        isFirstGuesser: (numberValue(payload.position) ?? guess?.position) === 1
      };
      const drafts: TelemetryDraft[] = [{
        type: 'CORRECT_GUESS',
        category: 'guessing',
        actor: actorForPlayer(state, playerId),
        payload: guessPayload
      }];
      if (guessPayload.isFirstGuesser) {
        drafts.push({
          type: 'FIRST_GUESS',
          category: 'guessing',
          actor: actorForPlayer(state, playerId),
          payload: guessPayload,
          confidence: 'derived'
        });
      }
      return drafts;
    }

    case 'GAME_STATE_CHANGED':
      return gameStateDrafts(state, payload);

    case 'TIME_CHANGED':
      return [{ type: 'SERVER_TIME_CHANGED', category: 'round', payload }];

    case 'SETTING_CHANGED':
      return [{ type: 'LOBBY_SETTING_CHANGED', category: 'lobby', payload }];

    case 'OWNER_CHANGED':
      return [{
        type: 'LOBBY_OWNER_CHANGED',
        category: 'lobby',
        actor: actorForPlayer(state, numberValue(payload.ownerId)),
        payload
      }];

    case 'VOTE_RECEIVED': {
      const playerId = numberValue(payload.playerId);
      const vote = numberValue(payload.vote);
      const base: TelemetryDraft = {
        type: 'VOTE_RECEIVED',
        category: 'drawing',
        actor: actorForPlayer(state, playerId),
        payload
      };
      if (vote === 1) return [base, { ...base, type: 'LIKE_RECEIVED', confidence: 'derived' }];
      if (vote === 0) return [base, { ...base, type: 'DISLIKE_RECEIVED', confidence: 'derived' }];
      return [base];
    }

    case 'HINT_REVEALED':
      return [{ type: 'HINT_REVEALED', category: 'round', payload }];

    case 'CANVAS_CLEARED':
      return [{
        type: 'CANVAS_CLEARED',
        category: 'drawing',
        actor: actorForPlayer(state, state.game.drawerId),
        payload
      }];

    case 'UNDO_RECEIVED':
      return [{
        type: 'STROKE_UNDONE',
        category: 'drawing',
        actor: actorForPlayer(state, state.game.drawerId),
        payload
      }];

    case 'TEXT_RECEIVED': {
      const playerId = numberValue(payload.playerId);
      const drafts: TelemetryDraft[] = [{
        type: 'CHAT_MESSAGE_RECEIVED',
        category: 'chat',
        actor: actorForPlayer(state, playerId),
        payload: {
          playerId,
          message: stringValue(payload.message),
          countedAsWrongGuess: booleanValue(payload.countedAsWrongGuess)
        }
      }];
      if (booleanValue(payload.countedAsWrongGuess)) {
        drafts.push({
          type: 'WRONG_GUESS',
          category: 'guessing',
          actor: actorForPlayer(state, playerId),
          payload: {
            playerId,
            message: stringValue(payload.message),
            wrongGuessCountThisRound: playerById(state, playerId)?.wrongGuessCount ?? null
          },
          confidence: 'derived'
        });
      }
      return drafts;
    }

    case 'LOGIN_SUBMITTED': {
      const avatar = arrayValue<number>(payload.avatar);
      const create = numberValue(payload.create);
      const drafts: TelemetryDraft[] = [{
        type: 'LOGIN_SUBMITTED',
        category: 'lobby',
        actor: {
          playerId: state.meId,
          name: stringValue(payload.name),
          isSelf: true
        },
        payload
      }];
      if (create === 1) {
        drafts.push({
          type: 'PRIVATE_LOBBY_CREATE_REQUESTED',
          category: 'lobby',
          actor: drafts[0]?.actor ?? null,
          payload,
          confidence: 'derived'
        });
      } else {
        drafts.push({
          type: 'LOBBY_JOIN_REQUESTED',
          category: 'lobby',
          actor: drafts[0]?.actor ?? null,
          payload,
          confidence: 'derived'
        });
      }
      if (avatar[0] === 0) {
        drafts.push({
          type: 'RED_AVATAR_LOGIN_CONFIRMED',
          category: 'home',
          actor: drafts[0]?.actor ?? null,
          payload: { avatar: avatar.slice(), skinColorId: 0 },
          confidence: 'confirmed'
        });
      }
      return drafts;
    }

    case 'WORD_SELECTED':
      return [{
        type: 'WORD_SELECTED',
        category: 'round',
        actor: actorForPlayer(state, state.meId),
        payload
      }];

    default:
      return [];
  }
}

function drawSummary(commands: DrawCommand[]): unknown {
  return {
    commandCount: commands.length,
    tools: Array.from(new Set(commands.map(command => command.tool))),
    colors: Array.from(new Set(commands.flatMap(command =>
      'color' in command && typeof command.color === 'number' ? [command.color] : []
    ))),
    brushSizes: Array.from(new Set(commands.flatMap(command =>
      command.kind === 'PENCIL' ? [command.brushSize] : []
    ))),
    commands
  };
}

export function mapDecodedRecordToTelemetry(
  record: DecodedSocketRecord,
  state: CanonicalLobbyState
): TelemetryDraft[] {
  const payload = isRecord(record.decoded.payload) ? record.decoded.payload : {};
  const kind = record.decoded.kind;

  if (!record.decoded.known || record.decoded.issues.length > 0) {
    return [{
      type: 'PROTOCOL_ANOMALY',
      category: 'system',
      payload: {
        kind,
        known: record.decoded.known,
        issues: record.decoded.issues.slice(),
        packetId: record.decoded.packetId
      },
      confidence: 'provisional'
    }];
  }

  switch (kind) {
    case 'DRAW_COMMANDS_RECEIVED': {
      const commands = arrayValue<DrawCommand>(payload.commands);
      return [{
        type: 'DRAW_COMMAND_BATCH',
        category: 'drawing',
        actor: actorForPlayer(state, state.game.drawerId),
        payload: drawSummary(commands),
        highVolume: true
      }];
    }

    case 'DRAW_COMMANDS_SUBMITTED': {
      const commands = arrayValue<DrawCommand>(payload.commands);
      return [{
        type: 'DRAW_COMMAND_BATCH_SUBMITTED',
        category: 'drawing',
        actor: actorForPlayer(state, state.meId),
        payload: drawSummary(commands),
        highVolume: true
      }];
    }

    case 'CLOSE_WORD':
      return [{
        type: 'CLOSE_GUESS',
        category: 'guessing',
        actor: actorForPlayer(state, state.meId),
        payload: { word: stringValue(payload.word) }
      }];

    case 'TEXT_SUBMITTED': {
      const message = stringValue(payload.message);
      const self = playerById(state, state.meId);
      const eligibleGuess = state.game.stateId === 4 &&
        state.meId !== state.game.drawerId &&
        self?.guessed !== true;
      const drafts: TelemetryDraft[] = [{
        type: 'TEXT_SUBMITTED',
        category: 'chat',
        actor: actorForPlayer(state, state.meId),
        payload: { message, eligibleGuess }
      }];
      if (eligibleGuess) {
        drafts.push({
          type: 'GUESS_SUBMITTED',
          category: 'guessing',
          actor: actorForPlayer(state, state.meId),
          payload: {
            message,
            submittedAtServerTime: state.game.serverTime
          },
          confidence: 'derived'
        });
      }
      return drafts;
    }

    case 'VOTE_SUBMITTED':
      return [{
        type: 'VOTE_SUBMITTED',
        category: 'drawing',
        actor: actorForPlayer(state, state.meId),
        payload
      }];

    case 'CLEAR_CANVAS_SUBMITTED':
      return [{
        type: 'CLEAR_CANVAS_SUBMITTED',
        category: 'drawing',
        actor: actorForPlayer(state, state.meId),
        payload
      }];

    case 'UNDO_SUBMITTED':
      return [{
        type: 'UNDO_SUBMITTED',
        category: 'drawing',
        actor: actorForPlayer(state, state.meId),
        payload
      }];

    case 'PLAYER_REPORT_SUBMITTED':
      return [{ type: 'PLAYER_REPORT_SUBMITTED', category: 'moderation', actor: actorForPlayer(state, state.meId), payload }];

    case 'PLAYER_MUTE_SUBMITTED':
      return [{ type: 'PLAYER_MUTE_SUBMITTED', category: 'moderation', actor: actorForPlayer(state, state.meId), payload }];

    case 'PLAYER_VOTEKICK_SUBMITTED':
      return [{ type: 'PLAYER_VOTEKICK_SUBMITTED', category: 'moderation', actor: actorForPlayer(state, state.meId), payload }];

    case 'HOST_KICK_SUBMITTED':
      return [{ type: 'HOST_KICK_SUBMITTED', category: 'moderation', actor: actorForPlayer(state, state.meId), payload }];

    case 'HOST_BAN_SUBMITTED':
      return [{ type: 'HOST_BAN_SUBMITTED', category: 'moderation', actor: actorForPlayer(state, state.meId), payload }];

    case 'ROOM_SETTING_SUBMITTED':
      return [{ type: 'LOBBY_SETTING_SUBMITTED', category: 'lobby', actor: actorForPlayer(state, state.meId), payload }];

    case 'GAME_START_SUBMITTED':
      return [{ type: 'GAME_START_REQUESTED', category: 'round', actor: actorForPlayer(state, state.meId), payload }];

    case 'GAME_END_SUBMITTED':
      return [{ type: 'GAME_END_REQUESTED', category: 'round', actor: actorForPlayer(state, state.meId), payload }];

    case 'GAME_START_ERROR':
      return [{ type: 'GAME_START_FAILED', category: 'round', payload }];

    case 'SPAM_DETECTED':
      return [{ type: 'SPAM_DETECTED', category: 'chat', actor: actorForPlayer(state, state.meId), payload }];

    case 'PLAYER_VOTEKICK_UPDATE':
      return [{ type: 'PLAYER_VOTEKICK_UPDATED', category: 'moderation', payload }];

    default:
      return [];
  }
}
