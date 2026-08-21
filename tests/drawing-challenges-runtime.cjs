const fs = require('node:fs');
const path = require('node:path');
const { ChallengeEngine } = require('@skribbl-duels/challenge-engine');
const {
  throughThickAndThinDefinition,
  colorPickerDefinition
} = require('@skribbl-duels/challenge-definitions');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../fixtures/starter-challenges-with-drawing-v13.fixture.json'),
  'utf8'
));
const byId = id => fixture.events.find(entry => entry.event.eventId === id)?.event;
const start = byId('drawing-challenges-own-round-start');
const xs = byId('drawing-brush-xs-red');
const small = byId('drawing-brush-s-dark-red');
const medium = byId('drawing-brush-m-orange-yellow');
const large = byId('drawing-brush-l-green');
const xl = byId('drawing-brush-xl-blue');
assert(start && xs && small && medium && large && xl, 'Drawing fixture events are missing.');

const thick = new ChallengeEngine({ autoPersist: false });
thick.register(throughThickAndThinDefinition);
thick.activate({ instanceId: 'thick', challengeId: 'through-thick-and-thin' });
thick.process(structuredClone(start));
for (const event of [xs, small, medium, large]) thick.process(structuredClone(event));
assert(thick.getInstance('thick').progress.current === 4, 'Expected 4/5 brush sizes before XL.');
const duplicate = structuredClone(medium); duplicate.eventId = 'duplicate-medium';
thick.process(duplicate);
assert(thick.getInstance('thick').progress.current === 4, 'Duplicate brush size must not count twice.');
thick.process(structuredClone(xl));
assert(thick.getInstance('thick').status === 'completion-pending', 'All five brush sizes should complete.');

const colors = new ChallengeEngine({ autoPersist: false });
colors.register(colorPickerDefinition);
colors.activate({ instanceId: 'colors', challengeId: 'color-picker' });
colors.process(structuredClone(start));
colors.process(structuredClone(xs));
colors.process(structuredClone(small));
assert(colors.getInstance('colors').progress.current === 1, 'Red and dark red must be one family.');
const white = structuredClone(xs);
white.eventId = 'white-only';
white.payload = {
  commandCount: 1,
  tools: [0],
  colors: [0],
  brushSizes: [4],
  commands: [{ kind: 'PENCIL', tool: 0, color: 0, brushSize: 4, startX: 0, startY: 0, endX: 1, endY: 1, raw: [0,0,4,0,0,1,1] }]
};
colors.process(white);
assert(colors.getInstance('colors').progress.current === 1, 'White must not count.');
for (const event of [medium, large, xl]) colors.process(structuredClone(event));
assert(colors.getInstance('colors').status === 'completion-pending', 'Five color families should complete.');

const foreign = new ChallengeEngine({ autoPersist: false });
foreign.register(throughThickAndThinDefinition);
foreign.activate({ instanceId: 'foreign', challengeId: 'through-thick-and-thin' });
const foreignStart = structuredClone(start);
foreignStart.eventId = 'foreign-start';
foreignStart.context.drawerId = 99;
foreignStart.payload.drawerId = 99;
foreign.process(foreignStart);
for (const base of [xs, small, medium, large, xl]) {
  const event = structuredClone(base);
  event.eventId += '-foreign';
  event.context.drawerId = 99;
  foreign.process(event);
}
assert(foreign.getInstance('foreign').progress.current === 0, 'Foreign drawing commands must not count.');

console.log('Drawing challenge runtime test passed.');
