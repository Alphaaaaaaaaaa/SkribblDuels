import {
  loadOfficialWordList,
  SKRIBBL_LANGUAGES,
  type OfficialWordListStatus
} from '@skribbl-duels/challenge-definitions';

export interface GatewayOfficialWordListReadiness {
  ready: readonly OfficialWordListStatus[];
  unsupported: readonly OfficialWordListStatus[];
}

export async function prepareGatewayOfficialWordLists(): Promise<GatewayOfficialWordListReadiness> {
  const statuses = await Promise.all(SKRIBBL_LANGUAGES.map(([languageId, languageName]) =>
    loadOfficialWordList(languageId, languageName)
  ));
  const failed = statuses.filter(status => status.state !== 'ready' && status.state !== 'unsupported');
  if (failed.length > 0) {
    throw new Error(`Authoritative word lists failed to load: ${failed
      .map(status => `${status.languageName ?? status.languageId} (${status.state})`)
      .join(', ')}.`);
  }
  const ready = statuses.filter(status => status.state === 'ready');
  if (ready.length === 0) {
    throw new Error('No authoritative Skribbl word list could be loaded.');
  }
  return {
    ready,
    unsupported: statuses.filter(status => status.state === 'unsupported')
  };
}
