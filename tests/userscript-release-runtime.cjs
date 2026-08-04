const assert = require('node:assert/strict');
const {
  assertNoMojibake,
  encodeNonAsciiForJavaScript,
  normalizeGeneratedWhitespace
} = require('../scripts/publish-userscript.cjs');

const expected = [
  'Connected as analphabetism · an7v9s7e',
  '“primary-visual-obstruction”',
  'höchstens fünf Sekunden',
  '3×3 → 5×5',
  '👋'
];
const fixture = `const values = ${JSON.stringify(expected)};`;
const encoded = encodeNonAsciiForJavaScript(fixture);

assert.equal(Buffer.from(encoded, 'utf8').some(byte => byte > 0x7F), false);
assert.deepEqual(Function(`${encoded} return values;`)(), expected);
assert.doesNotThrow(() => assertNoMojibake(fixture));
assert.throws(() => assertNoMojibake(`Connected as analphabetism \u00C2\u00B7 an7v9s7e`));
assert.throws(() => assertNoMojibake(
  `conflict key \u00E2\u20AC\u0153primary-visual-obstruction\u00E2\u20AC\u009D`
));
assert.equal(
  normalizeGeneratedWhitespace('\t\n\t*   \nconst preserved = \'value \' ;'),
  '\n\t*\nconst preserved = \'value \' ;'
);

console.log(JSON.stringify({
  asciiSafeRuntimeRoundTrip: true,
  visibleCharactersPreserved: true,
  mojibakeRejected: true,
  generatedWhitespaceNormalized: true
}, null, 2));
