// @vitest-environment jsdom
import { get } from 'svelte/store';
import { it, expect } from 'vitest';
import { fixture } from './application-fixture';
const wheel = (deltaY: number, ctrlKey = false) => new WheelEvent('wheel', { deltaY, ctrlKey, cancelable: true });
it('board pinch and bottom-control wheel share the strict source threshold and persist card size without author history or page zoom', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'plotter'); await f.vm.newBook(get(f.vm.state).library.shelves[0].id); f.vm.createChapter();
    f.vm.setPanel('outline'); const editor = f.vm.editor!, version = editor.historyVersion, id = editor.metadata.id;
    const a = wheel(25, true); f.vm.pageZoomWheel(a); expect(a.defaultPrevented).toBe(true);
    f.vm.zoomControlWheel(wheel(15)); expect(get(f.vm.state).library.cardZoom ?? 1).toBe(1);
    f.vm.zoomControlWheel(wheel(1)); await expect.poll(() => get(f.vm.state).library.cardZoom).toBe(.85);
    f.vm.pageZoomWheel(wheel(-41, true)); await expect.poll(() => get(f.vm.state).library.cardZoom).toBe(1);
    f.vm.zoomControlWheel(wheel(-41)); await expect.poll(() => get(f.vm.state).library.cardZoom).toBe(1.15);
    expect(editor.historyVersion).toBe(version); expect(get(f.vm.state).zoom).toBe(1);
    await f.vm.closeBook(); await f.vm.initialize(); await f.vm.openBook(id);
    expect(get(f.vm.state).library.cardZoom).toBe(1.15); expect(get(f.vm.state).zoom).toBe(1);
  } finally { await f.close(); }
});
it('list wheel retains continuous page sizing and plain board scrolling does not resize cards', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'plotter'); await f.vm.newBook(get(f.vm.state).library.shelves[0].id); f.vm.createChapter();
    f.vm.setPanel('outline'); const plain = wheel(80); f.vm.pageZoomWheel(plain);
    expect(plain.defaultPrevented).toBe(false); expect(get(f.vm.state).library.cardZoom ?? 1).toBe(1);
    await f.vm.preference('outlineView', 'list'); f.vm.pageZoomWheel(wheel(-20, true));
    expect(get(f.vm.state).zoom).toBeCloseTo(Math.exp(.1)); expect(get(f.vm.state).library.cardZoom ?? 1).toBe(1);
  } finally { await f.close(); }
});
