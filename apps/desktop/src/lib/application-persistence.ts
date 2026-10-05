import type { DocumentSnapshotValue } from '@leafloom/editor-contracts';
import { AuthoringSession } from '@leafloom/authoring';
import { DocumentChangeSchema, type HostMethod, type HostPayload } from '@leafloom/desktop-host';
import { Metadata } from '@leafloom/document-contracts';
import {
  OpenReply,
  parseRemotePosition,
  type EditorPort,
  type RemotePosition,
  type SurfacePort,
} from '@leafloom/editor-contracts';
import { translate } from '@leafloom/language-contracts';
import { moveBook, type LibraryValue } from '@leafloom/library';
import { z } from 'zod';
import type { AppState } from './application';
import { HostRecoveryViewModel } from './host-recovery';
import { PublicationPageViewModel } from './publication-page';


export interface ApplicationPersistenceContext {
  editor: EditorPort | null;
  publicationPageViewModel: PublicationPageViewModel;
  save: () => Promise<void>;
  flushAppearance: () => Promise<void>;
  fail: (error: unknown) => void;
  externalReconciliation: Promise<void> | null;
  hostRecoveryViewModel: HostRecoveryViewModel;
  flushStickyEdits: () => void;
  value: AppState;
  timer: NodeJS.Timeout | null;
  rememberReadingPosition: () => void;
  session: AuthoringSession | null;
  request: <M extends HostMethod>(method: M, payload: HostPayload<M>) => Promise<unknown>;
  patch: (patch: Partial<AppState>) => void;
  documentChanged: (raw: unknown) => Promise<void>;
  committedDocument: DocumentSnapshotValue | null;
  documentVersions: Record<'reviews' | 'notes' | 'outline' | 'manuscript', string> | null;
  lease: string | null;
  rendered: () => Promise<void>;
  pendingRemotePosition: { bookId: string; position: RemotePosition } | null;
  tryRemotePosition: () => boolean;
  closeBook: (save?: boolean) => Promise<void>;
  openBook: (id: string) => Promise<void>;
  surfaces: SurfacePort<HTMLElement> | null;
  updateLibrary: (value: LibraryValue, history?: boolean) => Promise<void>;
}

export async function flushForBackground(context: ApplicationPersistenceContext): Promise<void> {
  if (context.editor || context.publicationPageViewModel.active) await context.save();
}

export async function save(context: ApplicationPersistenceContext): Promise<void> {
  try {
    await context.flushAppearance();
  } catch (error) {
    context.fail(error);
  }
  if (context.externalReconciliation) await context.externalReconciliation;
  if (context.hostRecoveryViewModel.blocked) throw Error('HOST_RECOVERY_REQUIRED');
  if (context.publicationPageViewModel.active) {
    await context.publicationPageViewModel.save();
    return;
  }
  context.flushStickyEdits();
  if (context.value.externalChange) throw Error('EXTERNAL_CHANGE');
  if (context.timer) {
    clearTimeout(context.timer);
    context.timer = null;
  }
  context.rememberReadingPosition();
  try {
    await context.session?.flush();
  } catch (error) {
    // A failed durable write remains dirty. Log only a bounded category;
    // host messages, file paths and author content never enter diagnostics.
    if (
      error instanceof Error &&
      ['DISK_ERROR', 'DISK_FULL', 'SAVE_UNCERTAIN'].includes(error.message)
    ) {
      try {
        await context.request('reportRuntimeError', {
          source: 'host',
          code: 'UNEXPECTED_RUNTIME',
          at: new Date().toISOString(),
        });
      } catch {
        /* diagnostics must not replace the original save failure */
      }
    }
    throw error;
  }
  context.patch({ dirty: context.session?.dirty ?? false });
}

