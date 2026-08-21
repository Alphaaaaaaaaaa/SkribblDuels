import type { CanonicalLobbyState, LobbyUserState } from './lobbyState';

export function selectUser(
  state: CanonicalLobbyState,
  playerId: number | null
): LobbyUserState | null {
  if (playerId === null) return null;
  return state.users[String(playerId)] ?? null;
}

export function selectSelf(state: CanonicalLobbyState): LobbyUserState | null {
  return selectUser(state, state.meId);
}

export function selectDrawer(state: CanonicalLobbyState): LobbyUserState | null {
  return selectUser(state, state.game.drawerId);
}

export function selectPlayers(state: CanonicalLobbyState): LobbyUserState[] {
  return state.userOrder
    .map(playerId => selectUser(state, playerId))
    .filter((player): player is LobbyUserState => player !== null);
}

export function selectEstimatedServerTime(
  state: CanonicalLobbyState,
  monotonicMs = performance.now()
): number | null {
  const { serverTime, serverTimeAnchorMonotonicMs } = state.game;
  if (serverTime === null || serverTimeAnchorMonotonicMs === null) return null;
  const elapsedSeconds = Math.max(0, monotonicMs - serverTimeAnchorMonotonicMs) / 1000;
  return Math.max(0, serverTime - elapsedSeconds);
}

export function selectRoundIndex(state: CanonicalLobbyState): number | null {
  return state.serverRoundIndex;
}

export function selectRoundNumber(state: CanonicalLobbyState): number | null {
  return state.round;
}

export function selectMaxRounds(state: CanonicalLobbyState): number | null {
  const value = state.settings[3];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
