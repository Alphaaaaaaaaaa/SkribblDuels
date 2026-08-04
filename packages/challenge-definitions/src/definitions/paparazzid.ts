import type { ChallengeDefinition } from '@skribbl-duels/challenge-engine';
import type { SkribblUserSnapshot } from '@skribbl-duels/telemetry-contracts';
import { isPositiveInteger, localization } from '../shared';

export interface PaparazzidParameters {
  amount: number;
}

export interface PaparazzidState {
  qualifyingEvents: number;
  selfName: string | null;
  selfNameSourceEventId: string | null;
  matchedMessage: string | null;
  matchedPlayerId: number | null;
}

function normalizeMentionText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function containsMention(message: string, selfName: string): boolean {
  const normalizedName = normalizeMentionText(selfName);
  if (normalizedName.length === 0) return false;
  const normalizedMessage = ` ${normalizeMentionText(message)} `;
  return normalizedMessage.includes(` ${normalizedName} `);
}

function findSelfName(players: readonly SkribblUserSnapshot[] | undefined, meId: number | null): string | null {
  if (!players || meId === null) return null;
  return players.find(player => player.id === meId)?.name ?? null;
}

export const paparazzidDefinition: ChallengeDefinition<PaparazzidState, PaparazzidParameters> = {
  id: 'paparazzid',
  version: 1,
  metadata: {
    category: 'chat',
    localization: localization(
      "Paparazzi'd",
      'Be mentioned by another player in public chat.',
      "Paparazzi'd",
      'Werde von einem anderen Spieler im öffentlichen Chat erwähnt.'
    ),
    icon: 'paparazzid-mention',
    rankedEligible: true,
    difficulty: 1
  },
  defaultParameters: {
    amount: 1
  },
  target: parameters => parameters.amount,
  createInitialState: () => ({
    qualifyingEvents: 0,
    selfName: null,
    selfNameSourceEventId: null,
    matchedMessage: null,
    matchedPlayerId: null
  }),
  validateParameters(value): value is PaparazzidParameters {
    if (typeof value !== 'object' || value === null) return false;
    return isPositiveInteger((value as Partial<PaparazzidParameters>).amount);
  },
  relevantEvents: ['LOBBY_HYDRATED', 'PLAYER_RENAMED', 'CHAT_MESSAGE_RECEIVED'],
  allowedLobbyTypes: [0],
  resetOn: ['lobby-change'],
  reduce({ event, runtime, parameters }) {
    if (event.type === 'LOBBY_HYDRATED') {
      const selfName = findSelfName(event.payload.players, event.payload.meId ?? event.context.meId);
      if (selfName === null) return null;
      return {
        internalState: {
          ...runtime.internalState,
          selfName,
          selfNameSourceEventId: event.eventId
        },
        reason: 'paparazzid-self-name-hydrated'
      };
    }

    if (event.type === 'PLAYER_RENAMED' && event.actor?.isSelf) {
      const name = typeof event.payload.name === 'string' ? event.payload.name : event.actor.name;
      if (!name) return null;
      return {
        internalState: {
          ...runtime.internalState,
          selfName: name,
          selfNameSourceEventId: event.eventId
        },
        reason: 'paparazzid-self-name-updated'
      };
    }

    if (event.type !== 'CHAT_MESSAGE_RECEIVED') return null;
    if (event.actor?.isSelf || event.payload.message === null) return null;
    if (runtime.internalState.selfName === null) return null;
    if (!containsMention(event.payload.message, runtime.internalState.selfName)) return null;

    const qualifyingEvents = runtime.internalState.qualifyingEvents + 1;
    const evidenceEventIds = runtime.internalState.selfNameSourceEventId === null
      ? [event.eventId]
      : [runtime.internalState.selfNameSourceEventId, event.eventId];

    return {
      internalState: {
        ...runtime.internalState,
        qualifyingEvents,
        matchedMessage: event.payload.message,
        matchedPlayerId: event.payload.playerId ?? event.actor?.playerId ?? null
      },
      progress: qualifyingEvents,
      complete: qualifyingEvents >= parameters.amount,
      reason: 'self-name-mentioned-by-other-player',
      evidenceEventIds
    };
  }
};
