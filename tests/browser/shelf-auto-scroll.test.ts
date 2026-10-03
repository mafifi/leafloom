// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { shelfAutoScroll } from '../../apps/desktop/src/lib/shelf-auto-scroll';
afterEach(() => vi.restoreAllMocks());
function fixture() {
  document.body.innerHTML = '<div id="bookshelf-view"><section></section><section></section></div>';
  const view = document.getElementById('bookshelf-view')!;
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  const step = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  };
  const drag = (y: number) =>
    view.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: y }));
  return { view, frames, step, drag };
}
it('shares one loop across shelves, uses source edge speed and stops outside edge or after last destroy', () => {
  const f = fixture();
  const a = shelfAutoScroll(f.view.children[0] as HTMLElement);
  const b = shelfAutoScroll(f.view.children[1] as HTMLElement);
  f.drag(window.innerHeight - 8);
  expect(f.frames.size).toBe(1);
  f.step();
  expect(f.view.scrollTop).toBe(17);
  f.step();
  expect(f.view.scrollTop).toBe(34);
  f.drag(window.innerHeight / 2);
  expect(f.frames.size).toBe(0);
  a.destroy();
  f.drag(10);
  f.step();
  expect(f.view.scrollTop).toBe(18);
  b.destroy();
  expect(f.frames.size).toBe(0);
  f.drag(window.innerHeight - 8);
  expect(f.frames.size).toBe(0);
});
it('global drop/dragend and leaving the window cancel pending frames without a late scroll', () => {
  const f = fixture(),
    binding = shelfAutoScroll(f.view.children[0] as HTMLElement);
  for (const event of ['drop', 'dragend']) {
    f.drag(window.innerHeight - 8);
    window.dispatchEvent(new Event(event));
    f.step();
    expect(f.view.scrollTop).toBe(0);
    expect(f.frames.size).toBe(0);
  }
  f.drag(window.innerHeight - 8);
  f.view.dispatchEvent(
    new MouseEvent('dragleave', { bubbles: true, relatedTarget: f.view.children[0] }),
  );
  expect(f.frames.size).toBe(1);
  f.view.dispatchEvent(new MouseEvent('dragleave', { bubbles: true }));
  expect(f.frames.size).toBe(0);
  binding.destroy();
});

it('stops on a consumed shelf drop before its handler can suppress bubbling', () => {
  const f = fixture(),
    binding = shelfAutoScroll(f.view.children[0] as HTMLElement);
  f.view.children[0].addEventListener('drop', (event) => event.stopPropagation());
  f.drag(window.innerHeight - 8);
  f.view.children[0].dispatchEvent(new Event('drop', { bubbles: true }));
  expect(f.frames.size).toBe(0);
  binding.destroy();
});
