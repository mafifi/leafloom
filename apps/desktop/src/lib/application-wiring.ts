import type { Writable } from 'svelte/store';
import { AuthoringSession, ProgressTracker } from '@leafloom/authoring';
import { type HostMethod, type HostPayload } from '@leafloom/desktop-host';
import { Metadata, type JSONValue } from '@leafloom/document-contracts';
import type { TextTypographyPort } from '@leafloom/editor-contracts';
import { type EditorPort, type OutlineTarget, type SurfacePort } from '@leafloom/editor-contracts';
import { translate } from '@leafloom/language-contracts';
import { Library, type LibraryValue } from '@leafloom/library';
import { z } from 'zod';
import type { AppState, ApplicationPlatform, EditorFactory } from './application-types';
import { CoverArtViewModel } from './cover-art';
import { saveCoverImage } from './cover-image';
import { BrowserReadAloud } from './browser-read-aloud';
import { CoverGoalsViewModel } from './cover-goals';
import { DocumentOutputViewModel } from './document-output';
import { EmailDraftViewModel } from './email-draft';
import { FieldTypographyViewModel } from './field-typography';
import { fontChoices } from './font-choices';
import { FontPickerViewModel } from './font-picker';
import { GoalsViewModel, type GoalsDraft } from './goals';
import { HostRecoveryViewModel } from './host-recovery';
import { KeyboardNavigation } from './keyboard-navigation';
import { LibrarySettingsViewModel } from './library-settings';
import { LibraryViewModel } from './library-view-model';
import { PublicationPageViewModel } from './publication-page';
import { SearchViewModel } from './search-view-model';
import { SpellingViewModel } from './spelling-view-model';

const uuid = () => crypto.randomUUID();

export interface ApplicationWiringContext {
  state: Writable<AppState>;
  value: AppState;
  patch: (patch: Partial<AppState>) => void;
  platform: ApplicationPlatform | undefined;
  fieldTypography: FieldTypographyViewModel | null;
  editor: EditorPort | null;
  publicationPageViewModel: PublicationPageViewModel;
  request: <M extends HostMethod>(method: M, payload: HostPayload<M>) => Promise<unknown>;
  factory: EditorFactory;
  rendered: () => Promise<void>;
  initialize: () => Promise<void>;
  prepareCovers: () => Promise<void>;
  updateLibrary: (value: LibraryValue, history?: boolean) => Promise<void>;
  fail: (error: unknown) => void;
  hostRecoveryViewModel: HostRecoveryViewModel;
  timer: NodeJS.Timeout | null;
  session: AuthoringSession | null;
  pendingStickies: Map<string, string>;
  reopenPublicationPage: () => Promise<void>;
  keepExternalCopy: () => Promise<void>;
  reloadExternal: () => Promise<void>;
  spellingViewModel: SpellingViewModel;
  effectiveSpellLanguage: string;
  documentOutputViewModel: DocumentOutputViewModel;
  writingLanguage: (preferences?: {
    [x: string]: unknown;
    firstRunDone: boolean;
    authorName: string;
    authors: { [x: string]: unknown; id: string; name: string }[];
    currentAuthorId: string;
    shelves: {
      [x: string]: unknown;
      id: string;
      name: string;
      authorId: string;
      bookIds: string[];
      bound?: boolean | undefined;
      binding?:
        | {
            [x: string]: unknown;
            bound: boolean;
            numbering: string;
            parked: { id: string; kind: string; before?: string | null | undefined }[];
          }
        | undefined;
    }[];
    writingStyle: 'pantser' | 'plotter';
    fonts: Record<string, string>;
    pageTheme: string;
  }) => string;
  save: () => Promise<void>;
  writable: () => boolean;
  generatedCover: (id: string) => Promise<string | undefined>;
  emailDraftViewModel: EmailDraftViewModel;
  prompt: (
    title: string,
    value?: string,
    label?: string,
    confirm?: string,
  ) => Promise<string | null>;
  coverArtViewModel: CoverArtViewModel;
  updateCoverMetadata: (
    id: string,
    patch: Record<string, JSONValue>,
    history?: boolean,
  ) => Promise<void>;
  coverGoalsViewModel: CoverGoalsViewModel;
  fontPickerViewModel: FontPickerViewModel;
  previewBodyFont: (font: string) => void;
  preference: (key: string, value: unknown) => Promise<void>;
  keyboardNavigation: KeyboardNavigation;
  readAloud: BrowserReadAloud | null;
  surfaces: SurfacePort<HTMLElement> | null;
  librarySettingsViewModel: LibrarySettingsViewModel;
  closeBook: (save?: boolean) => Promise<void>;
  searchViewModel: SearchViewModel;
  focusOutline: (target?: OutlineTarget) => void;
  libraryViewModel: LibraryViewModel;
  confirm: (title: string, message: string, label?: string) => Promise<boolean>;
  openBook: (id: string) => Promise<void>;
  openPublicationPage: (id: string, label?: string, shelfId?: string) => Promise<void>;
  createPage: (
    shelf: LibraryValue['shelves'][number],
    kind: string,
  ) => Promise<{ [x: string]: z.core.util.JSONType; id: string; title: string; author: string }>;
  goalsViewModel: GoalsViewModel;
  saveGoals: (draft: GoalsDraft) => Promise<void>;
  endSprint: () => void;
  progress: ProgressTracker | null;
}

