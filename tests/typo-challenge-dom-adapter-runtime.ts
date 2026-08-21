import {
  blindGuessEffectActive,
  cssTextContainsDeafGuessRules,
  deafGuessEffectActive
} from '@skribbl-duels/telemetry-core';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const saved = {
  document: globalThis.document,
  HTMLElement: globalThis.HTMLElement,
  HTMLCanvasElement: globalThis.HTMLCanvasElement,
  Element: globalThis.Element,
  getComputedStyle: globalThis.getComputedStyle
};

class FakeHTMLElement {
  public style = { opacity: '', pointerEvents: '' };
  public parentElement: FakeHTMLElement | null = null;
  public querySelectorAll(): FakeHTMLElement[] { return []; }
}

class FakeCanvas extends FakeHTMLElement {
  public width = 800;
  public height = 600;
}

const hiddenCanvas = new FakeCanvas();
hiddenCanvas.style.opacity = '0';

let styleSheets: Array<{ cssRules: Array<{ cssText: string }> }> = [];
const documentMock = {
  querySelectorAll(selector: string) {
    if (selector === '#game canvas') return [hiddenCanvas];
    if (selector === 'style') return [];
    return [];
  },
  querySelector() { return null; },
  get styleSheets() { return styleSheets; },
  documentElement: new FakeHTMLElement()
};

Object.assign(globalThis, {
  document: documentMock,
  HTMLElement: FakeHTMLElement,
  HTMLCanvasElement: FakeCanvas,
  Element: FakeHTMLElement,
  getComputedStyle: (element: FakeHTMLElement) => ({
    opacity: element.style.opacity || '1',
    backdropFilter: '',
    webkitBackdropFilter: ''
  })
});

try {
  assert(blindGuessEffectActive(), 'Blind Guess should detect an inline-hidden 800×600 game canvas even when it is not canvas#game-canvas.');

  hiddenCanvas.style.opacity = '';
  assert(!blindGuessEffectActive(), 'Blind Guess should not report an ordinary visible game canvas as active.');

  assert(
    cssTextContainsDeafGuessRules('.typo-challenge-deaf-guess-hidden span { filter: blur(3px); }'),
    'The dedicated Deaf Guess marker rule should be recognized.'
  );
  assert(
    !cssTextContainsDeafGuessRules('#game-word .hints { opacity: 0; }'),
    'A generic hidden hints rule alone must not be enough to identify Deaf Guess.'
  );
  assert(!deafGuessEffectActive(), 'Naturally hidden or absent hints must not create a Deaf Guess false positive.');

  styleSheets = [{
    cssRules: [
      { cssText: '.typo-challenge-deaf-guess-hidden span, .player-bubble .content .text { filter: blur(3px); }' },
      { cssText: '#game form.chat-form .characters, #game-word .hints { opacity: 0; }' }
    ]
  }];
  assert(deafGuessEffectActive(), 'The Typo-injected Deaf Guess stylesheet should be recognized before any chat message is received.');
} finally {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete target[key];
    else target[key] = value;
  }
}

console.log('Typo challenge DOM adapter runtime tests passed.');
