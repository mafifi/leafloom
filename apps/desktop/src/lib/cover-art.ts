import { z } from 'zod';
import { type JSONValue, type MetadataValue } from '@leafloom/document-contracts';
import { Library, type LibraryValue } from '@leafloom/library';
import {
  CoverArtJob,
  CoverQuality,
  CoverModel,
  CoverSecretStatus,
  type HostMethod,
  type HostPayload,
  type OsMethod,
  type OsPayload,
} from '@leafloom/desktop-host';

export const PAINT_AT = 1000;
export const STALE_PAINT_MS = 10 * 60 * 1000;
const ModelOverrides = z.object({ text: z.string().optional(), image: z.string().optional() });
const Settings = z.object({
  provider: z.string().optional(),
  auto: z.boolean().default(true),
  quality: CoverQuality.catch('medium'),
  models: z.record(z.string(), ModelOverrides).default({}),
});
const Art = z.object({
  status: z.string(),
  file: z.string().optional(),
  at: z.string().optional(),
  words: z.number().optional(),
});
export type CoverChoice = 'image' | 'painted' | 'abstract' | 'reroll' | 'paint' | 'nope' | 'save-image';
export type CoverArtDraft = {
  auto: boolean;
  quality: 'low' | 'medium' | 'high';
  textModel: string;
  imageModel: string;
  key: string;
};
export type CoverArtPresentation =
  | {
      kind: 'settings';
      draft: CoverArtDraft;
      configured: boolean | null;
      busy: boolean;
      error: string | null;
    }
  | {
      kind: 'choices';
      bookId: string;
      title: string;
      options: { value: CoverChoice; label: string; description: string; disabled: boolean }[];
    };
export interface CoverArtContext {
  snapshot(): { book: MetadataValue | null; books: MetadataValue[]; library: LibraryValue };
  requestOS<M extends OsMethod>(method: M, payload: OsPayload<M>): Promise<unknown>;
  requestHost<M extends HostMethod>(method: M, payload: HostPayload<M>): Promise<unknown>;
  saveBook(): Promise<void>;
  updateMetadata(
    bookId: string,
    patch: Record<string, JSONValue>,
    options?: { history?: boolean },
  ): Promise<void>;
  writeLibrary(value: LibraryValue): Promise<void>;
  prepareCovers(): Promise<void>;
  publish(value: CoverArtPresentation | null): void;
  hint(message: string): void;
  t(key: string, args?: Record<string, string | number>): string;
  now?(): Date;
  saveImage?(id:string):Promise<void>;
}
const settings = (library: LibraryValue) =>
  Settings.safeParse(library.coverArt).data ?? Settings.parse({});
