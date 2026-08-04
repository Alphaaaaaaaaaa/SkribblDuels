/**
 * Optional Typo-side integration for Skribbl Duels.
 * Add this inside DropsFeature.processClaim after the claim has been confirmed by the server.
 */
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

  window.dispatchEvent(new CustomEvent('skribbl-duels:typo-drop-claimed', {
    detail
  }));

  // postMessage is an alternative when the extension/page execution worlds
  // do not share CustomEvent detail objects reliably.
  window.postMessage({
    type: 'skribbl-duels:typo-drop-claimed',
    detail
  }, '*');
}
