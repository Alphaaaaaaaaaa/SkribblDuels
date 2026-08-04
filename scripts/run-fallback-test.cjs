const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/run-fallback-test.cjs tests/file.ts');

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', path.resolve(root, input)],
  { cwd: root, stdio: 'inherit' }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
