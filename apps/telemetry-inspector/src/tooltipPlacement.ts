export type TooltipDirection = 'N' | 'S' | 'E' | 'W';

/** Returns the CSS anchor adjustment, including the tooltip's translated box. */
export function clampTooltipAnchor(
  x: number, y: number, width: number, height: number,
  direction: TooltipDirection, viewportWidth: number, viewportHeight: number
): { x: number; y: number; arrowX: number; arrowY: number } {
  const offsetX = direction === 'N' || direction === 'S' ? -width / 2 : direction === 'W' ? -width : 0;
  const offsetY = direction === 'N' ? -height : direction === 'E' || direction === 'W' ? -height / 2 : 0;
  const left = x + offsetX; const top = y + offsetY;
  const safeLeft = Math.min(Math.max(8, left), Math.max(8, viewportWidth - width - 8));
  const safeTop = Math.min(Math.max(8, top), Math.max(8, viewportHeight - height - 8));
  const dx = safeLeft - left; const dy = safeTop - top;
  const bound = (value: number, size: number): number => Math.max(-Math.max(0, size / 2 - 10), Math.min(Math.max(0, size / 2 - 10), value));
  return { x: x + dx, y: y + dy, arrowX: bound(-dx, width), arrowY: bound(-dy, height) };
}
