import type { GatewaySocialLobbyPresence } from '@skribbl-duels/gateway-contracts';

export interface SocialLobbySnapshot {
  hydrated: boolean;
  active?: boolean;
  lobbyId: string | null;
  lobbyType: number | null;
  languageName: string | null;
  playerCount: number;
  maxPlayers: number | null;
}

/** Normalize partial/public-lobby settings into a valid Social presence report. */
export function socialPresenceReport(snapshot: SocialLobbySnapshot): {
  page: 'home' | 'lobby'; lobby: GatewaySocialLobbyPresence | null;
} {
  const active = snapshot.active ?? snapshot.hydrated;
  if (!active) return { page: 'home', lobby: null };
  const playerCount = Math.max(0, Math.min(32, Math.trunc(snapshot.playerCount) || 0));
  const configured = snapshot.maxPlayers !== null && Number.isFinite(snapshot.maxPlayers) && snapshot.maxPlayers > 0
    ? Math.trunc(snapshot.maxPlayers) : 8;
  return { page: 'lobby', lobby: {
    lobbyId: snapshot.lobbyId || null,
    lobbyType: snapshot.lobbyType === 0 ? 'public' : 'private',
    languageName: snapshot.languageName?.trim() || 'Unknown language',
    playerCount, maxPlayers: Math.min(32, Math.max(1, configured, playerCount))
  } };
}
