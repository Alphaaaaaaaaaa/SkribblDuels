const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const viteBin = path.join(root, 'node_modules/vite/bin/vite.js');
const result = spawnSync(
  process.execPath,
  [viteBin, 'build', '--config', 'apps/telemetry-inspector/vite.config.ts'],
  { cwd: root, stdio: 'inherit' }
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
