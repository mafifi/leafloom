import { z } from 'zod';
import { ManuscriptFingerprint, type DesktopOS, type HostMethod, type HostPayload } from '@leafloom/desktop-host';
export type EmailMethod = 'mail' | 'gmail';
export type EmailPresentation = { address: string; busy: boolean };
export interface EmailContext {
  snapshot(): { book: { id: string; title: string; words: number } | null; address: string; method: EmailMethod | null; locale: string };
  os?: DesktopOS;
  mac: boolean;
  prompt(title: string, placeholder: string, value: string): Promise<string | null>;
  saveSettings(address: string, method: EmailMethod): Promise<void>;
  saveBook(): Promise<void>;
  generatedCover?(bookId: string): Promise<string | undefined>;
  request<M extends HostMethod>(method: M, payload: HostPayload<M>): Promise<unknown>;
  publish(value: EmailPresentation | null): void;
  hint(value: string): void;
  t(key: string, args?: Record<string, string | number>): string;
  now?(): Date;
}
export class EmailDraftViewModel {
  private value: EmailPresentation | null = null;
  private resumeDraft = false;
  private generation = 0;
  private drafting = false;
  constructor(private context: EmailContext) {}
  async settings(resumeDraft = false) {
    const generation = ++this.generation;
    const snapshot = this.context.snapshot();
    const address = await this.context.prompt(this.context.t('Email drafts to'), 'you@example.com', snapshot.address);
    if (generation !== this.generation || address === null) return;
    const actual = address.trim() || snapshot.address;
    if (!z.email().safeParse(actual).success) { this.context.hint(this.context.t('Enter a valid email address')); return; }
    this.resumeDraft = resumeDraft;
    this.set({ address: actual, busy: false });
    if (!this.context.mac) await this.choose('gmail');
  }
  cancel() {
    if (this.value?.busy) return;
    ++this.generation;
    this.resumeDraft = false;
    this.set(null);
  }
  async choose(method: EmailMethod) {
    if (!this.value || this.value.busy || (!this.context.mac && method === 'mail')) return;
    const generation = this.generation;
    const resume = this.resumeDraft;
    this.set({ ...this.value, busy: true });
    try {
      await this.context.saveSettings(this.value.address, method);
      if (generation !== this.generation) return;
      this.resumeDraft = false;
      this.set(null);
      this.context.hint(this.context.t('Email settings saved'));
      if (resume) await this.draft();
    } finally {
      if (generation === this.generation && this.value) this.set({ ...this.value, busy: false });
    }
  }
  async draft() {
    if (this.drafting) return;
    const initial = this.context.snapshot();
    if (!initial.book) { this.context.hint(this.context.t('Open a book first')); return; }
    if (!this.context.os) throw new Error('NATIVE_HOST_REQUIRED');
    if (!initial.address || !initial.method) { await this.settings(true); return; }
    this.drafting = true;
    try {
      await this.context.saveBook();
      const snapshot = this.context.snapshot();
      if (!snapshot.book || snapshot.book.id !== initial.book.id) throw new Error('BOOK_CHANGED');
      const { fingerprint } = ManuscriptFingerprint.parse(await this.context.request('manuscriptFingerprint', { bookId: snapshot.book.id }));
      const generatedCover=await this.context.generatedCover?.(snapshot.book.id);
      if(this.context.snapshot().book?.id!==snapshot.book.id)throw new Error('BOOK_CHANGED');
      const now = this.context.now?.() ?? new Date();
      const args = { title: snapshot.book.title, n: snapshot.book.words };
      const subject = this.context.t('Leafloom draft — {title} — {n} words — {date}', { ...args, date: now.toLocaleDateString(snapshot.locale) });
      const body = this.context.t('Draft snapshot of “{title}” — {n} words.', args) + '\n'
        + this.context.t('Sent from Leafloom on {date}.', { date: now.toLocaleString(snapshot.locale) }) + '\n\n'
        + this.context.t('SHA-256 fingerprint of the manuscript text:') + '\n' + fingerprint + '\n\n'
        + this.context.t(initial.method === 'gmail' ? 'The PDF snapshot is in the folder Leafloom just opened — drag it into this email before sending.' : 'PDF snapshot attached.');
      this.context.hint(this.context.t('Preparing your draft…'));
      await this.context.os.request('emailDraft', { bookId: snapshot.book.id, to: initial.address, subject, body, method: initial.method, expectedFingerprint:fingerprint, ...(generatedCover?{generatedCover}:{}) });
      this.context.hint(this.context.t(initial.method === 'gmail' ? 'Gmail compose opened — drag in the PDF, then send' : 'Draft handed to Mail — hit send for your timestamp'));
    } finally { this.drafting = false; }
  }
  private set(value: EmailPresentation | null) { this.value = value; this.context.publish(value); }
}