export async function documentChanged(
  context: ApplicationPersistenceContext,
  raw: unknown,
): Promise<void> {
  const change = DocumentChangeSchema.parse(raw);
  if (change.bookId !== context.value.book?.id) return;
  if (context.externalReconciliation) {
    await context.externalReconciliation;
    if (change.bookId === context.value.book?.id) await context.documentChanged(change);
    return;
  }
  if (context.timer) {
    clearTimeout(context.timer);
    context.timer = null;
  }
  const renewedDirectory = change.code === 'RECOVERY_REQUIRED' && Boolean(change.versions);
  if (
    (change.code && !renewedDirectory) ||
    !context.editor ||
    !context.session ||
    !context.committedDocument
  ) {
    context.patch({ externalChange: change });
    return;
  }
  if (
    !renewedDirectory &&
    change.versions &&
    context.documentVersions &&
    Object.entries(change.versions).every(
      ([name, hash]) =>
        context.documentVersions![name as keyof typeof context.documentVersions] === hash,
    )
  ) {
    if (
      context.value.externalChange?.code === 'UNAVAILABLE' ||
      context.value.externalChange?.code === 'CORRUPT'
    ) {
      // A successful host read verified every original hash. Resume the same
      // author session rather than rebuilding its document, caret or history.
      context.patch({
        externalChange: null,
        hint: translate(context.value.language, 'Writing resumed'),
      });
      if (context.session.dirty) await context.save();
    }
    return;
  }
  const editor = context.editor,
    session = context.session,
    id = change.bookId;
  const reconcile = async () => {
    // Finish the already dispatched write, never flush dirty local prose over incoming files.
    await session.settle().catch(() => {});
    if (context.editor !== editor || context.value.book?.id !== id) return;
    context.flushStickyEdits();
    const baseline = context.committedDocument!;
    await context.request('closeBook', { bookId: id, lease: context.lease });
    context.lease = null;
    context.documentVersions = null;
    let opened: z.infer<typeof OpenReply>;
    try {
      opened = OpenReply.parse(await context.request('openBook', { bookId: id }));
    } catch (error) {
      context.patch({ externalChange: { bookId: id, code: 'UNAVAILABLE' } });
      throw error;
    }
    if (context.editor !== editor || context.value.book?.id !== id) {
      await context.request('closeBook', { bookId: id, lease: opened.lease });
      return;
    }
    context.lease = opened.lease;
    context.documentVersions = opened.versions;
    if (!opened.lease || opened.readOnly) {
      context.patch({
        readOnly: true,
        externalChange: change,
        hint: 'Read-only: this book is already open. Your local writing is preserved.',
      });
      return;
    }
    const incoming = {
      book: opened.book,
      reviews: opened.reviews,
      notes: opened.notes,
      outline: opened.outline,
    };
    const scroller = document.querySelector<HTMLElement>('#paper-scroll'),
      scroll = scroller?.scrollTop;
    try {
      const outcome = editor.reconcileExternal(baseline, incoming, {
        date: new Date().toISOString(),
        conflictSuffix: translate(context.value.language, 'from other device, {time}', {
          time: new Date().toLocaleTimeString(context.value.language.locale, {
            hour: 'numeric',
            minute: '2-digit',
          }),
        }),
        chapterLabels: Object.fromEntries(
          editor.chapters.map((chapter, index) => [
            chapter.id,
            translate(context.value.language, 'Chapter {n}', { n: index + 1 }),
          ]),
        ),
      });
      context.committedDocument = incoming;
      context.patch({
        externalChange: null,
        readOnly: false,
        hint: outcome.conflictChapterIds.length
          ? translate(
              context.value.language,
              'This chapter also changed on another device. That version is saved as the chapter after it.',
            )
          : outcome.archivedDarlingIds.length
            ? translate(
                context.value.language,
                'Updated from your other device — the text it replaced is in Darlings',
              )
            : translate(context.value.language, 'Updated from your other device'),
      });
      if (outcome.changed) session.changed();
      await context.rendered();
      if (scroller && scroll !== undefined) scroller.scrollTop = scroll;
      const remotePosition = parseRemotePosition(incoming.book.metadata.lastPosition);
      if (
        remotePosition &&
        (!context.pendingRemotePosition ||
          remotePosition.at >= context.pendingRemotePosition.position.at)
      )
        context.pendingRemotePosition = { bookId: id, position: remotePosition };
      context.tryRemotePosition();
      await session.flush();
      context.patch({ dirty: session.dirty });
    } catch (error) {
      context.patch({ externalChange: change });
      throw error;
    }
  };
  const running = reconcile();
  context.externalReconciliation = running;
  try {
    await running;
  } catch (error) {
    if (context.editor === editor && context.value.book?.id === id)
      context.patch({ externalChange: context.value.externalChange ?? change });
    throw error;
  } finally {
    if (context.externalReconciliation === running) context.externalReconciliation = null;
  }
}

export async function reloadExternal(context: ApplicationPersistenceContext): Promise<void> {
  const id = context.value.book?.id,
    caret = context.editor?.selection;
  if (!id) return;
  await context.closeBook(false);
  await context.openBook(id);
  if (caret && context.editor?.restoreSelection(caret)) context.surfaces?.focus();
  context.patch({ hint: 'Reloaded the book changed on disk', externalChange: null });
}

export async function keepExternalCopy(context: ApplicationPersistenceContext): Promise<void> {
  context.flushStickyEdits();
  if (!context.editor || !context.value.book) return;
  const snapshot = context.editor.checkpoint();
  const metadata = Metadata.parse(
    await context.request('createBook', {
      title: context.editor.title + ' — local copy',
      author: context.editor.author,
      kind: String(context.editor.metadata.kind ?? 'novel'),
    }),
  );
  const opened = OpenReply.parse(await context.request('openBook', { bookId: metadata.id }));
  try {
    if (!opened.lease) throw Error('READ_ONLY');
    const version = crypto.randomUUID();
    await context.request('checkpoint', {
      bookId: metadata.id,
      lease: opened.lease,
      expected: opened.versions,
      checkpoint: {
        ...snapshot,
        book: {
          ...snapshot.book,
          version,
          revision: snapshot.book.revision + 1,
          metadata: { ...snapshot.book.metadata, id: metadata.id, title: metadata.title },
        },
        reviews: { ...snapshot.reviews, version, bookId: metadata.id },
      },
    });
  } finally {
    await context.request('closeBook', { bookId: metadata.id, lease: opened.lease });
  }
  const shelf =
    context.value.library.shelves.find((s) => s.bookIds.includes(context.value.book!.id)) ??
    context.value.library.shelves[0];
  if (shelf)
    await context.updateLibrary(
      moveBook(context.value.library, metadata.id, shelf.id, shelf.bookIds.length),
      false,
    );
  await context.closeBook(false);
  await context.openBook(metadata.id);
  context.patch({ hint: 'Your unsaved writing is preserved in a separate book' });
}
