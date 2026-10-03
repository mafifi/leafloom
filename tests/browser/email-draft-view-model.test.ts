import { expect, it, vi } from 'vitest';
import { EmailDraftViewModel, type EmailContext, type EmailPresentation } from '../../apps/desktop/src/lib/email-draft';
function fixture(mac = true) {
  const calls: string[] = [];
  let presentation: EmailPresentation | null = null;
  let address = 'writer@example.com';
  let method: 'mail' | 'gmail' | null = 'mail';
  let book: { id: string; title: string; words: number } | null = { id: 'book-1', title: 'A Book', words: 1200 };
  const context: EmailContext = {
    mac,
    os: { request: vi.fn(async () => { calls.push('native'); return { ok: true }; }) },
    snapshot: () => ({ book, address, method, locale: 'en-GB' }),
    prompt: vi.fn(async () => 'new@example.com'),
    saveSettings: vi.fn(async (nextAddress, nextMethod) => { calls.push('settings'); address = nextAddress; method = nextMethod; }),
    saveBook: vi.fn(async () => { calls.push('save'); }),
    request: vi.fn(async () => { calls.push('fingerprint'); return { fingerprint: 'a'.repeat(64) }; }),
    publish: (next) => { presentation = next; },
    hint: vi.fn(),
    t: (key, args) => key.replace(/\{([^}]+)\}/g, (_, name: string) => String(args?.[name] ?? '')),
    now: () => new Date('2026-10-02T18:00:00Z'),
  };
  return { context, vm: new EmailDraftViewModel(context), calls,
    get state() { return presentation; }, clearSettings() { address = ''; method = null; },
    changeBook() { book = { id: 'other-book', title: 'Another', words: 1 }; },
  };
}
it('saves before fingerprinting and preparing an addressed native draft without sending', async () => {
  const f = fixture();
  await f.vm.draft();
  expect(f.calls).toEqual(['save', 'fingerprint', 'native']);
  expect(f.context.request).toHaveBeenCalledWith('manuscriptFingerprint', { bookId: 'book-1' });
  expect(f.context.os?.request).toHaveBeenCalledWith('emailDraft', expect.objectContaining({
    bookId: 'book-1', to: 'writer@example.com', method: 'mail',
    subject: 'Leafloom draft — A Book — 1200 words — 02/10/2026',
    body: expect.stringContaining('a'.repeat(64)),
  }));
});
it('first draft resumes only after settings persist and macOS method choice', async () => {
  const f = fixture(); f.clearSettings();
  await f.vm.draft();
  expect(f.state).toEqual({ address: 'new@example.com', busy: false });
  expect(f.calls).toEqual([]);
  await f.vm.choose('gmail');
  expect(f.calls).toEqual(['settings', 'save', 'fingerprint', 'native']);
  expect(f.state).toBeNull();
  expect(f.context.os?.request).toHaveBeenCalledWith('emailDraft', expect.objectContaining({ method: 'gmail', to: 'new@example.com', body: expect.stringContaining('drag it into this email') }));
});
it('other platforms choose Gmail automatically and cancellation persists nothing', async () => {
  const f = fixture(false); await f.vm.settings();
  expect(f.context.saveSettings).toHaveBeenCalledWith('new@example.com', 'gmail');
  const canceled = fixture(); vi.mocked(canceled.context.prompt).mockResolvedValue(null);
  await canceled.vm.settings(); expect(canceled.context.saveSettings).not.toHaveBeenCalled();
  expect(canceled.state).toBeNull();
});
it('failed save, malformed fingerprint and switched books never invoke native email', async () => {
  for (const mode of ['save', 'fingerprint', 'switch']) {
    const f = fixture();
    if (mode === 'save') vi.mocked(f.context.saveBook).mockRejectedValue(new Error('CONFLICT'));
    if (mode === 'fingerprint') vi.mocked(f.context.request).mockResolvedValue({ fingerprint: 'invalid' });
    if (mode === 'switch') vi.mocked(f.context.saveBook).mockImplementation(async () => f.changeBook());
    await expect(f.vm.draft()).rejects.toThrow();
    expect(f.context.os?.request).not.toHaveBeenCalled();
  }
});
it('duplicate draft requests share the busy boundary rather than opening multiple clients', async () => {
  const f = fixture(); let finish!: () => void;
  vi.mocked(f.context.saveBook).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const first = f.vm.draft(); await f.vm.draft(); finish(); await first;
  expect(f.context.os?.request).toHaveBeenCalledOnce();
});
