import { PACKET_IDS, SETTING_NAMES, VOTE_NAMES } from './enums';
import { isNumber, isRecord, isString, numberField, stringField } from './guards';
import { parseDrawCommands, parsePacketEnvelope } from './parsers';
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
    kind: 'UNKNOWN_CLIENT_PACKET',
    direction: record.direction,
    socketEvent: record.socketEvent,
    packetId: record.packetId,
    payload: { reason },
    issues,
    rawData: record.packetData
  };
}

export function decodeOutgoing(record: RawSocketRecord): DecodedPacket {
  const issues: string[] = [];

  if (record.socketEvent === 'login') {
    if (!isRecord(record.packetData)) return unknown(record, issues, 'Login payload is not an object.');
    const avatar = Array.isArray(record.packetData.avatar) && record.packetData.avatar.every(isNumber)
      ? record.packetData.avatar
      : null;
    if (avatar === null) issues.push('Login avatar is invalid.');

    return packet(record, 'LOGIN_SUBMITTED', {
      join: record.packetData.join ?? null,
      create: numberField(record.packetData, 'create'),
      name: stringField(record.packetData, 'name'),
      language: record.packetData.lang ?? null,
      avatar
    }, issues);
  }

  if (record.socketEvent !== 'data') {
    return unknown(record, issues, `Unknown client socket event ${String(record.socketEvent)}.`);
  }

  const envelope = parsePacketEnvelope(record.packetData, issues);
  if (!envelope) return unknown(record, issues, 'Could not parse client packet envelope.');
  const { id, data } = envelope;

  switch (id) {
    case PACKET_IDS.HOST_KICK:
      return packet(record, 'HOST_KICK_SUBMITTED', { playerId: isNumber(data) ? data : null }, isNumber(data) ? issues : [...issues, 'Kick target is not numeric.']);

    case PACKET_IDS.HOST_BAN:
      return packet(record, 'HOST_BAN_SUBMITTED', { playerId: isNumber(data) ? data : null }, isNumber(data) ? issues : [...issues, 'Ban target is not numeric.']);

    case PACKET_IDS.PLAYER_VOTEKICK:
      return packet(record, 'PLAYER_VOTEKICK_SUBMITTED', { playerId: isNumber(data) ? data : null }, isNumber(data) ? issues : [...issues, 'Votekick target is not numeric.']);

    case PACKET_IDS.PLAYER_REPORT: {
      if (!isRecord(data)) return packet(record, 'PLAYER_REPORT_SUBMITTED', { playerId: null, reasons: null }, [...issues, 'Report data is not an object.']);
      return packet(record, 'PLAYER_REPORT_SUBMITTED', {
        playerId: numberField(data, 'id'),
        reasons: numberField(data, 'reasons')
      }, issues);
    }

    case PACKET_IDS.PLAYER_MUTE:
      return packet(record, 'PLAYER_MUTE_SUBMITTED', { playerId: isNumber(data) ? data : null }, isNumber(data) ? issues : [...issues, 'Mute target is not numeric.']);

    case PACKET_IDS.VOTE:
      return packet(record, 'VOTE_SUBMITTED', {
        vote: isNumber(data) ? data : null,
        voteName: isNumber(data) ? VOTE_NAMES[data] ?? `UNKNOWN_${data}` : null
      }, isNumber(data) ? issues : [...issues, 'Vote value is not numeric.']);

    case PACKET_IDS.UPDATE_ROOM_SETTINGS: {
      if (!isRecord(data)) return packet(record, 'ROOM_SETTING_SUBMITTED', { settingId: null, settingName: null, value: null }, [...issues, 'Room setting data is not an object.']);
      const rawId = data.id;
      const settingId = isNumber(rawId) ? rawId : isString(rawId) && /^\d+$/.test(rawId) ? Number(rawId) : null;
      return packet(record, 'ROOM_SETTING_SUBMITTED', {
        settingId,
        settingName: settingId === null ? null : SETTING_NAMES[settingId] ?? `UNKNOWN_${settingId}`,
        value: data.val ?? null
      }, issues);
    }

    case PACKET_IDS.SELECT_WORD:
      return packet(record, 'WORD_SELECTED', { selection: data }, issues);

    case PACKET_IDS.DRAW:
      return packet(record, 'DRAW_COMMANDS_SUBMITTED', { commands: parseDrawCommands(data, issues) }, issues);

    case PACKET_IDS.CLEAR_CANVAS:
      return packet(record, 'CLEAR_CANVAS_SUBMITTED', {}, issues);

    case PACKET_IDS.UNDO:
      return packet(record, 'UNDO_SUBMITTED', { commandIndex: isNumber(data) ? data : null }, isNumber(data) ? issues : [...issues, 'Undo command index is not numeric.']);

    case PACKET_IDS.START_GAME:
      return packet(record, 'GAME_START_SUBMITTED', { customWords: isString(data) ? data : null }, isString(data) ? issues : [...issues, 'Custom words is not a string.']);

    case PACKET_IDS.END_GAME:
      return packet(record, 'GAME_END_SUBMITTED', {}, issues);

    case PACKET_IDS.TEXT:
      return packet(record, 'TEXT_SUBMITTED', { message: isString(data) ? data : null }, isString(data) ? issues : [...issues, 'Submitted text is not a string.']);

    default:
      return unknown(record, issues, `Unknown client packet id ${id}.`);
  }
}
