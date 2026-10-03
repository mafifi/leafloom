import { expect, it, vi } from 'vitest';
import { DocumentOutputViewModel, outputFormats, type DocumentOutputContext } from '../../apps/desktop/src/lib/document-output';
function fixture() {
  const calls: string[] = [];
  let bookId = 'book-1';
  const context: DocumentOutputContext = {
    snapshot: () => ({ bookId, title: 'A Book', language: 'en-GB' }),
    chapter: id => id === 'chapter-2' ? { title: 'Two: Departure', words: 100, kind: 'chapter' } : null,
    save: vi.fn(async () => { calls.push('save'); }),
    destination: vi.fn(async () => { calls.push('destination'); return '/private/export'; }),
    request: vi.fn(async () => { calls.push('export'); return '/private/export'; }),
    os: { request: vi.fn(async () => { calls.push('print'); return true; }) },
    hint: vi.fn(), t: key => key,
  };
  return { vm: new DocumentOutputViewModel(context), context, calls, switchBook() { bookId = 'another'; } };
}
it('all six chapter formats select exactly the saved chapter and sanitized filename', async () => {
  for (const format of outputFormats) {
    const f = fixture(); await f.vm.export(format, 'chapter-2');
    expect(f.calls).toEqual(['save', 'destination', 'export']);
    expect(f.context.destination).toHaveBeenCalledWith('Two_ Departure.' + format);
    expect(f.context.request).toHaveBeenCalledWith('exportChapter', { bookId: 'book-1', chapterId: 'chapter-2', language: 'en-GB', format, destination: '/private/export' });
  }
});
it('canceled picker, failed save and switched book never publish an export', async () => {
  for (const mode of ['cancel', 'save', 'switch']) {
    const f = fixture();
    if (mode === 'cancel') vi.mocked(f.context.destination).mockResolvedValue(null);
    if (mode === 'save') vi.mocked(f.context.save).mockRejectedValue(new Error('CONFLICT'));
    if (mode === 'switch') vi.mocked(f.context.destination).mockImplementation(async () => { f.switchBook(); return '/private/export'; });
    if (mode === 'cancel') await f.vm.export('txt'); else await expect(f.vm.export('txt')).rejects.toThrow();
    expect(f.context.request).not.toHaveBeenCalled();
  }
});
it('chapter printing saves first and requests only the chosen chapter from the OS provider', async () => {
  const f = fixture(); await f.vm.print('chapter-2');
  expect(f.calls).toEqual(['save', 'print']);
  expect(f.context.os?.request).toHaveBeenCalledWith('printChapter', { bookId: 'book-1', chapterId: 'chapter-2', language: 'en-GB' });
});
