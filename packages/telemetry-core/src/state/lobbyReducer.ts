import { createId } from '../core/ids';
import { LANGUAGE_NAMES } from '../protocol/enums';
import type {
  DecodedGameState,
  DecodedSocketRecord,
  LobbyDataPayload,
  ScoreEntry,
  SkribblUser
} from '../protocol/types';
import {
  createEmptyGameState,
  type CanonicalGameState,
  type CanonicalLobbyState,
  type LobbyStateChange,
  type LobbyUserState
} from './lobbyState';

interface ReduceResult {
  state: CanonicalLobbyState;
  changes: LobbyStateChange[];
  drawOnly: boolean;
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

function arrayValue<T>(value: unknown): T[] | null {
  return Array.isArray(value) ? value as T[] : null;
}

function payloadRecord(record: DecodedSocketRecord): UnknownRecord {
  return isRecord(record.decoded.payload) ? record.decoded.payload : {};
}

function makeChange(
  record: DecodedSocketRecord,
  kind: LobbyStateChange['kind'],
  payload: unknown
): LobbyStateChange {
  return {
    changeId: createId(),
    kind,
    occurredAt: record.occurredAt,
    monotonicMs: record.monotonicMs,
    rawRecordId: record.rawRecordId,
    sequence: record.sequence,
    payload
  };
}

function userKey(playerId: number): string {
  return String(playerId);
}

function toUserState(user: SkribblUser, occurredAt: number): LobbyUserState {
  return {
    ...user,
    avatar: user.avatar.slice(),
    joinedAt: occurredAt,
    updatedAt: occurredAt,
    lastRoundScore: 0,
    vote: null,
    wrongGuessCount: 0
  };
}

function cloneUsers(users: CanonicalLobbyState['users']): CanonicalLobbyState['users'] {
  return { ...users };
}

function resetUserRoundState(
  users: CanonicalLobbyState['users'],
  occurredAt: number
): CanonicalLobbyState['users'] {
  const next = cloneUsers(users);
  for (const [key, user] of Object.entries(next)) {
    next[key] = {
      ...user,
      guessed: false,
      wrongGuessCount: 0,
      lastRoundScore: 0,
      vote: null,
      updatedAt: occurredAt
    };
  }
  return next;
}

function resetRoundState(game: CanonicalGameState): CanonicalGameState {
  return {
    ...game,
    availableWords: null,
    word: null,
    wordLengths: null,
    hints: [],
    guessOrder: [],
    firstGuesserId: null,
    guessOrderHydrated: true,
    drawCommandCount: 0,
    drawPacketCount: 0,
    clearCount: 0,
    undoCount: 0,
    canvasRevision: game.canvasRevision + 1,
    lastTimeChange: null,
    lastCloseWord: null,
    lastMessage: null,
    lastOutgoingText: null,
    pendingSelfText: null,
    revealedWord: null,
    roundResult: null
  };
}

function applyScoreEntries(
  users: CanonicalLobbyState['users'],
  scores: readonly ScoreEntry[],
  occurredAt: number
): CanonicalLobbyState['users'] {
  if (scores.length === 0) return users;

  const next = cloneUsers(users);
  for (const score of scores) {
    const key = userKey(score.playerId);
    const previous = next[key];
    if (!previous) continue;
    next[key] = {
      ...previous,
      score: score.totalScore,
      lastRoundScore: score.roundScore,
      updatedAt: occurredAt
    };
  }
  return next;
}

function estimateServerTime(game: CanonicalGameState, monotonicMs: number): number | null {
  if (game.serverTime === null || game.serverTimeAnchorMonotonicMs === null) return null;
  const elapsedSeconds = Math.max(0, monotonicMs - game.serverTimeAnchorMonotonicMs) / 1000;
  return Math.max(0, game.serverTime - elapsedSeconds);
}

function applyDecodedGameState(
  state: CanonicalLobbyState,
  decodedState: DecodedGameState,
  record: DecodedSocketRecord,
  fromHydration: boolean
): CanonicalLobbyState {
  let game = state.game;

  if (decodedState.stateId === 1 || decodedState.stateId === 2 || decodedState.stateId === 3) {
    game = resetRoundState(game);
  }

  const previousStateId = game.stateId;
  const previousDrawerId = game.drawerId;
  const stateChanged = previousStateId !== decodedState.stateId;

  let gameSessionId = game.gameSessionId;
  let roundSessionId = game.roundSessionId;

  // A public lobby can restart immediately after the results screen without
  // exposing state 1 to every connected client. Treat leaving the terminal
  // results state for any active/pre-round state as a new game boundary as
  // well. Otherwise every automatic restart in the same lobby keeps the old
  // gameSessionId and downstream consumers deduplicate all later GAME_ENDED
  // events as the first game.
  const restartedAfterGameResults = stateChanged &&
    previousStateId === 6 &&
    decodedState.stateId >= 1 &&
    decodedState.stateId <= 5;

  if ((stateChanged && decodedState.stateId === 1) || restartedAfterGameResults) {
    gameSessionId = createId();
    roundSessionId = null;
  }

  if (gameSessionId === null && decodedState.stateId >= 2 && decodedState.stateId <= 6) {
    gameSessionId = createId();
  }

  // `roundSessionId` identifies one concrete drawing turn, not the visible
  // server round counter. A visible round such as 3/3 contains multiple turns
  // (one per drawer), so every new word-selection/drawing turn needs a fresh ID.
  if (stateChanged && decodedState.stateId === 2) {
    roundSessionId = null;
  }

  const decodedDrawerId =
    decodedState.stateName === 'WORD_SELECTION' || decodedState.stateName === 'DRAWING'
      ? decodedState.drawerId
      : null;
  const drawerChangedInsideTurnState =
    (decodedState.stateId === 3 || decodedState.stateId === 4) &&
    decodedDrawerId !== null &&
    previousDrawerId !== null &&
    decodedDrawerId !== previousDrawerId;
  const enteredWordSelection = stateChanged && decodedState.stateId === 3;
  const enteredDrawingWithoutSelection =
    stateChanged && decodedState.stateId === 4 && previousStateId !== 3;

  if (enteredWordSelection || enteredDrawingWithoutSelection || drawerChangedInsideTurnState) {
    roundSessionId = createId();
  }

  // Hydration and protocol fallbacks may begin directly in states 3–5.
  if (roundSessionId === null && decodedState.stateId >= 3 && decodedState.stateId <= 5) {
    roundSessionId = createId();
  }

  game = {
    ...game,
    gameSessionId,
    roundSessionId,
    stateId: decodedState.stateId,
    stateName: decodedState.stateName,
    serverTime: decodedState.time,
    serverTimeAnchorMonotonicMs: record.monotonicMs,
    stateEnteredAt: stateChanged ? record.occurredAt : game.stateEnteredAt,
    stateEnteredAtMonotonicMs: stateChanged ? record.monotonicMs : game.stateEnteredAtMonotonicMs,
    lastDecodedState: decodedState
  };

  let serverRoundIndex = state.serverRoundIndex;
  let round = state.round;
  let users = state.users;

  if (decodedState.stateId === 1 || decodedState.stateId === 2 || decodedState.stateId === 3) {
    users = resetUserRoundState(users, record.occurredAt);
  }

  if ('round' in decodedState && decodedState.round !== null) {
    serverRoundIndex = decodedState.round;
    round = decodedState.round + 1;
  }

  if (decodedState.stateName === 'WORD_SELECTION') {
    game = {
      ...game,
      drawerId: decodedState.drawerId,
      availableWords: decodedState.availableWords?.slice() ?? null
    };
  }

  if (decodedState.stateName === 'DRAWING') {
    const enteringDrawing = state.game.stateId !== 4;
    const word = typeof decodedState.word === 'string' ? decodedState.word : null;
    const wordLengths = Array.isArray(decodedState.word) ? decodedState.word.slice() : null;

    game = {
      ...game,
      drawerId: decodedState.drawerId,
      drawingStartedAt: enteringDrawing ? record.occurredAt : game.drawingStartedAt,
      drawingStartedAtMonotonicMs: enteringDrawing ? record.monotonicMs : game.drawingStartedAtMonotonicMs,
      word,
      wordLengths,
      hints: decodedState.hints.map(hint => ({ ...hint })),
      drawCommandCount: decodedState.drawCommands.length,
      drawPacketCount: decodedState.drawCommands.length > 0 ? 1 : 0,
      guessOrder: enteringDrawing ? [] : game.guessOrder,
      firstGuesserId: enteringDrawing ? null : game.firstGuesserId,
      guessOrderHydrated: !fromHydration
    };
  }

  if (decodedState.stateName === 'ROUND_RESULTS') {
    users = applyScoreEntries(users, decodedState.scores, record.occurredAt);
    game = {
      ...game,
      revealedWord: decodedState.word,
      word: decodedState.word ?? game.word,
      roundResult: {
        reason: decodedState.reason,
        reasonName: decodedState.reasonName,
        word: decodedState.word,
        scores: decodedState.scores.map(score => ({ ...score })),
        occurredAt: record.occurredAt
      }
    };
  }

  if (decodedState.stateId === 0 || decodedState.stateId === 7) {
    game = {
      ...game,
      roundSessionId: null,
      drawerId: null,
      drawingStartedAt: null,
      drawingStartedAtMonotonicMs: null
    };
  }

  return {
    ...state,
    serverRoundIndex,
    round,
    users,
    game
  };
}

function hydrateLobby(
  current: CanonicalLobbyState,
  lobby: LobbyDataPayload,
  record: DecodedSocketRecord
): CanonicalLobbyState {
  const lobbyChanged = current.lobbyId !== null && current.lobbyId !== lobby.lobbyId;
  const users: CanonicalLobbyState['users'] = {};
  const userOrder: number[] = [];

  for (const user of lobby.users) {
    users[userKey(user.id)] = toUserState(user, record.occurredAt);
    userOrder.push(user.id);
  }

  let next: CanonicalLobbyState = {
    ...current,
    hydrated: true,
    lobbySessionId: lobbyChanged || current.lobbySessionId === null ? createId() : current.lobbySessionId,
    lobbyGeneration: lobbyChanged || current.lobbyId === null
      ? current.lobbyGeneration + 1
      : current.lobbyGeneration,
    lobbyId: lobby.lobbyId,
    lobbyType: lobby.lobbyType,
    meId: lobby.meId,
    ownerId: lobby.ownerId,
    settings: lobby.settings.slice(),
    languageId: lobby.languageId,
    languageName: lobby.languageName,
    serverRoundIndex: lobby.round,
    round: lobby.round + 1,
    users,
    userOrder,
    game: createEmptyGameState()
  };

  if (lobby.state) {
    next = applyDecodedGameState(next, lobby.state, record, true);
  }

  return next;
}

function setRecordMetadata(state: CanonicalLobbyState, record: DecodedSocketRecord): CanonicalLobbyState {
  return {
    ...state,
    lastRecordId: record.rawRecordId,
    lastSequence: record.sequence,
    lastUpdatedAt: record.occurredAt,
    lastUpdatedAtMonotonicMs: record.monotonicMs
  };
}

export function reduceLobbyState(
  current: CanonicalLobbyState,
  record: DecodedSocketRecord
): ReduceResult {
  const kind = record.decoded.kind;
  const payload = payloadRecord(record);
  const changes: LobbyStateChange[] = [];
  let next = current;
  let drawOnly = false;

  switch (kind) {
    case 'LOBBY_DATA': {
      const lobby = isRecord(payload.lobby) ? payload.lobby as unknown as LobbyDataPayload : null;
      if (!lobby) break;
      const previousLobbyId = current.lobbyId;
      next = hydrateLobby(current, lobby, record);
      changes.push(makeChange(record, 'LOBBY_HYDRATED', {
        lobbyId: lobby.lobbyId,
        playerCount: lobby.users.length,
        stateName: lobby.state?.stateName ?? null
      }));
      if (previousLobbyId !== null && previousLobbyId !== lobby.lobbyId) {
        changes.push(makeChange(record, 'LOBBY_CHANGED', {
          previousLobbyId,
          lobbyId: lobby.lobbyId
        }));
      }
      break;
    }

    case 'PLAYER_ADD': {
      const user = isRecord(payload.user) ? payload.user as unknown as SkribblUser : null;
      if (!user) break;
      const users = cloneUsers(current.users);
      users[userKey(user.id)] = toUserState(user, record.occurredAt);
      const userOrder = current.userOrder.includes(user.id)
        ? current.userOrder.slice()
        : [...current.userOrder, user.id];
      next = { ...current, users, userOrder };
      changes.push(makeChange(record, 'PLAYER_ADDED', { user }));
      break;
    }

    case 'PLAYER_REMOVE': {
      const playerId = numberValue(payload.playerId);
      if (playerId === null) break;
      const users = cloneUsers(current.users);
      const removed = users[userKey(playerId)] ?? null;
      delete users[userKey(playerId)];
      const wasDrawer = current.game.drawerId === playerId;
      next = {
        ...current,
        users,
        userOrder: current.userOrder.filter(id => id !== playerId),
        game: wasDrawer
          ? { ...current.game, drawerId: null }
          : current.game
      };
      changes.push(makeChange(record, 'PLAYER_REMOVED', {
        playerId,
        player: removed,
        reason: payload.reason ?? null,
        reasonName: payload.reasonName ?? null,
        wasDrawer
      }));
      break;
    }

    case 'PLAYER_AVATAR_UPDATED': {
      const playerId = numberValue(payload.playerId);
      const avatar = arrayValue<number>(payload.avatar);
      if (playerId === null || !avatar) break;
      const previous = current.users[userKey(playerId)];
      if (!previous) break;
      const users = cloneUsers(current.users);
      users[userKey(playerId)] = {
        ...previous,
        avatar: avatar.slice(),
        updatedAt: record.occurredAt
      };
      next = { ...current, users };
      changes.push(makeChange(record, 'PLAYER_UPDATED', { playerId, field: 'avatar', avatar }));
      break;
    }

    case 'PLAYER_NAME_UPDATED': {
      const playerId = numberValue(payload.playerId);
      const name = stringValue(payload.name);
      if (playerId === null || name === null) break;
      const previous = current.users[userKey(playerId)];
      if (!previous) break;
      const users = cloneUsers(current.users);
      users[userKey(playerId)] = { ...previous, name, updatedAt: record.occurredAt };
      next = { ...current, users };
      changes.push(makeChange(record, 'PLAYER_RENAMED', {
        playerId,
        previousName: previous.name,
        name
      }));
      break;
    }

    case 'VOTE_RECEIVED': {
      const playerId = numberValue(payload.playerId);
      const vote = numberValue(payload.vote);
      if (playerId === null || vote === null) break;
      const previous = current.users[userKey(playerId)];
      if (previous) {
        const users = cloneUsers(current.users);
        users[userKey(playerId)] = { ...previous, vote, updatedAt: record.occurredAt };
        next = { ...current, users };
      }
      changes.push(makeChange(record, 'VOTE_RECEIVED', {
        playerId,
        vote,
        voteName: payload.voteName ?? null
      }));
      break;
    }

    case 'GAME_STATE_UPDATE': {
      const decodedState = isRecord(payload.state) ? payload.state as unknown as DecodedGameState : null;
      if (!decodedState) break;
      const previousStateId = current.game.stateId;
      next = applyDecodedGameState(current, decodedState, record, false);
      if (decodedState.stateName === 'ROUND_RESULTS') {
        for (const score of decodedState.scores) {
          const previousScore = current.users[userKey(score.playerId)]?.score ?? null;
          if (previousScore !== score.totalScore) {
            changes.push(makeChange(record, 'PLAYER_SCORE_CHANGED', {
              playerId: score.playerId,
              previousScore,
              totalScore: score.totalScore,
              roundScore: score.roundScore
            }));
          }
        }
      }
      changes.push(makeChange(record, 'GAME_STATE_CHANGED', {
        previousStateId,
        stateId: decodedState.stateId,
        stateName: decodedState.stateName,
        time: decodedState.time
      }));
      break;
    }

    case 'ROOM_SETTING_UPDATED': {
      const settingId = numberValue(payload.settingId);
      const value = numberValue(payload.value);
      if (settingId === null || value === null) break;
      const settings = current.settings.slice();
      settings[settingId] = value;
      next = {
        ...current,
        settings,
        languageId: settingId === 0 ? value : current.languageId,
        languageName: settingId === 0 ? (LANGUAGE_NAMES[value] ?? `Unknown:${value}`) : current.languageName
      };
      changes.push(makeChange(record, 'SETTING_CHANGED', {
        settingId,
        settingName: payload.settingName ?? null,
        value
      }));
      break;
    }

    case 'HINT_REVEALED': {
      const hints = arrayValue<{ position: number; letter: string | number }>(payload.hints) ?? [];
      const merged = new Map(current.game.hints.map(hint => [hint.position, { ...hint }]));
      for (const hint of hints) merged.set(hint.position, { ...hint });
      next = { ...current, game: { ...current.game, hints: Array.from(merged.values()) } };
      changes.push(makeChange(record, 'HINT_REVEALED', { hints }));
      break;
    }

    case 'TIME_UPDATED': {
      const time = numberValue(payload.time);
      if (time === null) break;
      const previousAnchorTime = current.game.serverTime;
      const estimatedPreviousTime = estimateServerTime(current.game, record.monotonicMs);
      next = {
        ...current,
        game: {
          ...current.game,
          serverTime: time,
          serverTimeAnchorMonotonicMs: record.monotonicMs,
          lastTimeChange: {
            previousAnchorTime,
            estimatedPreviousTime,
            newTime: time,
            occurredAt: record.occurredAt,
            monotonicMs: record.monotonicMs
          }
        }
      };
      changes.push(makeChange(record, 'TIME_CHANGED', {
        previousAnchorTime,
        estimatedPreviousTime,
        newTime: time
      }));
      break;
    }

    case 'PLAYER_GUESSED': {
      const playerId = numberValue(payload.playerId);
      if (playerId === null) break;
      const includesWord = payload.includesWord === true;
      const word = stringValue(payload.word);
      const alreadyRecorded = current.game.guessOrder.some(guess => guess.playerId === playerId);
      const guessOrder = alreadyRecorded
        ? current.game.guessOrder.slice()
        : [
            ...current.game.guessOrder,
            {
              playerId,
              position: current.game.guessOrder.length + 1,
              occurredAt: record.occurredAt,
              monotonicMs: record.monotonicMs,
              elapsedMs: current.game.drawingStartedAtMonotonicMs === null
                ? null
                : Math.max(0, Math.round(record.monotonicMs - current.game.drawingStartedAtMonotonicMs)),
              serverTime: current.game.serverTime,
              estimatedTimeAtGuess:
                current.game.lastTimeChange !== null &&
                record.monotonicMs - current.game.lastTimeChange.monotonicMs <= 250
                  ? current.game.lastTimeChange.estimatedPreviousTime
                  : estimateServerTime(current.game, record.monotonicMs),
              includesWord
            }
          ];
      const users = cloneUsers(current.users);
      const previous = users[userKey(playerId)];
      if (previous) {
        users[userKey(playerId)] = {
          ...previous,
          guessed: true,
          updatedAt: record.occurredAt
        };
      }
      next = {
        ...current,
        users,
        game: {
          ...current.game,
          guessOrder,
          firstGuesserId: guessOrder[0]?.playerId ?? null,
          word: word ?? current.game.word,
          pendingSelfText: playerId === current.meId ? null : current.game.pendingSelfText
        }
      };
      if (!alreadyRecorded) {
        changes.push(makeChange(record, 'PLAYER_GUESSED', {
          playerId,
          position: guessOrder.length,
          elapsedMs: guessOrder.at(-1)?.elapsedMs ?? null,
          includesWord,
          word
        }));
      }
      break;
    }

    case 'CLOSE_WORD': {
      next = {
        ...current,
        game: {
          ...current.game,
          lastCloseWord: stringValue(payload.word),
          pendingSelfText: null
        }
      };
      break;
    }

    case 'OWNER_UPDATED': {
      const ownerId = numberValue(payload.ownerId);
      if (ownerId === null) break;
      next = { ...current, ownerId };
      changes.push(makeChange(record, 'OWNER_CHANGED', { ownerId }));
      break;
    }

    case 'DRAW_COMMANDS_RECEIVED': {
      const commands = arrayValue<unknown>(payload.commands) ?? [];
      next = {
        ...current,
        game: {
          ...current.game,
          drawCommandCount: current.game.drawCommandCount + commands.length,
          drawPacketCount: current.game.drawPacketCount + 1,
          canvasRevision: current.game.canvasRevision + 1
        }
      };
      drawOnly = true;
      break;
    }

    case 'CANVAS_CLEARED': {
      next = {
        ...current,
        game: {
          ...current.game,
          clearCount: current.game.clearCount + 1,
          drawCommandCount: 0,
          canvasRevision: current.game.canvasRevision + 1
        }
      };
      changes.push(makeChange(record, 'CANVAS_CLEARED', {}));
      break;
    }

    case 'UNDO_RECEIVED': {
      next = {
        ...current,
        game: {
          ...current.game,
          undoCount: current.game.undoCount + 1,
          canvasRevision: current.game.canvasRevision + 1
        }
      };
      changes.push(makeChange(record, 'UNDO_RECEIVED', {
        commandIndex: payload.commandIndex ?? null
      }));
      break;
    }

    case 'TEXT_RECEIVED': {
      const playerId = numberValue(payload.playerId);
      const message = stringValue(payload.message);
      if (playerId === null || message === null) break;
      const users = cloneUsers(current.users);
      const previous = users[userKey(playerId)];
      const eligibleWrongGuess = current.game.stateId === 4 &&
        playerId !== current.game.drawerId &&
        previous?.guessed === false;
      if (previous && eligibleWrongGuess) {
        users[userKey(playerId)] = {
          ...previous,
          wrongGuessCount: previous.wrongGuessCount + 1,
          updatedAt: record.occurredAt
        };
      }
      next = {
        ...current,
        users,
        game: {
          ...current.game,
          lastMessage: {
            playerId,
            message,
            occurredAt: record.occurredAt,
            monotonicMs: record.monotonicMs
          },
          pendingSelfText: playerId === current.meId ? null : current.game.pendingSelfText
        }
      };
      changes.push(makeChange(record, 'TEXT_RECEIVED', {
        playerId,
        message,
        countedAsWrongGuess: eligibleWrongGuess
      }));
      break;
    }

    case 'LOGIN_SUBMITTED': {
      changes.push(makeChange(record, 'LOGIN_SUBMITTED', {
        join: payload.join ?? null,
        create: payload.create ?? null,
        name: payload.name ?? null,
        language: payload.language ?? null,
        avatar: payload.avatar ?? null
      }));
      break;
    }

    case 'WORD_SELECTED': {
      changes.push(makeChange(record, 'WORD_SELECTED', { selection: payload.selection ?? null }));
      break;
    }

    case 'TEXT_SUBMITTED': {
      const message = stringValue(payload.message);
      if (message !== null) {
        next = {
          ...current,
          game: {
            ...current.game,
            lastOutgoingText: message,
            pendingSelfText: current.game.stateId === 4 ? message : null
          }
        };
      }
      break;
    }

    default:
      break;
  }

  next = setRecordMetadata(next, record);
  return { state: next, changes, drawOnly };
}
