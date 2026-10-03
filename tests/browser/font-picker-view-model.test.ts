import { expect, it, vi } from 'vitest';
import {
  FontPickerViewModel,
  type FontPickerPresentation,
} from '../../apps/desktop/src/lib/font-picker';
function fixture(reply: unknown = ['Zulu', 'Georgia', 'Arial', 'Georgia']) {
  let presentation: FontPickerPresentation | null = null;
  const context = {
    requestOS: vi.fn(async () => reply),
    snapshotCurrentBodyFont: () => 'Georgia',
    preview: vi.fn(),
    commit: vi.fn(async () => {}),
    publish: (next: FontPickerPresentation | null) => {
      presentation = next;
    },
    rendered: vi.fn(async () => {}),
    hint: vi.fn(),
    t: (key: string) => key,
  };
  return {
    vm: new FontPickerViewModel(context),
    context,
    get state() {
      return presentation;
    },
  };
}
it('lists unique validated native families sorted by locale and renders the saved selection', async () => {
  const f = fixture();
  await f.vm.open();
  expect(f.context.requestOS).toHaveBeenCalledWith('fontFamilies', {});
  expect(f.state).toEqual({
    current: 'Georgia',
    query: '',
    families: ['Arial', 'Georgia', 'Zulu'],
    rows: ['Arial', 'Georgia', 'Zulu'],
  });
  expect(f.context.rendered).toHaveBeenCalledOnce();
});
it('trimmed case-insensitive search preserves current family and Enter commits the first match', async () => {
  const f = fixture();
  await f.vm.open();
  f.vm.search('  AR  ');
  expect(f.state?.rows).toEqual(['Arial']);
  expect(f.state?.current).toBe('Georgia');
  await f.vm.enter();
  expect(f.context.commit).toHaveBeenCalledWith('Arial');
  expect(f.state).toBeNull();
});
it('hover previews only visible rows and leaving or canceling restores the original family', async () => {
  const f = fixture();
  await f.vm.open();
  f.vm.hover('Zulu');
  expect(f.context.preview).toHaveBeenLastCalledWith('Zulu');
  f.vm.leave();
  expect(f.context.preview).toHaveBeenLastCalledWith('Georgia');
  f.vm.hover('Arial');
  f.vm.cancel();
  expect(f.context.preview).toHaveBeenLastCalledWith('Georgia');
  expect(f.context.commit).not.toHaveBeenCalled();
});
it('empty search results do not commit and unavailable or invalid inventories show the source notice', async () => {
  const f = fixture();
  await f.vm.open();
  f.vm.search('missing');
  await f.vm.enter();
  expect(f.context.commit).not.toHaveBeenCalled();
  for (const reply of [[], { families: ['Arial'] }, ['.Hidden']]) {
    const unavailable = fixture(reply);
    await unavailable.vm.open();
    expect(unavailable.state).toBeNull();
    expect(unavailable.context.hint).toHaveBeenCalledOnce();
  }
});
it('a canceled asynchronous discovery cannot reopen the panel', async () => {
  const f = fixture();
  let complete: ((value: unknown) => void) | undefined;
  f.context.requestOS.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const opening = f.vm.open();
  f.vm.cancel();
  complete?.(['Arial']);
  await opening;
  expect(f.state).toBeNull();
});
it('a pending commit cannot close a newer picker session', async () => {
  const f = fixture();
  await f.vm.open();
  let finish: (() => void) | undefined;
  f.context.commit.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const chosen = f.vm.choose('Arial');
  f.vm.cancel();
  await f.vm.open();
  finish?.();
  await chosen;
  expect(f.state?.current).toBe('Georgia');
});
