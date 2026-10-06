// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { writingDay } from '../../packages/authoring/src/progress';
import { fixture } from './application-fixture';

it('deleting below the saved day baseline counts subsequent writing in full and survives reopen', async () => {
  const f = await fixture();
  const now = Date.now();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newBook(get(f.vm.state).library.shelves[0].id);
    f.vm.createChapter();
    const editor = f.vm.editor!;
    editor.select(editor.chapters[0].id, 1);
    editor.insert('One two three four five');
    const day = writingDay(new Date(), 0);
    editor.setBookkeeping({ dailyCounts: { [day]: { start: 5, end: 5 } } });
    const passage = editor.passageRows(editor.chapters[0].id)[0];
    editor.replacePassageText(passage.id, 0, passage.text.length, 'One two');
    expect(get(f.vm.state).todayWords).toBe(0);
    expect(editor.metadata.dailyCounts).toEqual({ [day]: { start: 2, end: 2 } });
    clock.mockReturnValue(now + 1000);
    editor.select(editor.chapters[0].id, 8);
    editor.insert(' three four');
    expect(get(f.vm.state).todayWords).toBe(2);
    editor.undo();
    expect(editor.passageRows(editor.chapters[0].id)[0].text).toBe('One two');
    expect(get(f.vm.state).todayWords).toBe(0);
    editor.redo();
    expect(editor.passageRows(editor.chapters[0].id)[0].text).toBe('One two three four');
    expect(get(f.vm.state).todayWords).toBe(2);
    await f.vm.save();
    const id = editor.metadata.id;
    await f.vm.closeBook();
    await f.vm.openBook(id);
    expect(get(f.vm.state).todayWords).toBe(2);
    expect(f.vm.editor!.metadata.dailyCounts).toEqual({ [day]: { start: 2, end: 4 } });
  } finally {
    clock.mockRestore();
    await f.close();
  }
});
