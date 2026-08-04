import {
  LEAVE_REASON_NAMES,
  PACKET_IDS,
  SETTING_NAMES,
  START_ERROR_NAMES,
  VOTE_NAMES
} from './enums';
import { isNumber, isRecord, isString, numberField, stringField } from './guards';
import {
  parseDrawCommands,
  parseGameState,
  parseHints,
  parseLobbyData,
  parsePacketEnvelope,
  parseUser
} from './parsers';
import type { DecodedPacket } from './types';
import type { RawSocketRecord } from '../recorder/rawRecord';

function packet(record: RawSocketRecord, kind: string, payload: unknown, issues: string[]): DecodedPacket {
  return {
    known: true,
    kind,
    direction: record.direction,
    socketEvent: record.socketEvent,
    packetId: record.packetId,
    payload,
    issues,
    rawData: record.packetData
  };
}

function unknown(record: RawSocketRecord, issues: string[], reason: string): DecodedPacket {
  issues.push(reason);
  return {
    known: false,
    kind: 'UNKNOWN_SERVER_PACKET',
    direction: record.direction,
    socketEvent: record.socketEvent,
    packetId: record.packetId,
    payload: { reason },
    issues,
    rawData: record.packetData
  };
}

export function decodeIncoming(record: RawSocketRecord): DecodedPacket {
  const issues: string[] = [];
  const envelope = parsePacketEnvelope(record.packetData, issues);
  if (!envelope) return unknown(record, issues, 'Could not parse server packet envelope.');

  const { id, data } = envelope;

  switch (id) {
    case PACKET_IDS.PLAYER_ADD: {
      const user = parseUser(data, issues);
      return packet(record, 'PLAYER_ADD', { user }, issues);
    }

    case PACKET_IDS.PLAYER_REMOVE: {
      if (!isRecord(data)) return packet(record, 'PLAYER_REMOVE', { playerId: null, reason: null, reasonName: null }, [...issues, 'Player-remove data is not an object.']);
      const playerId = numberField(data, 'id');
      const reason = numberField(data, 'reason');
      return packet(record, 'PLAYER_REMOVE', {
        playerId,
        reason,
        reasonName: reason === null ? null : LEAVE_REASON_NAMES[reason] ?? `UNKNOWN_${reason}`
      }, issues);
    }

    case PACKET_IDS.PLAYER_VOTEKICK:
      return packet(record, 'PLAYER_VOTEKICK_UPDATE', { data }, issues);

    case PACKET_IDS.VOTE: {
      if (!isRecord(data)) return packet(record, 'VOTE_RECEIVED', { playerId: null, vote: null, voteName: null }, [...issues, 'Vote data is not an object.']);
      const playerId = numberField(data, 'id');
      const vote = numberField(data, 'vote');
      return packet(record, 'VOTE_RECEIVED', {
        playerId,
        vote,
        voteName: vote === null ? null : VOTE_NAMES[vote] ?? `UNKNOWN_${vote}`
      }, issues);
    }

    case PACKET_IDS.UPDATE_AVATAR: {
      if (!isRecord(data)) return packet(record, 'PLAYER_AVATAR_UPDATED', { playerId: null, avatar: null }, [...issues, 'Avatar update data is not an object.']);
      const avatar = Array.isArray(data.avatar) && data.avatar.every(isNumber) ? data.avatar : null;
      if (avatar === null) issues.push('Avatar update has invalid avatar data.');
      return packet(record, 'PLAYER_AVATAR_UPDATED', {
        playerId: numberField(data, 'id'),
        avatar
      }, issues);
    }

    case PACKET_IDS.LOBBY_DATA:
      return packet(record, 'LOBBY_DATA', { lobby: parseLobbyData(data, issues) }, issues);

    case PACKET_IDS.UPDATE_GAME_STATE:
      return packet(record, 'GAME_STATE_UPDATE', { state: parseGameState(data, issues) }, issues);

    case PACKET_IDS.UPDATE_ROOM_SETTINGS: {
      if (!isRecord(data)) return packet(record, 'ROOM_SETTING_UPDATED', { settingId: null, settingName: null, value: null }, [...issues, 'Room setting data is not an object.']);
      const settingId = numberField(data, 'id');
      const value = data.val ?? null;
      return packet(record, 'ROOM_SETTING_UPDATED', {
        settingId,
        settingName: settingId === null ? null : SETTING_NAMES[settingId] ?? `UNKNOWN_${settingId}`,
        value
      }, issues);
    }

    case PACKET_IDS.REVEAL_HINT:
      return packet(record, 'HINT_REVEALED', { hints: parseHints(data, issues) }, issues);

    case PACKET_IDS.UPDATE_TIME:
      return packet(record, 'TIME_UPDATED', { time: isNumber(data) ? data : null }, isNumber(data) ? issues : [...issues, 'Time update is not numeric.']);

    case PACKET_IDS.PLAYER_GUESSED: {
      if (!isRecord(data)) return packet(record, 'PLAYER_GUESSED', { playerId: null, word: null, includesWord: false }, [...issues, 'Player-guessed data is not an object.']);
      const word = stringField(data, 'word');
      return packet(record, 'PLAYER_GUESSED', {
        playerId: numberField(data, 'id'),
        word,
        includesWord: word !== null
      }, issues);
    }

    case PACKET_IDS.CLOSE_WORD:
      return packet(record, 'CLOSE_WORD', { word: isString(data) ? data : null }, isString(data) ? issues : [...issues, 'Close word is not a string.']);

    case PACKET_IDS.SET_OWNER:
      return packet(record, 'OWNER_UPDATED', { ownerId: isNumber(data) ? data : null }, isNumber(data) ? issues : [...issues, 'Owner id is not numeric.']);

    case PACKET_IDS.DRAW:
      return packet(record, 'DRAW_COMMANDS_RECEIVED', { commands: parseDrawCommands(data, issues) }, issues);

    case PACKET_IDS.CLEAR_CANVAS:
      return packet(record, 'CANVAS_CLEARED', {}, issues);

    case PACKET_IDS.UNDO:
      return packet(record, 'UNDO_RECEIVED', { commandIndex: isNumber(data) ? data : null }, isNumber(data) ? issues : [...issues, 'Undo command index is not numeric.']);

    case PACKET_IDS.TEXT: {
      if (!isRecord(data)) return packet(record, 'TEXT_RECEIVED', { playerId: null, message: null }, [...issues, 'Text data is not an object.']);
      return packet(record, 'TEXT_RECEIVED', {
        playerId: numberField(data, 'id'),
        message: stringField(data, 'msg')
      }, issues);
    }

    case PACKET_IDS.GAME_START_ERROR: {
      if (!isRecord(data)) return packet(record, 'GAME_START_ERROR', { errorId: null, errorName: null, restartSeconds: null }, [...issues, 'Game-start error data is not an object.']);
      const errorId = numberField(data, 'id');
      return packet(record, 'GAME_START_ERROR', {
        errorId,
        errorName: errorId === null ? null : START_ERROR_NAMES[errorId] ?? `UNKNOWN_${errorId}`,
        restartSeconds: numberField(data, 'data')
      }, issues);
    }

    case PACKET_IDS.SPAM_DETECTED:
      return packet(record, 'SPAM_DETECTED', {}, issues);

    case PACKET_IDS.UPDATE_NAME: {
      if (!isRecord(data)) return packet(record, 'PLAYER_NAME_UPDATED', { playerId: null, name: null }, [...issues, 'Name update data is not an object.']);
      return packet(record, 'PLAYER_NAME_UPDATED', {
        playerId: numberField(data, 'id'),
        name: stringField(data, 'name')
      }, issues);
    }

    default:
      return unknown(record, issues, `Unknown server packet id ${id}.`);
  }
}
