import * as assert from 'node:assert/strict';
import {
  getOfficialWordListStatus,
  hasOfficialWord,
  SKRIBBL_LANGUAGES
} from '@skribbl-duels/challenge-definitions';
import { prepareGatewayOfficialWordLists } from '../apps/gateway/src/officialWordListAuthority';

const fetchableLanguages = new Set([
  'Czech',
  'English',
  'Finnish',
  'French',
  'German',
  'Hungarian',
  'Italian',
  'Korean',
  'Polish',
  'Portuguese',
  'Serbian',
  'Spanish'
]);
const requestedLanguages: string[] = [];

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem() { return null; },
    setItem() { /* The test keeps the authoritative lists in memory. */ }
  },
  configurable: true
});
Object.defineProperty(globalThis, 'fetch', {
  value: async (url: string) => {
    const match = /\/([^/]+)_List_Final\.json$/u.exec(url);
    const languageName = decodeURIComponent(match?.[1] ?? '');
    requestedLanguages.push(languageName);
    if (!fetchableLanguages.has(languageName)) {
      return {
        ok: false,
        status: 404,
        async json() { return {}; }
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return [{ Word: `${languageName} authority fixture` }];
      }
    };
  },
  configurable: true
});

const readiness = await prepareGatewayOfficialWordLists();
assert.equal(requestedLanguages.length, 28, 'Gateway startup must attempt every selectable Skribbl language.');
assert.deepEqual(
  [...new Set(requestedLanguages)].sort(),
  SKRIBBL_LANGUAGES.map(([, languageName]) => languageName).sort(),
  'Gateway startup must use the canonical ID/name table without omissions.'
);
assert.deepEqual(
  readiness.ready.map(status => status.languageName).sort(),
  [...fetchableLanguages].sort(),
  'Every successfully fetched list must become authoritative.'
);
assert.equal(readiness.unsupported.length, 16, 'A 404 list must remain explicitly unsupported without blocking other languages.');

for (const [languageId, languageName] of SKRIBBL_LANGUAGES) {
  const status = getOfficialWordListStatus(languageId);
  assert.equal(
    status.state,
    fetchableLanguages.has(languageName) ? 'ready' : 'unsupported',
    `${languageName} received the wrong authority state.`
  );
  if (fetchableLanguages.has(languageName)) {
    assert.equal(hasOfficialWord(languageId, `${languageName} authority fixture`), true);
  }
}

console.log('Gateway all-language official word-list authority runtime test passed.');
