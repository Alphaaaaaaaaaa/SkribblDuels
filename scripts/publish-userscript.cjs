const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MOJIBAKE_MARKERS = [
  '\u00C2',
  '\u00E2\u20AC',
  '\u00C3',
  '\u00F0\u0178',
  '\uFFFD'
];

function assertNoMojibake(source) {
  for (const marker of MOJIBAKE_MARKERS) {
    assert.equal(
      source.includes(marker),
      false,
      `Userscript contains the mojibake marker ${JSON.stringify(marker)}.`
    );
  }
}

function encodeNonAsciiForJavaScript(source) {
  const input = source.charCodeAt(0) === 0xFEFF ? source.slice(1) : source;
  let output = '';

  for (const character of input) {
    const codePoint = character.codePointAt(0);
    assert.notEqual(codePoint, undefined);

    if (codePoint <= 0x7F) {
      output += character;
      continue;
    }

    if (codePoint <= 0xFFFF) {
      output += `\\u${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
      continue;
    }

    const offset = codePoint - 0x10000;
    const highSurrogate = 0xD800 + (offset >> 10);
    const lowSurrogate = 0xDC00 + (offset & 0x3FF);
    output += `\\u${highSurrogate.toString(16).toUpperCase()}\\u${lowSurrogate.toString(16).toUpperCase()}`;
  }

  return output;
}

function normalizeGeneratedWhitespace(source) {
  return source
    .replace(/^[\t ]+$/gm, '')
    .replace(/^([\t ]*\*)[\t ]+$/gm, '$1');
}

function publishUserscript() {
  const repositoryRoot = path.resolve(__dirname, '..');
  const packageMetadata = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')
  );
  const sourcePath = path.join(
    repositoryRoot,
    'dist',
    'telemetry-inspector',
    'skribbl-duels-telemetry-inspector.user.js'
  );
  const releaseDirectory = path.join(repositoryRoot, 'userscript');
  const releasePath = path.join(releaseDirectory, 'skribbl-duels-telemetry-inspector.user.js');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assertNoMojibake(source);
  const release = normalizeGeneratedWhitespace(encodeNonAsciiForJavaScript(source));

  assert.match(release, new RegExp(`@version\\s+${packageMetadata.version.replaceAll('.', '\\.')}\\b`));
  assert.equal(release.includes('https://skribblduels-production.up.railway.app'), true);
  assert.equal(Buffer.from(release, 'utf8').some(byte => byte > 0x7F), false);

  fs.mkdirSync(releaseDirectory, { recursive: true });
  fs.writeFileSync(releasePath, release, 'ascii');

  const syntaxCheck = spawnSync(process.execPath, ['--check', releasePath], {
    encoding: 'utf8'
  });
  assert.equal(syntaxCheck.status, 0, syntaxCheck.stderr || syntaxCheck.stdout);

  console.log(JSON.stringify({
    published: path.relative(repositoryRoot, releasePath),
    version: packageMetadata.version,
    bytes: fs.statSync(releasePath).size,
    asciiSafe: true,
    mojibakeFree: true,
    syntaxValid: true
  }, null, 2));
}

module.exports = {
  assertNoMojibake,
  encodeNonAsciiForJavaScript,
  normalizeGeneratedWhitespace,
  publishUserscript
};

if (require.main === module) publishUserscript();
