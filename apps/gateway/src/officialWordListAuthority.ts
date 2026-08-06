import { loadOfficialWordList } from '@skribbl-duels/challenge-definitions';

const AUTHORITATIVE_LANGUAGES = [
  [0, 'English'],
  [1, 'German'],
  [7, 'French'],
  [14, 'Korean'],
  [24, 'Spanish']
] as const;

export async function prepareGatewayOfficialWordLists(): Promise<void> {
  const statuses = await Promise.all(AUTHORITATIVE_LANGUAGES.map(([languageId, languageName]) =>
    loadOfficialWordList(languageId, languageName)
  ));
  const failed = statuses.filter(status => status.state !== 'ready');
  if (failed.length > 0) {
    throw new Error(`Authoritative word lists failed to load: ${failed
      .map(status => `${status.languageName ?? status.languageId} (${status.state})`)
      .join(', ')}.`);
  }
}
