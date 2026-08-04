import {
  DRAW_RESULT_NAMES,
  GAME_STATE_NAMES,
  LANGUAGE_NAMES
} from './enums';
import {
  arrayField,
  booleanField,
  isNumber,
  isRecord,
  isString,
  numberArray,
  numberField,
  stringArray,
  stringField
} from './guards';
import type {
  DecodedGameState,
  DrawCommand,
  HintEntry,
  LobbyDataPayload,
  ScoreEntry,
  SkribblUser
} from './types';

export function parseUser(value: unknown, issues: string[]): SkribblUser | null {
  if (!isRecord(value)) {
    issues.push('User is not an object.');
    return null;
  }

  const id = numberField(value, 'id');
  const name = stringField(value, 'name');
  const avatar = numberArray(value.avatar);
  const score = numberField(value, 'score');
  const guessed = booleanField(value, 'guessed');
  const flags = numberField(value, 'flags');

  if (id === null || name === null || avatar === null || score === null || guessed === null || flags === null) {
    issues.push('User object has missing or invalid fields.');
    return null;
  }

  return { id, name, avatar, score, guessed, flags };
}

export function parseUsers(value: unknown, issues: string[]): SkribblUser[] {
  if (!Array.isArray(value)) {
    issues.push('Users is not an array.');
    return [];
  }

  const users: SkribblUser[] = [];
  value.forEach((entry, index) => {
    const localIssues: string[] = [];
    const user = parseUser(entry, localIssues);
    if (user) users.push(user);
    for (const issue of localIssues) issues.push(`users[${index}]: ${issue}`);
  });
  return users;
}

export function parseHints(value: unknown, issues: string[]): HintEntry[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    issues.push('Hints is not an array.');
    return [];
  }

  const hints: HintEntry[] = [];
  value.forEach((entry, index) => {
    if (!Array.isArray(entry) || entry.length < 2 || !isNumber(entry[0]) || (!isString(entry[1]) && !isNumber(entry[1]))) {
      issues.push(`hints[${index}] has an invalid shape.`);
      return;
    }
    hints.push({ position: entry[0], letter: entry[1] });
  });
  return hints;
}

export function parseDrawCommand(value: unknown, issues: string[], path: string): DrawCommand | null {
  if (!Array.isArray(value)) {
    issues.push(`${path} is not an array.`);
    return null;
  }

  const tool = isNumber(value[0]) ? value[0] : null;
  const color = isNumber(value[1]) ? value[1] : null;

  if (tool === 0 && color !== null) {
    const [brushSize, startX, startY, endX, endY] = value.slice(2, 7);
    if ([brushSize, startX, startY, endX, endY].every(isNumber)) {
      return {
        kind: 'PENCIL',
        tool: 0,
        color,
        brushSize,
        startX,
        startY,
        endX,
        endY,
        raw: value
      };
    }
  }

  if (tool === 1 && color !== null) {
    const [startX, startY] = value.slice(2, 4);
    if (isNumber(startX) && isNumber(startY)) {
      return {
        kind: 'FILL',
        tool: 1,
        color,
        startX,
        startY,
        raw: value
      };
    }
  }

  issues.push(`${path} is an unknown or malformed draw command.`);
  return {
    kind: 'UNKNOWN_DRAW_COMMAND',
    tool,
    raw: value
  };
}

export function parseDrawCommands(value: unknown, issues: string[]): DrawCommand[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    issues.push('Draw commands is not an array.');
    return [];
  }

  const result: DrawCommand[] = [];
  value.forEach((entry, index) => {
    const command = parseDrawCommand(entry, issues, `drawCommands[${index}]`);
    if (command) result.push(command);
  });
  return result;
}

export function parseScoreTriples(value: unknown, issues: string[]): {
  scores: ScoreEntry[];
  rawScores: number[];
} {
  const rawScores = numberArray(value);
  if (rawScores === null) {
    issues.push('Round result scores is not a numeric array.');
    return { scores: [], rawScores: [] };
  }

  if (rawScores.length % 3 !== 0) {
    issues.push(`Round result score array length ${rawScores.length} is not divisible by 3.`);
  }

  const scores: ScoreEntry[] = [];
  for (let index = 0; index + 2 < rawScores.length; index += 3) {
    scores.push({
      playerId: rawScores[index] ?? 0,
      totalScore: rawScores[index + 1] ?? 0,
      roundScore: rawScores[index + 2] ?? 0
    });
  }

  return { scores, rawScores };
}

