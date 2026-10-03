import type { DesktopOS, HostMethod, HostPayload } from '@leafloom/desktop-host';
export const outputFormats = ['txt', 'md', 'html', 'pdf', 'docx', 'epub'] as const;
export type OutputFormat = (typeof outputFormats)[number];
export interface DocumentOutputContext {
  snapshot(): { bookId: string | null; title: string; language: string };
  chapter(id: string): { title: string; words: number; kind: string } | null;
  save(): Promise<void>;
  ensurePublicationIdentity?(): void;
  generatedCover?(bookId: string): Promise<string | undefined>;
  destination(defaultName: string): Promise<string | null>;
  request<M extends HostMethod>(method: M, payload: HostPayload<M>): Promise<unknown>;
  os?: DesktopOS;
  hint(message: string): void;
  t(key: string, args?: Record<string, string | number>): string;
}
export class DocumentOutputViewModel {
  private busy = false;
  constructor(private context: DocumentOutputContext) {}
  async export(format: OutputFormat, chapterId?: string) {
    if (this.busy) return;
    const initial = this.context.snapshot();
    if (!initial.bookId) return;
    const chapter = chapterId ? this.context.chapter(chapterId) : null;
    if (chapterId && !chapter) throw new Error('NOT_FOUND');
    this.busy = true;
    try {
      this.context.ensurePublicationIdentity?.();
      await this.context.save();
      const snapshot = this.context.snapshot();
      if (snapshot.bookId !== initial.bookId || (chapterId && !this.context.chapter(chapterId))) throw new Error('BOOK_CHANGED');
      const title = chapter?.title || snapshot.title;
      const destination = await this.context.destination(title.replace(/[\\/:*?"<>|]/g, '_') + '.' + format);
      if (!destination) return;
      if (this.context.snapshot().bookId !== initial.bookId) throw new Error('BOOK_CHANGED');
      const payload = { bookId: initial.bookId, format, destination, language: snapshot.language };
      if (chapterId) await this.context.request('exportChapter', { ...payload, chapterId });
      else {
        const generatedCover=['html','pdf','epub'].includes(format)?await this.context.generatedCover?.(initial.bookId):undefined;
        if(this.context.snapshot().bookId!==initial.bookId)throw new Error('BOOK_CHANGED');
        await this.context.request('exportBook',{...payload,...(generatedCover?{generatedCover}:{})});
      }
      this.context.hint(this.context.t('Exported {title}', { title }));
    } finally { this.busy = false; }
  }
  async print(chapterId?: string) {
    if (this.busy) return;
    const initial = this.context.snapshot();
    if (!initial.bookId) return;
    if (!this.context.os) throw new Error('NATIVE_HOST_REQUIRED');
    if (chapterId && !this.context.chapter(chapterId)) throw new Error('NOT_FOUND');
    this.busy = true;
    try {
      this.context.ensurePublicationIdentity?.();
      await this.context.save();
      if (this.context.snapshot().bookId !== initial.bookId) throw new Error('BOOK_CHANGED');
      const payload = { bookId: initial.bookId, language: initial.language };
      if (chapterId) await this.context.os.request('printChapter', { ...payload, chapterId });
      else {
        const generatedCover=await this.context.generatedCover?.(initial.bookId);
        if(this.context.snapshot().bookId!==initial.bookId)throw new Error('BOOK_CHANGED');
        await this.context.os.request('printManuscript',{...payload,...(generatedCover?{generatedCover}:{})});
      }
    } finally { this.busy = false; }
  }
}
