// Offline regression probes for the exact user-supplied snapshot. No network,
// real game socket, DOM injection or packet submission to skribbl.io is used.
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/review-supplied-gamepatch.cjs /path/to/gamePatch.js');
const source = readFileSync(input, 'utf8');
const sha256 = createHash('sha256').update(source).digest('hex');
const expected = '75bbaa0ea6d17b36d968275487e4c3c0408c7b321116dd8f5c2039d51563e394';
if (sha256 !== expected) throw new Error('The file differs from the reviewed snapshot; no code is evaluated.');
const between = (start, end) => {
  const first = source.indexOf(start); const last = source.indexOf(end, first);
  if (first < 0 || last < 0) throw new Error('Expected review boundary missing.');
  return source.slice(first, last);
};
const wire = [];
const context = vm.createContext({ structuredClone, Ia: 19, Ta: 21, dt: 8,
  S: { emit(...args) { wire.push(structuredClone(args)); return this; } },
  typo: { emitPort: { postMessage() {} }, msiColorSwitch: { ensureColorSequence(command) {
    if (command[1] < 10000) return undefined;
    command[1] = 4; return [[0, 0, 5, 0, 0, 0, 0]];
  } } } });
vm.runInContext(between('const originalEmit = S.emit.bind(S);', '/* TYPOEND */'), context, { timeout: 250 });
const commands = [[0, 1, 12, 10, 10, 20, 20], [0, 12000, 12, 30, 30, 40, 40]];
const original = structuredClone(commands);
context.S.emit('data', { id: 19, data: commands });
const batches = wire.filter(event => event[1].id === 19).map(event => event[1].data);
const logicalAppearances = batches.flat().filter(command => command[2] === 12).length;
const chainReturnPreserved = context.S.emit('data', { id: 30, data: 'local review marker' }) === context.S;
let noPayloadError = null;
try { context.S.emit('local-no-payload-event'); } catch (error) { noPayloadError = error.name; }

const colors = vm.createContext({ kt: Array.from({ length: 26 }, (_, index) => [index, index, index]),
  typo: { typoCodeToRgb: code => [(code - 10000) >> 16 & 255, (code - 10000) >> 8 & 255, (code - 10000) & 255] },
  c: { querySelector: () => ({ style: {} }) }, document: { dispatchEvent() {} }, CustomEvent: class {}, yt() {} });
vm.runInContext(between('function Nt(e)', 'function Ot()') + between('function zt(e)', 'function Ut(e)')
  + between('function q(e, t, n)', 'function Zt('), colors, { timeout: 250 });
const attempt = (fn, value) => { try { colors[fn](value); return 'ok'; } catch (error) { return error.name; } };

const documentStub = { listeners: [], addEventListener(_name, callback) { this.listeners.push(callback); } };
let deliveries = 0;
const listeners = vm.createContext({ document: documentStub, S: { emit() { deliveries++; } } });
const listenerSource = between("document.addEventListener('socketEmit'", 'typo.disconnect =');
for (let reconnect = 0; reconnect < 3; reconnect++) vm.runInContext(listenerSource, listeners, { timeout: 250 });
for (const callback of documentStub.listeners) callback({ detail: { id: 30, data: 'offline marker' } });

const pressure = vm.createContext({ document: { documentElement: { dataset: {
  typo_pressure_performance: '(p) => { globalThis.reviewMarker = true; return p; }'
} } }, gt: 0.5 });
vm.runInContext('eval(document.documentElement.dataset["typo_pressure_performance"])(gt)', pressure, { timeout: 250 });
const unicode = 'a'.repeat(99) + '\u{1f600}';
const results = {
  snapshotSha256: sha256, lines: source.split('\n').length, networkUsed: false,
  emitWrapper: { inputCommands: commands.length, wireDrawBatchSizes: batches.map(batch => batch.length),
    logicalCommandAppearances: logicalAppearances, inputUnchanged: JSON.stringify(commands) === JSON.stringify(original),
    undoOffsets: wire.filter(event => event[1].id === 21).map(event => event[1].data),
    chainReturnPreserved, noPayloadError },
  colors: { paletteIndex25: attempt('Bt', 25), paletteIndex26: attempt('Bt', 26),
    customBlack10000: attempt('Nt', 10000), customColor10001: attempt('Nt', 10001) },
  socketEmitListenersAfterThreeConnections: documentStub.listeners.length, deliveriesPerSingleEvent: deliveries,
  pressureAttributeRunsCode: pressure.reviewMarker === true,
  chatSubstring100SplitsSurrogatePair: /[\ud800-\udbff]$/.test(unicode.substring(0, 100)) && /^[\udc00-\udfff]/.test(unicode.substring(100))
};
if (logicalAppearances !== 4 || chainReturnPreserved || noPayloadError !== 'TypeError'
    || results.colors.customBlack10000 !== 'TypeError' || deliveries !== 3 || !pressure.reviewMarker) {
  throw new Error('An offline probe did not reproduce the stated finding.');
}
console.log(JSON.stringify(results, null, 2));
