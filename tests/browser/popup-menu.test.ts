// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { popupMenu } from '../../apps/desktop/src/lib/popup-menu';
it('focuses the checked enabled row and wraps arrow navigation past disabled entries', () => {
  document.body.innerHTML = '<button id="before">Before</button><div id="menu"><button>A</button><button disabled>B</button><button class="on">C</button></div>';
  const menu = document.getElementById('menu')!;
  const action = popupMenu(menu, { x: 10, y: 10, cancel() {} });
  expect(document.activeElement?.textContent).toBe('C');
  menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  expect(document.activeElement?.textContent).toBe('A');
  menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
  expect(document.activeElement?.textContent).toBe('C');
  action.destroy();
});
it('traps Tab, closes on Escape or outside pointer, restores prior focus and removes listeners', () => {
  document.body.innerHTML = '<button id="before">Before</button><div id="menu"><button>A</button></div>';
  const before = document.getElementById('before')!; before.focus();
  let canceled = 0;
  const menu = document.getElementById('menu')!;
  const action = popupMenu(menu, { x: 0, y: 0, cancel() { canceled++; } });
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  menu.dispatchEvent(tab); expect(tab.defaultPrevented).toBe(true);
  menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  expect(canceled).toBe(1); action.destroy(); expect(document.activeElement).toBe(before);
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); expect(canceled).toBe(1);
});
