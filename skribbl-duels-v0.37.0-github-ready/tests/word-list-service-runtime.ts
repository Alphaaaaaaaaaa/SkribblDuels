import {
  getOfficialWordLengthMetrics,
  getOfficialWordListStatus,
  hasOfficialWord,
  loadOfficialWordList,
  setOfficialWordListForTesting
} from '@skribbl-duels/challenge-definitions';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem(key: string) { return storage.get(key) ?? null; },
    setItem(key: string, value: string) { storage.set(key, value); },
    removeItem(key: string) { storage.delete(key); }
  },
  configurable: true
});

let requestedUrl = '';
Object.defineProperty(globalThis, 'fetch', {
  value: async (url: string) => {
    requestedUrl = url;
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          a: { Word: 'Ski' },
          b: { Word: 'Roter Panda' },
          c: { Word: 'Donaudampfschiff' },
          ignored: { Nope: 'not a word' }
        };
      }
    };
  },
  configurable: true
});

const status = await loadOfficialWordList(99, 'Test Language', true);
assert(status.state === 'ready', 'The language-scoped list should load.');
assert(requestedUrl.endsWith('/Test%20Language_List_Final.json'), 'The source file must use the selected language name.');
assert(status.wordCount === 3, 'Only Word properties should be loaded.');
assert(hasOfficialWord(99, 'roter   panda'), 'Official-word matching should normalize whitespace and case.');
const metrics = getOfficialWordLengthMetrics(99);
assert(metrics.wordCount === 3 && metrics.minimumLength === 3 && metrics.maximumLength === 16, 'Length metrics should be prepared for Small/Long Words challenges.');

const percentileWords = Array.from({ length: 21 }, (_, index) => 'x'.repeat(index + 1));
setOfficialWordListForTesting(100, percentileWords, 'Percentile Test');
const percentileMetrics = getOfficialWordLengthMetrics(100);
assert(percentileMetrics.shortThreshold === 2, 'Short words must use the fifth percentile, not the tenth percentile.');
assert(percentileMetrics.longThreshold === 19, 'Long words must continue to use the ninetieth percentile.');

const unsupported = getOfficialWordListStatus(12345, null);
assert(unsupported.state === 'unsupported' && Boolean(unsupported.warning), 'Unnamed/non-selectable languages need a warning status.');
console.log('Language-scoped official word-list service runtime test passed.');
