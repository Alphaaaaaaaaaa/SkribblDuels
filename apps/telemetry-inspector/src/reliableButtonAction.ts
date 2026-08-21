export function bindReliableButtonAction(
  button: HTMLButtonElement,
  action: () => void
): void {
  let suppressPointerClick = false;
  let suppressionTimer: ReturnType<typeof setTimeout> | null = null;

  button.addEventListener('pointerdown', event => {
    if (button.disabled || event.button !== 0 || event.isPrimary === false) return;
    suppressPointerClick = true;
    if (suppressionTimer !== null) clearTimeout(suppressionTimer);
    suppressionTimer = setTimeout(() => {
      suppressPointerClick = false;
      suppressionTimer = null;
    }, 1_000);
    button.focus({ preventScroll: true });
    action();
  });

  button.addEventListener('click', event => {
    if (suppressPointerClick && event.detail !== 0) {
      suppressPointerClick = false;
      if (suppressionTimer !== null) clearTimeout(suppressionTimer);
      suppressionTimer = null;
      event.preventDefault();
      return;
    }
    if (!button.disabled) action();
  });

  button.addEventListener('pointercancel', () => {
    suppressPointerClick = false;
    if (suppressionTimer !== null) clearTimeout(suppressionTimer);
    suppressionTimer = null;
  });
}
