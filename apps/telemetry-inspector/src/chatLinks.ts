/** Render untrusted chat text using text nodes and HTTP(S) anchors only. */
export function appendChatText(target: Node, text: string): void {
  const expression = /(?<![\w/])(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
  let start = 0;
  for (const match of text.matchAll(expression)) {
    let value = match[0].replace(/[.,!?;:]+$/, '');
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      while (value.endsWith(close!) && value.split(close!).length > value.split(open!).length) value = value.slice(0, -1);
    }
    let url: URL;
    try { url = new URL(/^www\./i.test(value) ? `https://${value}` : value); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) continue;
    target.appendChild(document.createTextNode(text.slice(start, match.index)));
    const link = document.createElement('a');
    link.className = 'scd-chat-link'; link.href = url.href; link.textContent = value;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    for (const event of ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu']) link.addEventListener(event, e => e.stopPropagation());
    target.appendChild(link); start = match.index! + value.length;
  }
  target.appendChild(document.createTextNode(text.slice(start)));
}

const CHAT_ROOTS = '#game-chat .chat-content, #newChatChatMessages, .typo-chat-content';
const EXCLUDED = 'a,button,input,textarea,script,style,b,strong,.scd-social-message-author,.scd-match-chat-author,.scd-chat-stat,.username,.player-name';

/** Presentation adapter: preserve native/Typo nodes and their telemetry text. */
export class ChatLinkifier {
  private observer: MutationObserver | null = null;
  private scheduled = false;

  public start(): void {
    if (this.observer) return;
    const style = document.createElement('style'); style.id = 'skribbl-duels-chat-links';
    style.textContent = '.scd-chat-link{color:inherit;text-decoration-line:underline;text-decoration-color:var(--COLOR_PANEL_BORDER_FOCUS);text-underline-offset:2px;cursor:pointer;overflow-wrap:anywhere}';
    document.head.appendChild(style);
    this.observer = new MutationObserver(() => {
      if (this.scheduled) return;
      this.scheduled = true;
      queueMicrotask(() => { this.scheduled = false; if (this.observer) this.refresh(); });
    });
    this.observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
    this.refresh();
  }

  public refresh(): void {
    for (const root of document.querySelectorAll(CHAT_ROOTS)) {
      const walker = document.createTreeWalker(root, 4);
      const nodes: Text[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (!node.parentElement?.closest(EXCLUDED) && /https?:\/\/|www\./i.test(node.data)) nodes.push(node);
      }
      for (const node of nodes) {
        const fragment = document.createDocumentFragment(); appendChatText(fragment, node.data);
        if (fragment.querySelector('a')) node.replaceWith(fragment);
      }
    }
  }

  public stop(): void {
    this.observer?.disconnect(); this.observer = null;
    document.getElementById('skribbl-duels-chat-links')?.remove();
  }
}
