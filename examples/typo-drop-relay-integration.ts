/**
 * Optional Typo-side integration for Skribbl Duels.
 * Relay all three lifecycle boundaries from DropsFeature. Drop Streak remains
 * fail-closed unless every claim can be correlated with a preceding spawn and
 * every non-caught drop produces a miss.
 */
function relayDropLifecycle(type: string, detail: unknown): void {
  window.dispatchEvent(new CustomEvent(type, { detail }));
  // postMessage is an alternative when the extension/page execution worlds
  // do not share CustomEvent detail objects reliably.
  window.postMessage({ type, detail }, '*');
}

/** Call from the dropAnnounced$ pipeline before rendering the drop. */
export function relayTypoDropSpawnedToSkribblDuels(drop: { dropId: number }): void {
  relayDropLifecycle('skribbl-duels:typo-drop-spawned', { dropId: drop.dropId });
}

/**
 * Call when the active drop clears/expires without a confirmed own claim.
 * Do not emit this after processClaim(claim, true).
 */
export function relayTypoDropMissedToSkribblDuels(
  dropId: number,
  reason: 'cleared-or-expired' | 'claim-unconfirmed' | 'replaced' | 'lobby-left' = 'cleared-or-expired'
): void {
  relayDropLifecycle('skribbl-duels:typo-drop-missed', { dropId, reason });
}

/** Add this inside DropsFeature.processClaim after server confirmation. */
export function relayOwnDropClaimToSkribblDuels(
  claim: {
    dropId: number;
    catchTime: number;
    firstClaim: boolean;
    clearedDrop: boolean;
    leagueMode: boolean;
    leagueWeight: number;
    username: string;
  },
  ownClaim: boolean
): void {
  if (!ownClaim) return;

  const detail = { claim, ownClaim: true };
  relayDropLifecycle('skribbl-duels:typo-drop-claimed', detail);
}
