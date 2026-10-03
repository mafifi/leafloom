/** The view owns transient focus and placement; commands own application state. */
export type PopupMenuItem = {
  label: string;
  localize?: boolean;
  run: () => void | Promise<void>;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
};
export function popupMenu(node: HTMLElement, options: { x: number; y: number; allowShortcuts?: boolean; cancel(): void }) {
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const buttons = () => Array.from(node.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  const zoom = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')) || 1;
  const width = node.offsetWidth * zoom, height = node.offsetHeight * zoom;
  const x = Math.max(4, Math.min(options.x, innerWidth - width - 4));
  const y = options.y + height > innerHeight - 4 ? Math.max(4, options.y - height) : options.y;
  node.style.left = `${x / zoom}px`;
  node.style.top = `${y / zoom}px`;
  let canceled = false;
  const cancel = () => { canceled = true; options.cancel(); };
  const outside = (event: MouseEvent) => { if (event.target instanceof Node && !node.contains(event.target)) cancel(); };
  const keydown = (event: KeyboardEvent) => {
    if (options.allowShortcuts && (event.metaKey || event.ctrlKey) && !['Escape', 'ArrowDown', 'ArrowUp', 'Tab'].includes(event.key)) return;
    const available = buttons();
    const index = available.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); cancel(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      available[(index + (event.key === 'ArrowDown' ? 1 : available.length - 1)) % available.length]?.focus({ preventScroll: true });
    } else if (event.key === 'Tab') event.preventDefault();
    event.stopPropagation();
  };
  document.addEventListener('mousedown', outside, true);
  window.addEventListener('blur', cancel);
  node.addEventListener('keydown', keydown);
  (node.querySelector<HTMLButtonElement>('button.on:not(:disabled)') ?? buttons()[0] ?? node).focus({ preventScroll: true });
  return { destroy() {
    document.removeEventListener('mousedown', outside, true);
    window.removeEventListener('blur', cancel);
    node.removeEventListener('keydown', keydown);
    if (canceled && back?.isConnected) back.focus({ preventScroll: true });
  } };
}
