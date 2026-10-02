import { SOCIAL_EMOJIS, SOCIAL_EMOJI_GROUPS } from './socialEmojis';

interface ChatEmojiPickerOptions {
  input: HTMLInputElement;
  onInput(): void;
  onClose(): void;
  onTooLong(): void;
  registerTooltip(target: HTMLElement, title: string, lock?: 'X' | 'Y'): void;
}

/** Shared by Quick Messages and the private Match chat. Never inserts HTML. */
export function createChatEmojiPicker(options: ChatEmojiPickerOptions): HTMLElement {
  const picker = document.createElement('div');
  picker.className = 'scd-social-emoji-picker'; picker.hidden = true;
  picker.setAttribute('aria-label', 'Skribbl emojis');
  for (const group of SOCIAL_EMOJI_GROUPS) {
    const section = document.createElement('section'); section.className = 'scd-social-emoji-group';
    const heading = document.createElement('strong'); heading.className = 'scd-social-emoji-group-title'; heading.textContent = group;
    const grid = document.createElement('div'); grid.className = 'scd-social-emoji-grid';
    for (const emoji of SOCIAL_EMOJIS.filter(item => item.group === group && item.source)) {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'scd-icon-button scd-social-emoji-choice';
      button.dataset.emojiToken = emoji.token; button.setAttribute('aria-label', emoji.token);
      const image = document.createElement('img'); image.src = emoji.source; image.alt = '';
      button.appendChild(image);
      button.addEventListener('mousedown', event => { event.preventDefault(); event.stopPropagation(); });
      button.addEventListener('click', event => {
        event.stopPropagation();
        const input = options.input;
        const start = input.selectionStart ?? input.value.length; const end = input.selectionEnd ?? start;
        const value = input.value.slice(0, start) + emoji.token + input.value.slice(end);
        if (Array.from(value).length > 300) { options.onTooLong(); return; }
        input.value = value; options.onInput();
        if (!event.shiftKey) { picker.hidden = true; options.onClose(); }
        input.focus({ preventScroll: true });
        input.setSelectionRange(start + emoji.token.length, start + emoji.token.length);
      });
      options.registerTooltip(button, emoji.token, 'Y'); grid.appendChild(button);
    }
    section.append(heading, grid); picker.appendChild(section);
  }
  return picker;
}