export function parseGameState(value: unknown, issues: string[]): DecodedGameState | null {
  if (!isRecord(value)) {
    issues.push('Game state is not an object.');
    return null;
  }

  const stateId = numberField(value, 'id');
  const time = numberField(value, 'time');
  const rawData = value.data;

  if (stateId === null || time === null) {
    issues.push('Game state is missing numeric id or time.');
    return null;
  }

  if (stateId === 0 || stateId === 1 || stateId === 2 || stateId === 7) {
    const round = isNumber(rawData) ? rawData : null;
    if (round === null) issues.push(`Game state ${stateId} has a non-numeric round value.`);

    if (stateId === 0) return { stateId, stateName: 'WAITING_FOR_PLAYERS', time, round, rawData };
    if (stateId === 1) return { stateId, stateName: 'GAME_STARTING', time, round, rawData };
    if (stateId === 2) return { stateId, stateName: 'ROUND_ANNOUNCEMENT', time, round, rawData };
    return { stateId, stateName: 'PRIVATE_LOBBY_SETUP', time, round, rawData };
  }

  if (stateId === 3) {
    if (!isRecord(rawData)) {
      issues.push('Word-selection state data is not an object.');
      return {
        stateId,
        stateName: 'WORD_SELECTION',
        time,
        drawerId: null,
        availableWords: null,
        rawData
      };
    }

    return {
      stateId,
      stateName: 'WORD_SELECTION',
      time,
      drawerId: numberField(rawData, 'id'),
      availableWords: stringArray(rawData.words),
      rawData
    };
  }

  if (stateId === 4) {
    if (!isRecord(rawData)) {
      issues.push('Drawing state data is not an object.');
      return {
        stateId,
        stateName: 'DRAWING',
        time,
        drawerId: null,
        word: null,
        hints: [],
        drawCommands: [],
        rawData
      };
    }

    const rawWord = rawData.word ?? rawData.words;
    const word = isString(rawWord)
      ? rawWord
      : numberArray(rawWord);

    if (word === null) issues.push('Drawing state word is neither a string nor a numeric length array.');

    return {
      stateId,
      stateName: 'DRAWING',
      time,
      drawerId: numberField(rawData, 'id'),
      word,
      hints: parseHints(rawData.hints, issues),
      drawCommands: parseDrawCommands(rawData.drawCommands, issues),
      rawData
    };
  }

  if (stateId === 5) {
    if (!isRecord(rawData)) {
      issues.push('Round-results state data is not an object.');
      return {
        stateId,
        stateName: 'ROUND_RESULTS',
        time,
        reason: null,
        reasonName: null,
        word: null,
        scores: [],
        rawScores: [],
        rawData
      };
    }

    const reason = numberField(rawData, 'reason');
    const parsedScores = parseScoreTriples(rawData.scores, issues);

    return {
      stateId,
      stateName: 'ROUND_RESULTS',
      time,
      reason,
      reasonName: reason === null ? null : DRAW_RESULT_NAMES[reason] ?? `UNKNOWN_${reason}`,
      word: stringField(rawData, 'word'),
      scores: parsedScores.scores,
      rawScores: parsedScores.rawScores,
      rawData
    };
  }

  if (stateId === 6) {
    return { stateId, stateName: 'GAME_RESULTS', time, rawData };
  }

  return {
    stateId,
    stateName: 'UNKNOWN_GAME_STATE',
    time,
    rawData
  };
}

export function parseLobbyData(value: unknown, issues: string[]): LobbyDataPayload | null {
  if (!isRecord(value)) {
    issues.push('Lobby data is not an object.');
    return null;
  }

  const settings = numberArray(value.settings);
  const lobbyId = stringField(value, 'id');
  const lobbyType = numberField(value, 'type');
  const meId = numberField(value, 'me');
  const ownerId = numberField(value, 'owner');
  const round = numberField(value, 'round');

  if (settings === null || lobbyId === null || lobbyType === null || meId === null || ownerId === null || round === null) {
    issues.push('Lobby data has missing or invalid header fields.');
    return null;
  }

  const languageId = settings[0] ?? null;

  return {
    settings,
    languageId,
    languageName: languageId === null ? null : LANGUAGE_NAMES[languageId] ?? `Unknown:${languageId}`,
    lobbyId,
    lobbyType,
    meId,
    ownerId,
    users: parseUsers(value.users, issues),
    round,
    state: parseGameState(value.state, issues)
  };
}

export function parsePacketEnvelope(packetData: unknown, issues: string[]): { id: number; data: unknown } | null {
  if (!isRecord(packetData)) {
    issues.push('Packet data is not an object.');
    return null;
  }

  const id = numberField(packetData, 'id');
  if (id === null) {
    issues.push('Packet data has no numeric id.');
    return null;
  }

  return { id, data: packetData.data };
}

export function gameStateSummary(state: DecodedGameState | null): string {
  if (!state) return 'INVALID_GAME_STATE';
  return GAME_STATE_NAMES[state.stateId] ?? state.stateName;
}