const painting = (meta: MetadataValue) => {
  const art = Art.safeParse(meta.coverArt);
  return art.success && art.data.status === 'done' && Boolean(art.data.file);
};
export function coverMode(meta: MetadataValue): 'image' | 'painted' | 'abstract' {
  if (meta.coverMode === 'image' && meta.coverImage) return 'image';
  if (meta.coverMode === 'painted' && painting(meta)) return 'painted';
  if (meta.coverMode === 'abstract') return 'abstract';
  return meta.coverImage ? 'image' : painting(meta) ? 'painted' : 'abstract';
}
export function coverPaintable(meta: MetadataValue, now = new Date()): boolean {
  const ordinaryKind =
    !meta.kind ||
    [
      'novel',
      'novella',
      'story',
      'short-story',
      'book',
      'nonfiction',
      'non-fiction',
      'memoir',
      'poetry',
    ].includes(String(meta.kind));
  if (meta.coverImage || !ordinaryKind || Number(meta.wordCount ?? 0) < PAINT_AT) return false;
  if (!meta.coverArt) return true;
  const art = Art.safeParse(meta.coverArt);
  return (
    art.success &&
    art.data.status === 'pending' &&
    now.getTime() - Date.parse(art.data.at ?? '') > STALE_PAINT_MS
  );
}
/** Settings and shelf actions use host-owned jobs; no service credential enters a book. */
export class CoverArtViewModel {
  private presentation: CoverArtPresentation | null = null;
  private generation = 0;
  private requesting = new Set<string>();
  private jobs = new Map<string, z.infer<typeof CoverArtJob>>();
  private submissions = new Map<string, Map<string, z.infer<typeof CoverArtJob>>>();
  constructor(private readonly context: CoverArtContext) {}
  private now() {
    return this.context.now?.() ?? new Date();
  }
  private emit(value: CoverArtPresentation | null) {
    this.presentation = value;
    this.context.publish(value);
  }
  private book(id: string) {
    const snapshot = this.context.snapshot();
    return snapshot.book?.id === id ? snapshot.book : snapshot.books.find((book) => book.id === id);
  }
  async openSettings() {
    const generation = ++this.generation,
      cs = settings(this.context.snapshot().library),
      models = cs.models.openai;
    this.emit({
      kind: 'settings',
      draft: {
        auto: cs.auto,
        quality: cs.quality,
        textModel: models?.text ?? '',
        imageModel: models?.image ?? '',
        key: '',
      },
      configured: null,
      busy: false,
      error: null,
    });
    try {
      const status = CoverSecretStatus.parse(
        await this.context.requestOS('hasSecret', { provider: 'openai' }),
      );
      if (generation === this.generation && this.presentation?.kind === 'settings')
        this.emit({ ...this.presentation, configured: status.configured });
    } catch {
      if (generation === this.generation && this.presentation?.kind === 'settings')
        this.emit({
          ...this.presentation,
          error: this.context.t('The key store is unavailable on this computer.'),
        });
    }
  }
  edit(field: keyof CoverArtDraft, value: string | boolean) {
    if (this.presentation?.kind !== 'settings' || this.presentation.busy) return;
    const draft = { ...this.presentation.draft };
    if (field === 'auto') draft.auto = Boolean(value);
    else if (field === 'quality') draft.quality = CoverQuality.parse(value);
    else if (typeof value === 'string') draft[field] = value;
    this.emit({ ...this.presentation, draft, error: null });
  }
  cancel() {
    this.generation++;
    this.emit(null);
  }
  async saveSettings() {
    if (this.presentation?.kind !== 'settings' || this.presentation.busy) return;
    const generation = this.generation,
      state = this.presentation,
      draft = state.draft,
      key = draft.key.trim(),
      remove = key === 'remove' || key === this.context.t('remove');
    if (key && !remove && !/^\S{20,4096}$/.test(key)) {
      this.emit({
        ...state,
        error: this.context.t(
          'That doesn’t look like an API key ({name} keys look like {hint}) — not saved',
          { name: 'OpenAI', hint: 'sk-…' },
        ),
      });
      return;
    }
    const text = draft.textModel.trim(),
      image = draft.imageModel.trim();
    if (
      (text && !CoverModel.safeParse(text).success) ||
      (image && !CoverModel.safeParse(image).success)
    ) {
      this.emit({
        ...state,
        error: this.context.t(
          'Use a model name with letters, numbers, dots, underscores or hyphens.',
        ),
      });
      return;
    }
    this.emit({ ...state, busy: true, error: null });
    try {
      if (key)
        await this.context.requestOS('setSecret', {
          provider: 'openai',
          value: remove ? null : key,
        });
      const current = this.context.snapshot().library,
        cs = settings(current);
      await this.context.writeLibrary(
        Library.parse({
          ...current,
          coverArt: {
            provider: 'openai',
            auto: draft.auto,
            quality: draft.quality,
            models: {
              ...cs.models,
              openai: { ...(text ? { text } : {}), ...(image ? { image } : {}) },
            },
          },
        }),
      );
      const status = CoverSecretStatus.parse(
        await this.context.requestOS('hasSecret', { provider: 'openai' }),
      );
      if (generation === this.generation) this.cancel();
      if (!status.configured)
        this.context.hint(this.context.t('Saved. Add an OpenAI key to start painting.'));
    } catch {
      if (generation === this.generation && this.presentation?.kind === 'settings')
        this.emit({
          ...this.presentation,
          busy: false,
          error: this.context.t('Cover art settings could not be saved. Try again.'),
        });
    }
  }
  async openChoices(bookId: string) {
    const meta = this.book(bookId);
    if (!meta) return;
    const generation = ++this.generation;
    const configured =
      meta.kind !== 'cover' &&
      CoverSecretStatus.parse(await this.context.requestOS('hasSecret', { provider: 'openai' }))
        .configured;
    if (generation !== this.generation) return;
    const mode = coverMode(meta),
      options: Extract<CoverArtPresentation, { kind: 'choices' }>['options'] = [],
      t = this.context.t.bind(this.context);
    const add = (value: CoverChoice, label: string, description: string, disabled = false) =>
      options.push({
        value,
        label: t(label),
        description: t(description, { n: PAINT_AT }),
        disabled,
      });
    if (meta.coverImage && mode !== 'image')
      add('image', 'Show your cover art', 'The image you gave this book.');
    if (painting(meta) && mode !== 'painted')
      add('painted', 'Show Leafloom’s painting', 'The cover painted from the text.');
    if (mode !== 'abstract')
      add('abstract', 'Show the abstract', 'The seeded cover every book starts with.');
    add(
      'reroll',
      'New type & colours',
      mode === 'abstract'
        ? 'A fresh abstract and a different title style.'
        : 'Re-sets the title in a different style over the same art.',
    );
    if (configured)
      add(
        Number(meta.wordCount ?? 0) >= PAINT_AT ? 'paint' : 'nope',
        painting(meta) ? 'Paint it again' : 'Paint a cover from the text',
        Number(meta.wordCount ?? 0) >= PAINT_AT
          ? 'Leafloom reads the manuscript and paints a new cover. About a minute; a few cents.'
          : 'Once the story passes {n} words.',
        Number(meta.wordCount ?? 0) < PAINT_AT,
      );
    if(this.context.saveImage&&meta.format!=='screenplay')add('save-image','Save cover as image…','Full size, with your title and author.');
    if (options.length === 1) {
      await this.choose(bookId, 'reroll');
      return;
    }
    this.emit({ kind: 'choices', bookId, title: meta.title, options });
  }
  async choose(bookId: string, choice: CoverChoice) {
    const meta = this.book(bookId);
    if (!meta || choice === 'nope') return;
    this.cancel();
    if(choice==='save-image'){await this.context.saveImage?.(bookId);return;}
    if (choice === 'paint') {
      await this.requestPaint(meta, true);
      return;
    }
    if ((choice === 'image' && !meta.coverImage) || (choice === 'painted' && !painting(meta)))
      return;
    const patch: Record<string, JSONValue> =
      choice === 'reroll'
        ? {
            coverSeed:
              meta.id + ':' + Number(meta.wordCount ?? 0) + ':' + this.now().getTime().toString(36),
            ...(coverMode(meta) === 'image' ? { coverMode: 'abstract' } : {}),
          }
        : { coverMode: choice };
    await this.context.updateMetadata(bookId, patch);
    await this.context.prepareCovers();
  }
  async maybePaint(meta: MetadataValue) {
    if (settings(this.context.snapshot().library).auto && coverPaintable(meta, this.now()))
      await this.requestPaint(meta, false);
  }
  private async requestPaint(meta: MetadataValue, manual: boolean) {
    const art = Art.safeParse(meta.coverArt);
    if (
      this.requesting.has(meta.id) ||
      (art.success && art.data.status === 'pending' && !coverPaintable(meta, this.now()))
    ) {
      this.context.hint(this.context.t('Still painting…'));
      return;
    }
    const status = CoverSecretStatus.parse(
      await this.context.requestOS('hasSecret', { provider: 'openai' }),
    );
    // Credential discovery can yield while another trigger starts this book.
    if (this.requesting.has(meta.id)) return;
    if (!status.configured) {
      const library = this.context.snapshot().library;
      if (!library.coverArtNudged) {
        await this.context.writeLibrary(Library.parse({ ...library, coverArtNudged: true }));
        this.context.hint(
          this.context.t(
            'This story just passed {n} words — add an API key under File → Cover Art… and Leafloom will paint it a cover.',
            { n: PAINT_AT },
          ),
        );
      }
      return;
    }
    this.requesting.add(meta.id);
    try {
      if (this.context.snapshot().book?.id === meta.id) await this.context.saveBook();
      const cs = settings(this.context.snapshot().library),
        models = cs.models.openai;
      if (manual) await this.context.updateMetadata(meta.id, { coverMode: 'painted' });
      await this.context.updateMetadata(
        meta.id,
        {
          coverArt: {
            status: 'pending',
            at: this.now().toISOString(),
            words: Number(meta.wordCount ?? 0),
          },
        },
        { history: false },
      );
      this.submissions.set(meta.id, new Map());
      const job = CoverArtJob.parse(
        await this.context.requestOS('paintCover', {
          bookId: meta.id,
          provider: 'openai',
          quality: cs.quality,
          ...(models?.text ? { textModel: models.text } : {}),
          ...(models?.image ? { imageModel: models.image } : {}),
        }),
      );
      const queued = this.submissions.get(meta.id);
      this.submissions.delete(meta.id);
      this.jobs.set(meta.id, job);
      for (const progress of queued?.values() ?? [])
        if (progress.jobId === job.jobId) await this.progress(progress);
      if (job.status === 'done' || job.status === 'failed') await this.progress(job);
    } catch {
      this.submissions.delete(meta.id);
      this.requesting.delete(meta.id);
      await this.context.updateMetadata(
        meta.id,
        {
          coverArt: { status: 'failed', error: 'UNAVAILABLE', at: this.now().toISOString() },
        },
        { history: false },
      );
      this.context.hint(
        this.context.t('Leafloom couldn’t paint that cover: {error}', { error: 'UNAVAILABLE' }),
      );
      await this.context.prepareCovers();
    }
  }
  async progress(value: unknown) {
    const job = CoverArtJob.parse(value);
    const submission = this.submissions.get(job.bookId);
    if (submission) {
      submission.set(job.jobId ?? '', job);
      return;
    }
    const previous = this.jobs.get(job.bookId);
    if (previous?.jobId && job.jobId && previous.jobId !== job.jobId) return;
    this.jobs.set(job.bookId, job);
    if (job.status !== 'done' && job.status !== 'failed') return;
    this.requesting.delete(job.bookId);
    const meta = this.book(job.bookId);
    if (!meta) return;
    if (job.status === 'done') {
      if (!job.result) throw Error('COVER_RESULT_MISSING');
      await this.context.updateMetadata(
        job.bookId,
        {
          coverArt: {
            status: 'done',
            ...job.result,
            words: Number(meta.wordCount ?? 0),
            at: this.now().toISOString(),
          },
          ...(!meta.coverImage ? { coverMode: 'painted' } : {}),
        },
        { history: false },
      );
    } else {
      await this.context.updateMetadata(
        job.bookId,
        {
          coverArt: {
            status: 'failed',
            error: job.code ?? 'UNKNOWN',
            at: this.now().toISOString(),
          },
        },
        { history: false },
      );
      this.context.hint(
        this.context.t('Leafloom couldn’t paint that cover: {error}', {
          error: job.code ?? 'UNKNOWN',
        }),
      );
    }
    await this.context.prepareCovers();
  }
  async recover(meta: MetadataValue) {
    const job = CoverArtJob.parse(
      await this.context.requestHost('readCoverArtJob', { bookId: meta.id }),
    );
    if (job.status === 'done' || job.status === 'failed') await this.progress(job);
  }
}