export function wire(context: ApplicationWiringContext, typography?: TextTypographyPort): void {
  context.state.subscribe((value) => (context.value = value));
  context.readAloud =
    typeof window !== 'undefined' && typeof document !== 'undefined'
      ? new BrowserReadAloud({
          language: () => context.writingLanguage(),
          active: () => context.value.view === 'editor' && Boolean(context.value.book),
          hint: (hint) => context.patch({ hint }),
          t: (key) => translate(context.value.language, key),
        })
      : null;
  context.patch({
    nativeMenus: Boolean(context.platform?.os),
    onboardingFonts: fontChoices(
      context.platform?.platformKind ?? (context.platform?.isMac === false ? 'windows' : 'macos'),
    ),
  });
  if (typography)
    context.fieldTypography = new FieldTypographyViewModel({
      provider: typography,
      editable: () =>
        !context.value.loading &&
        !context.value.readOnly &&
        !context.value.hostRecovery &&
        (!context.value.publicationPage ||
          (!context.value.publicationPage.readOnly && !context.value.publicationPage.blocked)),
      text: (_field, character) => {
        const paragraphs = (id: string) =>
          context.editor
            ?.passageRows(id)
            .map((row) => row.text)
            .join('\n') ?? '';
        return {
          language:
            typeof context.value.library.spellLanguage === 'string' &&
            context.value.library.spellLanguage
              ? context.value.library.spellLanguage
              : context.value.language.locale,
          interfaceLanguage: context.value.language.locale,
          chapterText: '',
          bookText:
            character === '"'
              ? (context.editor?.chapters.map((chapter) => paragraphs(chapter.id)).join('\n') ?? '')
              : '',
        };
      },
    });
  context.publicationPageViewModel = new PublicationPageViewModel({
    request: (method, payload) => context.request(method, payload),
    factory: context.factory,
    library: () => context.value.library,
    rendered: context.rendered,
    publish: (publicationPage) => context.patch({ publicationPage }),
    refreshLibrary: async () => {
      await context.initialize();
      await context.prepareCovers();
    },
    saveTitlePage: async (id, values, shelfId) => {
      const next = structuredClone(context.value.library);
      const shelf = next.shelves.find((row) => row.id === shelfId);
      if (shelf) shelf.name = values.title;
      await context.updateLibrary(next);
    },
    error: (error) => context.fail(error),
    t: (key) => translate(context.value.language, key),
  });
  context.hostRecoveryViewModel = new HostRecoveryViewModel({
    os: context.platform?.os,
    suspendSaves: () => {
      if (context.timer) clearTimeout(context.timer);
      context.timer = null;
    },
    hasBook: () => Boolean(context.value.book || context.value.publicationPage),
    dirty: () =>
      Boolean(
        context.session?.dirty ||
        context.pendingStickies.size ||
        context.publicationPageViewModel.dirty,
      ),
    preserveLocalCopy: () =>
      context.value.publicationPage ? context.reopenPublicationPage() : context.keepExternalCopy(),
    reopenBook: () =>
      context.value.publicationPage ? context.reopenPublicationPage() : context.reloadExternal(),
    refreshLibrary: () => context.initialize(),
    publish: (hostRecovery) => context.patch({ hostRecovery }),
  });
  context.spellingViewModel = new SpellingViewModel({
    editor: () => context.editor,
    request: (method, payload) => context.request(method, payload),
    activeSection: () =>
      context.editor?.activeSection?.id ?? context.editor?.chapters[0]?.id ?? null,
    enabled: () => context.value.spellOn,
    language: () => context.effectiveSpellLanguage,
    error: (error) => context.fail(error),
  });
  context.documentOutputViewModel = new DocumentOutputViewModel({
    snapshot: () => ({
      bookId: context.value.book?.id ?? null,
      title: context.value.book?.title ?? '',
      language: context.writingLanguage(),
    }),
    chapter: (id) => {
      const chapter = context.editor?.chapters.find((row) => row.id === id);
      return chapter
        ? {
            title: chapter.title || chapter.label,
            kind: chapter.kind,
            words: context.editor!.passageRows(id).some((row) => /[\p{L}\p{N}]/u.test(row.text))
              ? 1
              : 0,
          }
        : null;
    },
    save: () => context.save(),
    ensurePublicationIdentity: () => {
      const editor = context.editor;
      if (!editor || typeof editor.metadata.uuid === 'string') return;
      if (!context.writable()) throw Error('READ_ONLY');
      editor.setBookkeeping({ uuid: crypto.randomUUID() });
    },
    generatedCover: (id) => context.generatedCover(id),
    destination: async (name) => (await context.platform?.selectExportFile(name)) ?? null,
    request: (method, payload) => context.request(method, payload),
    os: context.platform?.os,
    hint: (hint) => context.patch({ hint }),
    t: (key, args) => translate(context.value.language, key, args),
  });
  context.emailDraftViewModel = new EmailDraftViewModel({
    snapshot: () => ({
      book: context.value.book
        ? {
            id: context.value.book.id,
            title: context.value.book.title,
            words: context.editor?.words ?? 0,
          }
        : null,
      address:
        typeof context.value.library.emailAddress === 'string'
          ? context.value.library.emailAddress
          : '',
      method:
        context.value.library.emailMethod === 'mail' ||
        context.value.library.emailMethod === 'gmail'
          ? context.value.library.emailMethod
          : null,
      locale: context.value.language.locale,
    }),
    os: context.platform?.os,
    mac: Boolean(context.platform?.isMac),
    prompt: (title, placeholder, value) => context.prompt(title, value, placeholder),
    saveSettings: (emailAddress, emailMethod) =>
      context.updateLibrary(Library.parse({ ...context.value.library, emailAddress, emailMethod })),
    saveBook: () => context.save(),
    generatedCover: (id) => context.generatedCover(id),
    request: (method, payload) => context.request(method, payload),
    publish: (emailSettings) => context.patch({ emailSettings }),
    hint: (hint) => context.patch({ hint }),
    t: (key, args) => translate(context.value.language, key, args),
  });
  context.coverArtViewModel = new CoverArtViewModel({
    saveImage: async (id) => {
      if (context.value.book?.id === id) await context.save();
      await saveCoverImage(
        {
          metadata: async (bookId) =>
            Metadata.parse(await context.request('readBookMeta', { bookId })),
          generated: (bookId) => context.generatedCover(bookId),
          destination: async (name) => (await context.platform?.selectExportFile(name)) ?? null,
          request: (method, payload) => context.request(method, payload),
          hint: (hint) => context.patch({ hint }),
          t: (key, args) => translate(context.value.language, key, args),
        },
        id,
      );
    },
    snapshot: () => context.value,
    requestOS: (method, payload) => {
      if (!context.platform?.os) throw Error('OS_UNAVAILABLE');
      return context.platform.os.request(method, payload);
    },
    requestHost: (method, payload) => context.request(method, payload),
    saveBook: () => context.save(),
    updateMetadata: (id, patch, options) =>
      context.updateCoverMetadata(id, patch, options?.history !== false),
    writeLibrary: (library) => context.updateLibrary(library),
    prepareCovers: () => context.prepareCovers(),
    publish: (coverArt) => context.patch({ coverArt }),
    hint: (hint) => context.patch({ hint }),
    t: (key, args) => translate(context.value.language, key, args),
  });
  context.coverGoalsViewModel = new CoverGoalsViewModel({
    readMetadata: async (id) =>
      context.value.book?.id === id && context.editor
        ? context.editor.metadata
        : Metadata.parse(await context.request('readBookMeta', { bookId: id })),
    updateMetadata: (id, patch) => context.updateCoverMetadata(id, patch),
    prompt: ({ title, help, value }) => context.prompt(title, value, help),
    changed: () => context.prepareCovers(),
    hint: (hint) => context.patch({ hint }),
    t: (key, args) => translate(context.value.language, key, args),
  });
  context.fontPickerViewModel = new FontPickerViewModel({
    requestOS: (method, payload) => {
      if (!context.platform?.os) throw Error('OS_UNAVAILABLE');
      return context.platform.os.request(method, payload);
    },
    snapshotCurrentBodyFont: () => context.value.library.fonts.body,
    preview: (font) => context.previewBodyFont(font),
    commit: (font) => context.preference('fonts', { ...context.value.library.fonts, body: font }),
    publish: (fontPicker) => context.patch({ fontPicker }),
    rendered: () => context.rendered(),
    hint: (hint) => context.patch({ hint }),
    t: (key, args) => translate(context.value.language, key, args),
  });
  context.keyboardNavigation = new KeyboardNavigation({
    snapshot: () => context.value,
    patch: (value) => context.patch(value),
    editor: () => context.editor,
    surfaces: () => context.surfaces,
    rendered: () => context.rendered(),
  });
  context.librarySettingsViewModel = new LibrarySettingsViewModel({
    os: context.platform?.os,
    request: (method, payload) => context.request(method, payload),
    closeBook: () => context.closeBook(),
    publish: (value) => context.patch({ librarySettings: value }),
    hint: (value) => context.patch({ hint: value }),
  });
  context.searchViewModel = new SearchViewModel({
    snapshot: () => context.value,
    patch: (value) => context.patch(value),
    editor: () => context.editor,
    surfaces: () => context.surfaces,
    rendered: () => context.rendered(),
    focusOutline: (target) => context.focusOutline(target),
    writable: () => context.writable(),
  });
  context.libraryViewModel = new LibraryViewModel({
    snapshot: () => context.value,
    patch: (value) => context.patch(value),
    request: (method, payload) => context.request(method, payload),
    writeLibrary: (value, history) => context.updateLibrary(value, history),
    prompt: (...args) => context.prompt(...args),
    confirm: (...args) => context.confirm(...args),
    choose: (title, choices) =>
      new Promise((resolve) =>
        context.patch({
          modal: {
            title,
            value: '',
            label: '',
            confirm: '',
            input: false,
            choices: choices.map((choice) => ({ ...choice, localize: choice.localize ?? false })),
            resolve,
          },
        }),
      ),
    rendered: () => context.rendered(),
    openBook: (id) => context.openBook(id),
    openPage: (id) => context.openPublicationPage(id),
    generatedCover: (id) => context.generatedCover(id),
    createPage: (shelf, kind) => context.createPage(shelf, kind),
    prepareCovers: () => context.prepareCovers(),
    platform: context.platform,
  });
  context.goalsViewModel = new GoalsViewModel(
    () => ({
      title: context.value.book?.title ?? null,
      total: context.editor?.words ?? 0,
      today: context.value.todayWords,
      daily: Number(context.value.library.dailyGoal) || 0,
      book: Number(context.value.book?.wordGoal) || 0,
      cutoff: Number(context.value.library.dayEndsAt) || 0,
      counts: z
        .record(z.string(), z.object({ start: z.number(), end: z.number() }))
        .catch({})
        .parse(context.value.book?.dailyCounts),
      sprint: context.value.sprint,
    }),
    (value) => context.patch({ goals: value }),
    (draft) => context.saveGoals(draft),
    (target) => {
      if (target === null) context.endSprint();
      else {
        context.progress?.start(target);
        context.patch({
          sprint: context.progress?.sprint ?? null,
          hint: translate(context.value.language, 'Sprint started — {n} words. Go.', { n: target }),
        });
      }
    },
  );
}
