import { z } from 'zod';
import { AuthoringSession } from '@leafloom/authoring';
import {
  OpenReply,
  SaveReply,
  type EditorPort,
  type SurfaceActions,
  type SurfacePort,
} from '@leafloom/editor-contracts';
import { PageKinds, type LibraryValue } from '@leafloom/library';
import type { HostMethod, HostPayload } from '@leafloom/desktop-host';
export type PublicationKind = (typeof PageKinds)[number];
export type TitleField = 'title' | 'subtitle' | 'author';
export interface PublicationPageOptions {
  bookId: string;
  kind: PublicationKind;
  label: string;
  shelfId?: string;
  shelfName?: string;
  authorName?: string;
}
export interface PublicationPagePresentation extends PublicationPageOptions {
  title: string;
  subtitle: string;
  author: string;
  readOnly: boolean;
  dirty: boolean;
  saving: boolean;
  closing: boolean;
  blocked: boolean;
  failure: 'disk' | 'conflict' | 'host' | 'uncertain' | 'unknown' | null;
  focus: { field: TitleField; from: number; to: number; token: number } | null;
}
export interface PublicationPageContext {
  request<M extends HostMethod>(method: M, payload: HostPayload<M>): Promise<unknown>;
  factory(
    opened: z.infer<typeof OpenReply>,
    actions: SurfaceActions,
    changed: () => void,
  ): { editor: EditorPort; surfaces: SurfacePort<HTMLElement> };
  library(): LibraryValue;
  rendered(): Promise<void>;
  publish(presentation: PublicationPagePresentation | null): void;
  refreshLibrary(): Promise<void>;
  saveTitlePage?(
    bookId: string,
    values: { title: string; subtitle: string; author: string },
    shelfId?: string,
  ): Promise<void>;
  error(error: unknown): void;
  t(key: string): string;
}
/** A publication sheet owns one book lease and the same production author history as a manuscript. */
export class PublicationPageViewModel {
  private state: PublicationPagePresentation | null = null;
  private editor: EditorPort | null = null;
  private surfaces: SurfacePort<HTMLElement> | null = null;
  private session: AuthoringSession | null = null;
  private lease: string | null = null;
  private versions: z.infer<typeof OpenReply>['versions'] | null = null;
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private mounted: HTMLElement | null = null;
  private enabled: boolean | null = null;
  private closing: Promise<void> | null = null;
  private opening = false;
  private finishing = false;
  private focusToken = 0;
  private titlePending = false;
  constructor(private readonly context: PublicationPageContext) {}
  get active() {
    return this.state !== null;
  }
  get dirty() {
    return (this.session?.dirty ?? false) || this.titlePending;
  }
  get core() {
    return this.editor;
  }
  private emit() {
    if (!this.state || !this.editor) return;
    this.state = {
      ...this.state,
      title: this.editor.title,
      subtitle:
        typeof this.editor.metadata.subtitle === 'string' ? this.editor.metadata.subtitle : '',
      author: this.editor.author,
      dirty: this.dirty,
      closing: this.finishing,
    };
    this.context.publish(this.state);
    const enabled = !this.state.readOnly && !this.state.blocked && !this.finishing;
    // The surface subscribes to author transactions itself; only update its
    // editing capability here when lease/recovery/close state changes.
    if (this.mounted && enabled !== this.enabled) {
      this.enabled = enabled;
      this.surfaces?.update(this.editor.chapters[0]?.id ?? '', 'manuscript', enabled);
    }
  }
  private stopTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  private changed() {
    this.session?.changed();
    if (this.state?.kind === 'cover') this.titlePending = true;
    this.emit();
    this.stopTimer();
    if (this.state && !this.state.readOnly && !this.state.blocked && !this.state.failure)
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.save().catch(() => {});
      }, 600);
  }
  async open(options: PublicationPageOptions) {
    if (this.opening) throw Error('BUSY');
    if (this.active) await this.close();
    this.opening = true;
    let opened: z.infer<typeof OpenReply> | null = null;
    try {
      if (!PageKinds.includes(options.kind)) throw Error('INVALID_PAGE_KIND');
      opened = OpenReply.parse(await this.context.request('openBook', { bookId: options.bookId }));
      if (opened.book.metadata.id !== options.bookId) throw Error('BOOK_ID_MISMATCH');
      const { editor, surfaces } = this.context.factory(
        opened,
        {
          undo: () => this.undo(),
          redo: () => this.redo(),
          save: () => {
            void this.save().catch(() => {});
          },
          format: (mark) => this.format(mark),
          archive: () => {
            if (this.writable()) this.editor?.archive();
          },
        },
        () => this.emit(),
      );
      this.editor = editor;
      this.surfaces = surfaces;
      this.lease = opened.lease;
      this.versions = opened.versions;
      this.state = {
        ...options,
        title: editor.title,
        subtitle: '',
        author: editor.author,
        readOnly: opened.readOnly || !opened.lease,
        dirty: false,
        saving: false,
        closing: false,
        blocked: false,
        failure: null,
        focus: null,
      };
      this.session = new AuthoringSession(editor, async (checkpoint) => {
        if (!this.lease || !this.versions || this.state?.blocked) throw Error('LEASE_UNAVAILABLE');
        const lease = this.lease;
        const receipt = SaveReply.parse(
          await this.context.request('checkpoint', {
            bookId: options.bookId,
            lease: this.lease,
            checkpoint,
            expected: this.versions,
          }),
        );
        if (this.state?.blocked || this.lease !== lease) throw Error('SAVE_UNCERTAIN');
        if (receipt.revision !== checkpoint.book.revision) throw Error('SAVE_REVISION_MISMATCH');
        this.versions = receipt.versions;
      });
      if (editor.revision > opened.book.revision && !this.state.readOnly) this.session.changed();
      this.unsubscribe = editor.subscribe((event) => {
        if (event.kind === 'changed') this.changed();
        else this.emit();
      });
      const library = this.context.library();
      editor.configureTypography({
        language: typeof library.spellLanguage === 'string' ? library.spellLanguage : 'en',
        interfaceLanguage: typeof library.language === 'string' ? library.language : 'en',
        markdown: !library.markdownOff,
      });
      surfaces.configurePresentation({
        language: typeof library.language === 'string' ? library.language : 'en',
        publicationPage: {
          kind: options.kind,
          label: options.label,
          ...(options.kind === 'dedication'
            ? { placeholder: this.context.t('For…') }
            : options.kind === 'epigraph'
              ? { placeholder: '…' }
              : options.kind === 'part'
                ? { placeholder: this.context.t('Title') }
                : {}),
        },
      });
      if (!editor.chapters.length && this.writable()) editor.createChapter('');
      if (options.kind === 'cover' && this.writable()) {
        editor.setMetadata({
          title: options.shelfName || editor.title,
          author: editor.author || options.authorName || '',
        });
        this.focusField('title', true);
      }
      this.emit();
      await this.context.rendered();
    } catch (error) {
      if (!this.editor && opened)
        await this.context
          .request('closeBook', { bookId: options.bookId, lease: opened.lease })
          .catch(() => {});
      this.context.error(error);
      throw error;
    } finally {
      this.opening = false;
    }
  }
  bind(body: HTMLElement, auxiliary: HTMLElement) {
    if (!this.editor || !this.surfaces || !this.state || this.state.kind === 'cover') return;
    const id = this.editor.chapters[0]?.id;
    if (!id || this.mounted === body) return;
    this.mounted = body;
    this.enabled = !this.state.readOnly && !this.state.blocked && !this.finishing;
    this.surfaces.render(
      body,
      auxiliary,
      id,
      'manuscript',
      !this.state.readOnly && !this.state.blocked && !this.finishing,
    );
    if (!this.state.readOnly) {
      const rows = this.editor.passageRows(id),
        last = rows.at(-1);
      if (last) this.editor.selectPassage(last.id, last.size, last.size);
      this.surfaces.focus();
    }
  }
  private writable() {
    return Boolean(this.state && !this.state.readOnly && !this.state.blocked && !this.finishing);
  }
  edit(field: TitleField, text: string) {
    if (!this.writable() || !this.editor) return;
    this.editor.setMetadata({ [field]: text.replace(/[\r\n]+/g, ' ').slice(0, 500) });
  }
  pasteTitle(field: TitleField, text: string, from: number, to: number) {
    if (!this.state || !this.writable()) return;
    const before = this.state[field],
      insertion = text.replace(/\s+/g, ' ');
    const start = Math.max(0, Math.min(before.length, from)),
      end = Math.max(start, Math.min(before.length, to));
    this.edit(field, before.slice(0, start) + insertion + before.slice(end));
    this.focusField(field, false, Math.min(500, start + insertion.length));
  }
  focusField(field: TitleField, select = false, offset?: number) {
    if (!this.state) return;
    const end = offset ?? this.state[field].length;
    this.state = {
      ...this.state,
      focus: { field, from: select ? 0 : end, to: end, token: ++this.focusToken },
    };
    this.emit();
  }
  async enter(field: TitleField) {
    if (field === 'title') this.focusField('subtitle');
    else if (field === 'subtitle') this.focusField('author');
    else await this.close();
  }
  undo() {
    if (this.writable()) this.editor?.undo();
  }
  redo() {
    if (this.writable()) this.editor?.redo();
  }
  format(mark: 'bold' | 'italic') {
    if (this.writable()) this.editor?.format(mark);
  }
  async save() {
    this.stopTimer();
    if (!this.state || !this.session || this.state.readOnly) return;
    if (this.state.blocked) throw Error('RECOVERY_REQUIRED');
    this.state = { ...this.state, saving: true, failure: null };
    this.emit();
    try {
      await this.session.flush();
    } catch (error) {
      this.failed(error);
      throw error;
    } finally {
      this.state = { ...this.state, saving: this.finishing };
      this.emit();
    }
  }
  private failed(error: unknown) {
    if (!this.state) return;
    const code =
      error instanceof Error
        ? 'code' in error && typeof error.code === 'string'
          ? error.code
          : error.message
        : '';
    const failure: PublicationPagePresentation['failure'] = ['DISK_FULL', 'ENOSPC'].includes(code)
      ? 'disk'
      : ['EXTERNAL_CHANGE', 'CONFLICT'].includes(code)
        ? 'conflict'
        : ['HOST_UNAVAILABLE', 'HOST_PROTOCOL'].includes(code)
          ? 'host'
          : code === 'SAVE_UNCERTAIN'
            ? 'uncertain'
            : 'unknown';
    this.state = { ...this.state, blocked: failure !== 'disk', failure };
    this.context.error(error);
  }
  hostFailed() {
    this.stopTimer();
    if (this.state) {
      this.state = { ...this.state, blocked: true, failure: 'host' };
      this.emit();
    }
  }
  /** Rebind only an unchanged disk version after host restart; changed disk requires explicit author recovery. */
  rebind(reply: unknown) {
    const opened = OpenReply.parse(reply);
    if (
      !this.state ||
      opened.book.metadata.id !== this.state.bookId ||
      opened.readOnly ||
      !opened.lease
    )
      throw Error('INVALID_REBIND');
    if (
      JSON.stringify(Object.entries(opened.versions).sort()) !==
      JSON.stringify(Object.entries(this.versions ?? {}).sort())
    )
      throw Error('EXTERNAL_CHANGE');
    this.lease = opened.lease;
    this.state = { ...this.state, blocked: false, failure: null };
    this.emit();
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.finishing = true;
    this.closing = this.finish().finally(() => {
      this.closing = null;
      this.finishing = false;
      if (this.state) {
        this.state = { ...this.state, saving: false };
        this.emit();
      }
    });
    return this.closing;
  }
  private async finish() {
    if (!this.state || !this.editor) return;
    this.stopTimer();
    const state = this.state;
    if (state.kind === 'cover' && !state.readOnly && !state.blocked) {
      const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
      const values = {
        title: clean(this.editor.title) || state.shelfName || state.label,
        subtitle: clean(
          typeof this.editor.metadata.subtitle === 'string' ? this.editor.metadata.subtitle : '',
        ),
        author: clean(this.editor.author) || state.authorName || '',
      };
      if (
        values.title !== this.editor.title ||
        values.subtitle !== (this.editor.metadata.subtitle ?? '') ||
        values.author !== this.editor.author
      )
        this.editor.setMetadata(values);
    }
    await this.save();
    if (state.kind === 'cover' && !state.readOnly) {
      try {
        await this.context.saveTitlePage?.(
          state.bookId,
          {
            title: this.editor.title,
            subtitle:
              typeof this.editor.metadata.subtitle === 'string'
                ? this.editor.metadata.subtitle
                : '',
            author: this.editor.author,
          },
          state.shelfId,
        );
        this.titlePending = false;
      } catch (error) {
        this.failed(error);
        throw error;
      }
    }
    await this.context.request('closeBook', { bookId: state.bookId, lease: this.lease });
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.surfaces?.destroy();
    this.surfaces = null;
    this.editor = null;
    this.session = null;
    this.mounted = null;
    this.enabled = null;
    this.lease = null;
    this.state = null;
    this.titlePending = false;
    this.context.publish(null);
    await this.context.refreshLibrary();
  }
}
