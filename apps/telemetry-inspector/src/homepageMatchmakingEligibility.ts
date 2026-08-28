import type { TelemetryEvent } from '@skribbl-duels/telemetry-contracts';
import { LEAVE_REASON_NAMES } from '@skribbl-duels/telemetry-core';

const SAFE_HOME_EVENT_TYPES = new Set<TelemetryEvent['type']>([
  'AVATAR_RANDOMIZED',
  'LOGO_AVATAR_CLICKED',
  'SPECIAL_AVATAR_FOUND'
]);

const SAFE_LEAVE_REASONS = new Set(Object.values(LEAVE_REASON_NAMES));

const LOBBY_ENTRY_EVENT_TYPES = new Set<TelemetryEvent['type']>([
  'LOBBY_JOIN_REQUESTED',
  'PRIVATE_LOBBY_CREATE_REQUESTED',
  'LOGIN_SUBMITTED'
]);

export type HomepageMatchmakingAuthority = 'home' | 'lobby' | 'unknown';

export interface HomepageAuthorityLobbySnapshot {
  hydrated: boolean;
  lobbySessionId: string | null;
  lobbyId: string | null;
  playerCount: number;
  gameStateName: string;
}

export function createHomepageMatchmakingAuthority(
  startedOnVisibleHomepage: boolean,
  lobby: HomepageAuthorityLobbySnapshot
): HomepageMatchmakingAuthority {
  const lobbyIsEmpty = !lobby.hydrated
    && lobby.lobbySessionId === null
    && lobby.lobbyId === null
    && lobby.playerCount === 0
    && (lobby.gameStateName === 'DISCONNECTED' || lobby.gameStateName === 'HOME');
  if (startedOnVisibleHomepage && lobbyIsEmpty) return 'home';
  return lobby.lobbySessionId !== null || lobby.lobbyId !== null || lobby.playerCount > 0
    ? 'lobby'
    : 'unknown';
}

function confirmsHomepage(event: TelemetryEvent): boolean {
  if (event.type === 'TYPO_LOBBY_LEFT') return true;
  if (SAFE_HOME_EVENT_TYPES.has(event.type)) return true;
  if (event.type !== 'PLAYER_LEFT' || event.actor?.isSelf !== true) return false;
  return typeof event.payload.reasonName === 'string'
    && SAFE_LEAVE_REASONS.has(event.payload.reasonName);
}

/**
 * Reduces the current-runtime authority instead of blindly inspecting the
 * newest event. Neutral bootstrap noise must not invalidate a clean homepage
 * reload, while lobby context or an outgoing join request fails closed.
 */
export function reduceHomepageMatchmakingAuthority(
  current: HomepageMatchmakingAuthority,
  event: TelemetryEvent
): HomepageMatchmakingAuthority {
  if (confirmsHomepage(event)) return 'home';
  if (LOBBY_ENTRY_EVENT_TYPES.has(event.type)
      || event.context.lobbySessionId !== null
      || event.context.lobbyId !== null) return 'lobby';
  return current;
}

/**
 * DOM visibility can be forged from DevTools. The latest accepted Telemetry
 * event therefore also has to describe either an untouched homepage, a benign
 * homepage interaction, or the local player's confirmed lobby departure.
 */
export function isHomepageTelemetryEligible(
  authority: HomepageMatchmakingAuthority
): boolean {
  return authority === 'home';
}
