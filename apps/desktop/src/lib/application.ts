import { defaultSpellLanguage } from '@leafloom/language-contracts';
import { fontChoices, type FontChoicesValue, type FontPlatform } from './font-choices';
import {
  parseRemotePosition,
  remotePositionEligibility,
  type RemotePosition,
} from '@leafloom/editor-contracts';
import { RuntimeErrorReport, type RuntimeErrorReportValue } from '@leafloom/desktop-host';
import { nativeHistoryField, executeNativeFieldHistory } from './field-history';
import { FieldTypographyViewModel } from './field-typography';
import type { TextTypographyPort, MetadataField } from '@leafloom/editor-contracts';
import { CoverGoalsViewModel } from './cover-goals';
import {
  PublicationPageViewModel,
  type PublicationPagePresentation,
  type TitleField,
} from './publication-page';
import { PageLabels, romanPart } from './library-shelf';
import { HostRecoveryViewModel, type HostRecoveryPresentation } from './host-recovery';
import { normalizeSpellingWord } from './spelling-tokens';
import { SpellingViewModel } from './spelling-view-model';
import { DocumentOutputViewModel, outputFormats, type OutputFormat } from './document-output';
import type { PopupMenuItem } from './popup-menu';
import { EmailDraftViewModel, type EmailPresentation, type EmailMethod } from './email-draft';
import {
  CoverArtViewModel,
  type CoverArtPresentation,
  type CoverArtDraft,
  type CoverChoice,
} from './cover-art';
import { FontPickerViewModel, type FontPickerPresentation } from './font-picker';
import type { PanePreferencePort } from './pane-preferences';
import { keepReadingPlace } from './reading-place';
import { KeyboardNavigation } from './keyboard-navigation';
import type { InformationPresentation } from './information';
import { UpdateViewModel } from './update-view-model';
import { LibrarySettingsViewModel, type LibrarySettingsPresentation } from './library-settings';
import { SearchViewModel, type FindMatch } from './search-view-model';
import { LibraryViewModel, collectionExportChoices } from './library-view-model';
import { GoalsViewModel, type GoalsPresentation, type GoalsDraft } from './goals';
import {
  LanguageCatalog,
  english,
  translate,
  type LanguageCatalogValue,
} from '@leafloom/language-contracts';
import type { CoverProvider, CoverPresentationValue } from '@leafloom/cover-contracts';
import { applyPresentation, bodyFonts, brighterInterface } from './presentation';
import type { Telemetry } from '@leafloom/telemetry-contracts';
import { writable } from 'svelte/store';
import { z } from 'zod';
import { Metadata, type JSONValue } from '@leafloom/document-contracts';
import {
  OpenReply,
  SaveReply,
  type EditorPort,
  type SurfacePort,
  type Annotation,
  type DocumentSnapshotValue,
  type OutlineTarget,
  type OutlineSearchMatch,
  type SearchMatch,
  type SurfaceActions,
} from '@leafloom/editor-contracts';
import { AuthoringSession, ProgressTracker, writingDay } from '@leafloom/authoring';
import {
  Library,
  type LibraryValue,
  createLibrary,
  completeFirstRun,
  createShelf,
  renameShelf,
  deleteShelf,
  moveBook,
  moveShelf,
  addAuthor,
  selectAuthor,
  renameAuthor,
  deleteAuthor,
  bindShelf,
  unbindShelf,
  boundBodyRange,
  PageKinds,
} from '@leafloom/library';
import {
  type UpdateStatusValue,
  DocumentChangeSchema,
  FilesDroppedSchema,
  type DesktopHost,
  type DesktopOS,
  FullscreenChangedSchema,
  type HostMethod,
  type HostPayload,
  type DocumentChange,
} from '@leafloom/desktop-host';
export type BookMetadata = z.infer<typeof Metadata>;
export type Modal = {
  title: string;
  value: string;
  label: string;
  confirm: string;
  input?: boolean;
  choices?: { label: string; value: string; localize?: boolean; description?: string }[];
  resolve: (value: string | null) => void;
};
export type MenuItem = PopupMenuItem;
export type AppState = {
  nativeMenus: boolean;
  publicationPage: PublicationPagePresentation | null;
  loading: boolean;
  hostRecovery: HostRecoveryPresentation | null;
  emailSettings: EmailPresentation | null;
  coverArt: CoverArtPresentation | null;
  fontPicker: FontPickerPresentation | null;
  goals: GoalsPresentation | null;
  librarySettings: LibrarySettingsPresentation | null;
  information: InformationPresentation | null;
  update: UpdateStatusValue | null;
  language: LanguageCatalogValue;
  library: LibraryValue;
  books: BookMetadata[];
  covers: Record<string, CoverPresentationValue>;
  book: BookMetadata | null;
  view: 'library' | 'editor';
  panel: string;
  chapters: EditorPort['chapters'];
  protectedChapterIds: string[];
  outlineRows: EditorPort['outlineRows'];
  contentsRows: ReturnType<EditorPort['contentsRows']>;
  darlings: (EditorPort['darlings'][number] & { preview: string })[];
  stickies: EditorPort['stickies'];
  words: number;
  wordMode: 'book' | 'chapter';
  wordLabel: string;
  positionLabel: string;
  currentChapter: string | null;
  revision: number;
  onboardingFonts: FontChoicesValue;
  dirty: boolean;
  readOnly: boolean;
  externalChange: DocumentChange | null;
  navOpen: boolean;
  sideOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hint: string;
  modal: Modal | null;
  menu: { x: number; y: number; items: MenuItem[]; allowShortcuts?: boolean } | null;
  searchOpen: boolean;
  search: string;
  searchedQuery: string;
  matches: FindMatch[];
  matchIndex: number;
  todayWords: number;
  sprint: { target: number; progress: number; completed: boolean } | null;
  spellOn: boolean;
  zoom: number;
  navPinned: boolean;
  sidePinned: boolean;
};
export type EditorFactory = (
  opened: z.infer<typeof OpenReply>,
  actions: SurfaceActions,
  changed: () => void,
) => { editor: EditorPort; surfaces: SurfacePort<HTMLElement> };
export interface ApplicationPlatform {
  os?: DesktopOS;
  isMac?: boolean;
  platformKind?: FontPlatform;
  panePreferences?: PanePreferencePort;
  selectImportFiles(): Promise<string[]>;
  selectExportFile(name: string): Promise<string | null>;
  selectCoverImage?(): Promise<string | null>;
  showBookFolder?(bookId: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  finishClose(): Promise<void>;
  fullscreen(): Promise<void>;
  print(bookId: string, language: string): Promise<void>;
  writeClipboard?(value: { text: string; html?: string }): Promise<void>;
}
export class Application {
  readonly state = writable<AppState>({
    nativeMenus: false,
    publicationPage: null,
    loading: true,
    hostRecovery: null,
    emailSettings: null,
    coverArt: null,
    fontPicker: null,
    goals: null,
    librarySettings: null,
    information: null,
    update: null,
    language: english,
    onboardingFonts: fontChoices('macos'),
    library: createLibrary(),
    books: [],
    covers: {},
    book: null,
    view: 'library',
    panel: 'manuscript',
    chapters: [],
    protectedChapterIds: [],
    outlineRows: [],
    contentsRows: [],
    darlings: [],
    stickies: [],
    words: 0,
    wordMode: 'book',
    wordLabel: '0 words',
    positionLabel: '',
    currentChapter: null,
    revision: 0,
    dirty: false,
    readOnly: false,
    externalChange: null,
    navOpen: false,
    sideOpen: false,
    canUndo: false,
    canRedo: false,
    hint: '',
    modal: null,
    menu: null,
    searchOpen: false,
    search: '',
    searchedQuery: '',
    matches: [],
    matchIndex: 0,
    todayWords: 0,
    sprint: null,
    spellOn: false,
    zoom: 1,
    navPinned: false,
    sidePinned: false,
  });
  private value!: AppState;
  private publicationPageViewModel: PublicationPageViewModel;
  private hostRecoveryViewModel: HostRecoveryViewModel;
  private spellingViewModel: SpellingViewModel;
  private spellActiveSection: string | null = null;
  private spellLanguageGeneration = 0;
  private spellingMenuGeneration = 0;
  private documentOutputViewModel: DocumentOutputViewModel;
  private emailDraftViewModel: EmailDraftViewModel;
  private coverArtViewModel: CoverArtViewModel;
  private coverGoalsViewModel: CoverGoalsViewModel;
  private fontPickerViewModel: FontPickerViewModel;
  private goalsViewModel: GoalsViewModel;
  private libraryViewModel: LibraryViewModel;
  private searchViewModel: SearchViewModel;
  private librarySettingsViewModel: LibrarySettingsViewModel;
  private fullscreen = false;
  private nativeMenuSignature = '';
  private nativeMenuPending = false;
  private libraryWrites: Promise<void> = Promise.resolve();
  private appearanceTimer: ReturnType<typeof setTimeout> | null = null;
  private appearanceWaiters: { resolve(): void; reject(error: unknown): void }[] = [];
  private libraryGeneration = 0;
  private pendingLibraryWrites = 0;
  private refreshingLibrary = false;
  private bookTransitions: Promise<void> = Promise.resolve();
  private pendingStickies = new Map<string, string>();
  private stickyTimer: ReturnType<typeof setTimeout> | null = null;
  private keyboardNavigation: KeyboardNavigation;
  private fieldTypography: FieldTypographyViewModel | null = null;
  editor: EditorPort | null = null;
  surfaces: SurfacePort<HTMLElement> | null = null;
  private session: AuthoringSession | null = null;
  private lease: string | null = null;
  private documentVersions: z.infer<typeof OpenReply>['versions'] | null = null;
  private committedDocument: DocumentSnapshotValue | null = null;
  private readingActivity = 0;
  private pendingRemotePosition: { bookId: string; position: RemotePosition } | null = null;
  private externalReconciliation: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private previewCache = new Map<string, { html: string; preview: string }>();
  private progress: ProgressTracker | null = null;
  private progressBaseline = 0;
  private tabPlaces = new Map<string, { scroll: number; caret: unknown }>();
  private mountedRoot: HTMLElement | null = null;
  private libraryUndo: LibraryValue[] = [];
  private libraryRedo: LibraryValue[] = [];
  private updates: UpdateViewModel | null = null;
  private updateListeners = new Set<(value: unknown) => void>();
  async initializeUpdates(packaged: boolean) {
    const os = this.platform?.os;
    if (!os) return;
    this.updates ??= new UpdateViewModel(
      {
        status: () => os.request('updateStatus', {}),
        check: () => os.request('checkForUpdates', {}),
        installPending: () => os.request('installUpdatePending', {}),
        subscribe: (listener) => {
          this.updateListeners.add(listener);
          return () => this.updateListeners.delete(listener);
        },
      },
      (update) =>
        this.patch({
          update,
          ...(this.value.information?.kind === 'update'
            ? { information: { ...this.value.information, version: update.version, update } }
            : {}),
        }),
      () => {
        void this.request('reportRuntimeError', {
          source: 'host',
          code: 'UNEXPECTED_RUNTIME',
          at: new Date().toISOString(),
        }).catch(() => {});
      },
    );
    await this.updates.initialize(packaged);
  }
  updateStatusChanged(value: unknown) {
    for (const listener of this.updateListeners) listener(value);
  }
  updateWake() {
    this.updates?.wake();
  }
  disposeUpdates() {
    this.updates?.dispose();
  }
  async restartForUpdate() {
    if (this.value.update?.status !== 'ready' || !this.platform?.os) return;
    await this.platform.os.request('restartToUpdate', {});
  }
  constructor(
    private host: DesktopHost,
    private factory: EditorFactory,
    private rendered: () => Promise<void>,
    private telemetry?: Telemetry,
    private platform?: ApplicationPlatform,
    private preview: (html: string) => string = (html) =>
      html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    private coverProvider?: CoverProvider,
    typography?: TextTypographyPort,
  ) {
    this.state.subscribe((value) => (this.value = value));
    this.patch({
      nativeMenus: Boolean(this.platform?.os),
      onboardingFonts: fontChoices(
        this.platform?.platformKind ?? (this.platform?.isMac === false ? 'windows' : 'macos'),
      ),
    });
    if (typography)
      this.fieldTypography = new FieldTypographyViewModel({
        provider: typography,
        editable: () =>
          !this.value.loading &&
          !this.value.readOnly &&
          !this.value.hostRecovery &&
          (!this.value.publicationPage ||
            (!this.value.publicationPage.readOnly && !this.value.publicationPage.blocked)),
        text: (_field, character) => {
          const paragraphs = (id: string) =>
            this.editor
              ?.passageRows(id)
              .map((row) => row.text)
              .join('\n') ?? '';
          return {
            language:
              typeof this.value.library.spellLanguage === 'string' &&
              this.value.library.spellLanguage
                ? this.value.library.spellLanguage
                : this.value.language.locale,
            interfaceLanguage: this.value.language.locale,
            chapterText: '',
            bookText:
              character === '"'
                ? (this.editor?.chapters.map((chapter) => paragraphs(chapter.id)).join('\n') ?? '')
                : '',
          };
        },
      });
    this.publicationPageViewModel = new PublicationPageViewModel({
      request: (method, payload) => this.request(method, payload),
      factory: this.factory,
      library: () => this.value.library,
      rendered: this.rendered,
      publish: (publicationPage) => this.patch({ publicationPage }),
      refreshLibrary: async () => {
        await this.initialize();
        await this.prepareCovers();
      },
      saveTitlePage: async (id, values, shelfId) => {
        const next = structuredClone(this.value.library);
        const shelf = next.shelves.find((row) => row.id === shelfId);
        if (shelf) shelf.name = values.title;
        await this.updateLibrary(next);
      },
      error: (error) => this.fail(error),
      t: (key) => translate(this.value.language, key),
    });
    this.hostRecoveryViewModel = new HostRecoveryViewModel({
      os: this.platform?.os,
      suspendSaves: () => {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
      },
      hasBook: () => Boolean(this.value.book || this.value.publicationPage),
      dirty: () =>
        Boolean(
          this.session?.dirty || this.pendingStickies.size || this.publicationPageViewModel.dirty,
        ),
      preserveLocalCopy: () =>
        this.value.publicationPage ? this.reopenPublicationPage() : this.keepExternalCopy(),
      reopenBook: () =>
        this.value.publicationPage ? this.reopenPublicationPage() : this.reloadExternal(),
      refreshLibrary: () => this.initialize(),
      publish: (hostRecovery) => this.patch({ hostRecovery }),
    });
    this.spellingViewModel = new SpellingViewModel({
      editor: () => this.editor,
      request: (method, payload) => this.request(method, payload),
      activeSection: () => this.editor?.activeSection?.id ?? this.editor?.chapters[0]?.id ?? null,
      enabled: () => this.value.spellOn,
      language: () => this.effectiveSpellLanguage,
      error: (error) => this.fail(error),
    });
    this.documentOutputViewModel = new DocumentOutputViewModel({
      snapshot: () => ({
        bookId: this.value.book?.id ?? null,
        title: this.value.book?.title ?? '',
        language: this.writingLanguage(),
      }),
      chapter: (id) => {
        const chapter = this.editor?.chapters.find((row) => row.id === id);
        return chapter
          ? {
              title: chapter.title || chapter.label,
              kind: chapter.kind,
              words: this.editor!.passageRows(id).some((row) => /[\p{L}\p{N}]/u.test(row.text))
                ? 1
                : 0,
            }
          : null;
      },
      save: () => this.save(),
      ensurePublicationIdentity: () => {
        const editor = this.editor;
        if (!editor || typeof editor.metadata.uuid === 'string') return;
        if (!this.writable()) throw Error('READ_ONLY');
        editor.setBookkeeping({ uuid: crypto.randomUUID() });
      },
      generatedCover: (id) => this.generatedCover(id),
      destination: async (name) => (await this.platform?.selectExportFile(name)) ?? null,
      request: (method, payload) => this.request(method, payload),
      os: this.platform?.os,
      hint: (hint) => this.patch({ hint }),
      t: (key, args) => translate(this.value.language, key, args),
    });
    this.emailDraftViewModel = new EmailDraftViewModel({
      snapshot: () => ({
        book: this.value.book
          ? { id: this.value.book.id, title: this.value.book.title, words: this.editor?.words ?? 0 }
          : null,
        address:
          typeof this.value.library.emailAddress === 'string'
            ? this.value.library.emailAddress
            : '',
        method:
          this.value.library.emailMethod === 'mail' || this.value.library.emailMethod === 'gmail'
            ? this.value.library.emailMethod
            : null,
        locale: this.value.language.locale,
      }),
      os: this.platform?.os,
      mac: Boolean(this.platform?.isMac),
      prompt: (title, placeholder, value) => this.prompt(title, value, placeholder),
      saveSettings: (emailAddress, emailMethod) =>
        this.updateLibrary(Library.parse({ ...this.value.library, emailAddress, emailMethod })),
      saveBook: () => this.save(),
      generatedCover: (id) => this.generatedCover(id),
      request: (method, payload) => this.request(method, payload),
      publish: (emailSettings) => this.patch({ emailSettings }),
      hint: (hint) => this.patch({ hint }),
      t: (key, args) => translate(this.value.language, key, args),
    });
    this.coverArtViewModel = new CoverArtViewModel({
      snapshot: () => this.value,
      requestOS: (method, payload) => {
        if (!this.platform?.os) throw Error('OS_UNAVAILABLE');
        return this.platform.os.request(method, payload);
      },
      requestHost: (method, payload) => this.request(method, payload),
      saveBook: () => this.save(),
      updateMetadata: (id, patch, options) =>
        this.updateCoverMetadata(id, patch, options?.history !== false),
      writeLibrary: (library) => this.updateLibrary(library),
      prepareCovers: () => this.prepareCovers(),
      publish: (coverArt) => this.patch({ coverArt }),
      hint: (hint) => this.patch({ hint }),
      t: (key, args) => translate(this.value.language, key, args),
    });
    this.coverGoalsViewModel = new CoverGoalsViewModel({
      readMetadata: async (id) =>
        this.value.book?.id === id && this.editor
          ? this.editor.metadata
          : Metadata.parse(await this.request('readBookMeta', { bookId: id })),
      updateMetadata: (id, patch) => this.updateCoverMetadata(id, patch),
      prompt: ({ title, help, value }) => this.prompt(title, value, help),
      changed: () => this.prepareCovers(),
      hint: (hint) => this.patch({ hint }),
      t: (key, args) => translate(this.value.language, key, args),
    });
    this.fontPickerViewModel = new FontPickerViewModel({
      requestOS: (method, payload) => {
        if (!this.platform?.os) throw Error('OS_UNAVAILABLE');
        return this.platform.os.request(method, payload);
      },
      snapshotCurrentBodyFont: () => this.value.library.fonts.body,
      preview: (font) => this.previewBodyFont(font),
      commit: (font) => this.preference('fonts', { ...this.value.library.fonts, body: font }),
      publish: (fontPicker) => this.patch({ fontPicker }),
      rendered: () => this.rendered(),
      hint: (hint) => this.patch({ hint }),
      t: (key, args) => translate(this.value.language, key, args),
    });
    this.keyboardNavigation = new KeyboardNavigation({
      snapshot: () => this.value,
      patch: (value) => this.patch(value),
      editor: () => this.editor,
      surfaces: () => this.surfaces,
      rendered: () => this.rendered(),
    });
    this.librarySettingsViewModel = new LibrarySettingsViewModel({
      os: this.platform?.os,
      request: (method, payload) => this.request(method, payload),
      closeBook: () => this.closeBook(),
      publish: (value) => this.patch({ librarySettings: value }),
      hint: (value) => this.patch({ hint: value }),
    });
    this.searchViewModel = new SearchViewModel({
      snapshot: () => this.value,
      patch: (value) => this.patch(value),
      editor: () => this.editor,
      surfaces: () => this.surfaces,
      rendered: () => this.rendered(),
      focusOutline: (target) => this.focusOutline(target),
      writable: () => this.writable(),
    });
    this.libraryViewModel = new LibraryViewModel({
      snapshot: () => this.value,
      patch: (value) => this.patch(value),
      request: (method, payload) => this.request(method, payload),
      writeLibrary: (value, history) => this.updateLibrary(value, history),
      prompt: (...args) => this.prompt(...args),
      confirm: (...args) => this.confirm(...args),
      choose: (title, choices) =>
        new Promise((resolve) =>
          this.patch({
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
      rendered: () => this.rendered(),
      openBook: (id) => this.openBook(id),
      openPage: (id) => this.openPublicationPage(id),
      generatedCover: (id) => this.generatedCover(id),
      createPage: (shelf, kind) => this.createPage(shelf, kind),
      prepareCovers: () => this.prepareCovers(),
      platform: this.platform,
    });
    this.goalsViewModel = new GoalsViewModel(
      () => ({
        title: this.value.book?.title ?? null,
        total: this.editor?.words ?? 0,
        today: this.value.todayWords,
        daily: Number(this.value.library.dailyGoal) || 0,
        book: Number(this.value.book?.wordGoal) || 0,
        cutoff: Number(this.value.library.dayEndsAt) || 0,
        counts: z
          .record(z.string(), z.object({ start: z.number(), end: z.number() }))
          .catch({})
          .parse(this.value.book?.dailyCounts),
        sprint: this.value.sprint,
      }),
      (value) => this.patch({ goals: value }),
      (draft) => this.saveGoals(draft),
      (target) => {
        if (target === null) this.endSprint();
        else {
          this.progress?.start(target);
          this.patch({
            sprint: this.progress?.sprint ?? null,
            hint: translate(this.value.language, 'Sprint started — {n} words. Go.', { n: target }),
          });
        }
      },
    );
  }
  private patch(patch: Partial<AppState>) {
    this.state.update((s) => ({ ...s, ...patch }));
  }
  async request<M extends HostMethod>(method: M, payload: HostPayload<M>): Promise<unknown> {
    const result = this.telemetry
      ? await this.telemetry.async('ui.host.' + method.toLowerCase(), (carrier) =>
          this.host.request(method, payload, carrier),
        )
      : await this.host.request(method, payload);
    if (!result.ok) throw Error(result.code);
    return result.value;
  }
  async initialize() {
    try {
      await this.libraryWrites;
      const [raw, books, language] = await Promise.all([
        this.request('readLibrary', {}),
        this.request('listBooks', {}),
        this.request('getLanguage', {}),
      ]);
      const library = raw === null ? createLibrary() : Library.parse(raw);
      this.patch({
        library,
        language: LanguageCatalog.parse(language),
        books: z.array(Metadata).parse(books),
        loading: false,
        zoom: Number(library.pageZoom) || 1,
        navPinned: this.platform?.panePreferences?.read().nav ?? this.value.navPinned,
        sidePinned: this.platform?.panePreferences?.read().side ?? this.value.sidePinned,
      });
      applyPresentation(library);
      this.applyPlatformDropcap();
      this.previewBodyFont(library.fonts.body);
      await this.synchronizeMenu();
      if (this.platform?.os)
        this.fullscreenChanged(await this.platform.os.request('getWindowState', {}));
      void this.background(() => this.prepareCovers());
      if (this.platform?.os && !this.hostRecoveryViewModel.blocked)
        void this.background(async () => {
          for (const book of this.value.books) {
            await this.coverArtViewModel.recover(book);
          }
        });
    } catch (error) {
      this.fail(error);
      this.patch({ loading: false });
    }
  }
  private writingLanguage(preferences = this.value.library) {
    return typeof preferences.spellLanguage === 'string' && preferences.spellLanguage
      ? preferences.spellLanguage
      : this.value.language.locale;
  }
  private get effectiveSpellLanguage() {
    return typeof this.value.library.spellLanguage === 'string' && this.value.library.spellLanguage
      ? this.value.library.spellLanguage
      : defaultSpellLanguage(this.value.language.locale);
  }
  bodyFontStyle(font: string) {
    return (
      this.value.onboardingFonts.bodyStacks[font] ??
      (Object.hasOwn(bodyFonts, font)
        ? bodyFonts[font]
        : `"${font.replace(/["\\]/g, '')}", Georgia, serif`)
    );
  }
  private applyPlatformDropcap() {
    document.documentElement.style.setProperty(
      '--dropcap-font',
      this.value.onboardingFonts.dropcaps[this.value.library.fonts.dropcap] ??
        this.value.onboardingFonts.dropcaps.literary,
    );
  }
  private previewBodyFont(font: string) {
    keepReadingPlace(() =>
      document.documentElement.style.setProperty('--body-font', this.bodyFontStyle(font)),
    );
  }
  private overlayOpen() {
    return Boolean(
      this.value.modal ||
      this.value.goals ||
      this.value.librarySettings ||
      this.value.information ||
      this.value.coverArt ||
      this.value.fontPicker ||
      this.value.emailSettings ||
      this.value.publicationPage,
    );
  }
  async refreshLibraryFromDisk(): Promise<void> {
    if (this.value.view === 'editor') {
      if (!this.externalReconciliation && this.tryRemotePosition()) await this.save();
      return;
    }
    if (this.value.view === 'library' && (this.pendingLibraryWrites || this.appearanceTimer)) {
      await this.flushAppearance();
      await this.libraryWrites;
      // Keep the focus intent after a durable write whose host reply is still pending.
      // The subsequent fresh read retains the normal generation/view guards.
      return this.refreshLibraryFromDisk();
    }
    if (
      this.refreshingLibrary ||
      this.value.view !== 'library' ||
      this.value.loading ||
      this.pendingLibraryWrites ||
      this.appearanceTimer
    )
      return;
    this.refreshingLibrary = true;
    const generation = this.libraryGeneration;
    try {
      const raw = await this.request('readLibrary', {});
      if (
        generation !== this.libraryGeneration ||
        this.pendingLibraryWrites ||
        this.value.view !== 'library'
      )
        return;
      if (raw === null) return;
      const library = Library.parse(raw);
      if (!library.firstRunDone || JSON.stringify(library) === JSON.stringify(this.value.library))
        return;
      const shelf = document.getElementById('bookshelf-view');
      const scroll = shelf?.scrollTop;
      this.patch({ library });
      applyPresentation(library);
      this.applyPlatformDropcap();
      await this.rendered();
      if (shelf && scroll !== undefined) shelf.scrollTop = scroll;
      await this.synchronizeMenu();
      void this.background(() => this.prepareCovers());
    } finally {
      this.refreshingLibrary = false;
    }
  }
  hostFailed(value: unknown) {
    this.hostRecoveryViewModel.failed(value);
    this.publicationPageViewModel.hostFailed();
  }
  async recoverHost() {
    await this.hostRecoveryViewModel.recover();
    // Freshly reopened cores may update bookkeeping while automatic saves are suspended.
    // Flush only after recovery has rebound the session and released its old-lease guard.
    await this.save();
  }
  async emailDraft() {
    if (!this.overlayOpen()) await this.emailDraftViewModel.draft();
  }
  async openEmailSettings() {
    if (!this.overlayOpen()) await this.emailDraftViewModel.settings();
  }
  chooseEmailMethod(method: EmailMethod) {
    return this.emailDraftViewModel.choose(method);
  }
  closeEmailSettings() {
    this.emailDraftViewModel.cancel();
  }
  async openCoverSettings() {
    if (this.overlayOpen()) return;
    if (!this.platform?.os) {
      this.patch({ hint: 'Cover art is available in the desktop app' });
      return;
    }
    await this.coverArtViewModel.openSettings();
  }
  editCoverSettings(field: keyof CoverArtDraft, value: string | boolean) {
    this.coverArtViewModel.edit(field, value);
  }
  saveCoverSettings() {
    return this.coverArtViewModel.saveSettings();
  }
  closeCoverArt() {
    this.coverArtViewModel.cancel();
  }
  async openCoverChoices(id: string) {
    if (this.overlayOpen()) return;
    if (!this.platform?.os) {
      await this.regenerateCover(id);
      return;
    }
    await this.coverArtViewModel.openChoices(id);
  }
  chooseCover(id: string, choice: CoverChoice) {
    return this.coverArtViewModel.choose(id, choice);
  }
  coverArtProgress(value: unknown) {
    return this.coverArtViewModel.progress(value);
  }
  async openFontPicker() {
    if (!this.overlayOpen()) await this.fontPickerViewModel.open();
  }
  searchFonts(query: string) {
    this.fontPickerViewModel.search(query);
  }
  previewFont(font: string) {
    this.fontPickerViewModel.hover(font);
  }
  leaveFontList() {
    this.fontPickerViewModel.leave();
  }
  chooseFont(font: string) {
    return this.fontPickerViewModel.choose(font);
  }
  fontPickerEnter() {
    return this.fontPickerViewModel.enter();
  }
  closeFontPicker() {
    this.fontPickerViewModel.cancel();
  }
  private async updateCoverMetadata(id: string, patch: Record<string, JSONValue>, history = true) {
    let metadata: BookMetadata;
    if (this.value.book?.id === id && this.editor) {
      if (!this.writable()) throw Error('READ_ONLY');
      if (history) this.editor.updateMetadata(patch);
      else
        this.editor.setCoverBookkeeping(
          z
            .object({ coverArt: z.json().optional(), coverMode: z.literal('painted').optional() })
            .strict()
            .parse(patch),
        );
      metadata = this.editor.metadata;
      await this.save();
    } else {
      const fresh = Metadata.parse(await this.request('readBookMeta', { bookId: id }));
      metadata = Metadata.parse(
        await this.request('writeBookMeta', {
          bookId: id,
          metadata: Metadata.parse({ ...fresh, ...patch }),
        }),
      );
    }
    this.patch({ books: this.value.books.map((book) => (book.id === id ? metadata : book)) });
  }
  private coverGeneration = 0;
  private async prepareCovers() {
    if (!this.coverProvider) return;
    const generation = ++this.coverGeneration;
    const covers: Record<string, CoverPresentationValue> = {};
    const visible = new Set(
      this.value.library.shelves
        .filter((shelf) => shelf.authorId === this.value.library.currentAuthorId)
        .flatMap((shelf) => shelf.bookIds),
    );
    for (const book of this.value.books.filter((book) => visible.has(book.id))) {
      const image =
        book.coverMode === 'abstract'
          ? null
          : await this.request('readCover', {
              bookId: book.id,
              ...(book.coverMode === 'painted'
                ? { mode: 'painted' }
                : book.coverMode === 'image'
                  ? { mode: 'image' }
                  : {}),
            });
      covers[book.id] = await this.coverProvider.render(
        {
          id: book.id,
          title: book.title,
          author: book.author,
          ...(typeof book.coverSeed === 'string' ? { coverSeed: book.coverSeed } : {}),
        },
        typeof image === 'string' ? image : undefined,
      );
      if (generation !== this.coverGeneration) return;
    }
    this.patch({ covers });
  }
  private writable() {
    if (this.editor && this.value.readOnly) {
      this.patch({ hint: 'Read-only: this book is already open' });
      return false;
    }
    return true;
  }
  private runtimeFailureNotified = false;
  async reportRuntimeFailure(value: RuntimeErrorReportValue): Promise<void> {
    const report = RuntimeErrorReport.parse(value);
    if (!this.runtimeFailureNotified) {
      this.runtimeFailureNotified = true;
      this.patch({ hint: translate(this.value.language, 'An unexpected error occurred') });
    }
    try {
      await this.request('reportRuntimeError', report);
    } catch {
      /* diagnostics are best effort */
    }
  }
  private fail(error: unknown) {
    this.patch({ hint: error instanceof Error ? error.message : 'Unable to complete operation' });
  }
  async background(command: () => void | Promise<void>) {
    try {
      await command();
    } catch (error) {
      this.fail(error);
    }
  }
  async execute(command: () => void | Promise<void>, options: { closeMenu?: boolean } = {}) {
    if (options.closeMenu !== false) this.patch({ menu: null });
    try {
      await command();
    } catch (error) {
      this.fail(error);
    }
  }
  prompt(title: string, value = '', label = 'Name', confirm = 'Save'): Promise<string | null> {
    return new Promise((resolve) =>
      this.patch({ modal: { title, value, label, confirm, resolve } }),
    );
  }
  modalValue(value: string) {
    if (this.value.modal) this.patch({ modal: { ...this.value.modal, value } });
  }
  answer(value: string | null) {
    this.value.modal?.resolve(value);
    this.patch({ modal: null });
  }
  menu(event: MouseEvent, items: MenuItem[]) {
    event.preventDefault();
    event.stopPropagation();
    let x = event.clientX,
      y = event.clientY;
    if (!x && !y && event.currentTarget instanceof HTMLElement) {
      const bounds = event.currentTarget.getBoundingClientRect();
      x = bounds.left + 12;
      y = bounds.bottom;
    }
    this.patch({ menu: { x, y, items } });
  }
  dismissHint() {
    this.patch({ hint: '' });
  }
  dismissMenu() {
    this.patch({ menu: null });
  }
  async updateLibrary(value: LibraryValue, history = false) {
    const next = Library.parse(structuredClone(value));
    if (history) {
      this.libraryUndo.push(this.value.library);
      this.libraryRedo = [];
    }
    this.libraryGeneration++;
    this.pendingLibraryWrites++;
    this.patch({ library: next });
    keepReadingPlace(() => {
      applyPresentation(next);
      this.applyPlatformDropcap();
      document.documentElement.style.setProperty(
        '--body-font',
        this.bodyFontStyle(next.fonts.body),
      );
    });
    const write = this.libraryWrites
      .catch(() => {})
      .then(async () => {
        await this.request('writeLibrary', { library: z.record(z.string(), z.json()).parse(next) });
      });
    this.libraryWrites = write.catch(() => {});
    try {
      await write;
    } finally {
      this.pendingLibraryWrites--;
    }
  }
  async onboard(
    name: string,
    style: 'pantser' | 'plotter',
    pen = '',
    fonts = { body: 'Georgia', dropcap: 'literary' },
  ) {
    const library = completeFirstRun(this.value.library, name.trim() || pen.trim());
    library.penNames = pen ? [pen] : [];
    library.writingStyle = style;
    library.fonts = fonts;
    await this.updateLibrary(library, false);
  }
  newShelf(...args: Parameters<LibraryViewModel['newShelf']>) {
    return this.libraryViewModel.newShelf(...args);
  }
  renameShelf(...args: Parameters<LibraryViewModel['renameShelf']>) {
    return this.libraryViewModel.renameShelf(...args);
  }
  deleteShelf(...args: Parameters<LibraryViewModel['deleteShelf']>) {
    return this.libraryViewModel.deleteShelf(...args);
  }
  async dropShelf(id: string, targetId: string, after: boolean) {
    const shelves = this.value.library.shelves;
    const from = shelves.findIndex((shelf) => shelf.id === id);
    const target = shelves.findIndex((shelf) => shelf.id === targetId);
    if (
      from < 0 ||
      target < 0 ||
      from === target ||
      shelves[from].authorId !== shelves[target].authorId
    )
      return;
    const insertion = target + (after ? 1 : 0);
    const destination = insertion - (from < insertion ? 1 : 0);
    if (destination !== from) await this.moveShelf(id, destination);
  }
  moveShelf(...args: Parameters<LibraryViewModel['moveShelf']>) {
    return this.libraryViewModel.moveShelf(...args);
  }

  bindShelf(...args: Parameters<LibraryViewModel['bindShelf']>) {
    return this.libraryViewModel.bindShelf(...args);
  }
  private async createPage(shelf: LibraryValue['shelves'][number], kind: string) {
    const defaults = z
      .record(z.string(), z.string())
      .catch({})
      .parse(this.value.library.tabDefaults);
    const author =
      this.value.library.authors.find((a) => a.id === shelf.authorId)?.name ?? 'Anonymous';
    const names: Record<string, string> = {
      cover: shelf.name,
      copyright: 'Copyright',
      dedication: 'Dedication',
      epigraph: 'Epigraph',
      prologue: 'Prologue',
      part: 'Part',
      epilogue: 'Epilogue',
      acknowledgments: 'Acknowledgments',
      about: 'About the Author',
    };
    let metadata = Metadata.parse(
      await this.request('createBook', {
        title:
          kind === 'cover'
            ? shelf.name
            : kind === 'prologue' || kind === 'epilogue'
              ? names[kind]
              : names[kind] + ' — ' + shelf.name,
        author,
        kind,
      }),
    );
    metadata = Metadata.parse(
      await this.request('writeBookMeta', {
        bookId: metadata.id,
        metadata: {
          ...metadata,
          shelfId: shelf.id,
          ...(kind === 'cover' ? { coverSeed: 'bound:' + shelf.id } : {}),
          ...(kind === 'prologue' || kind === 'epilogue'
            ? {
                subtitle: shelf.name,
                tabNames: {
                  notes: defaults.notes ?? 'Notes',
                  outline: defaults.outline ?? 'Outline',
                },
              }
            : {}),
        },
      }),
    );
    if (kind !== 'cover') {
      const opened = OpenReply.parse(await this.request('openBook', { bookId: metadata.id }));
      const { editor, surfaces } = this.factory(
        opened,
        { undo: () => {}, redo: () => {}, save: () => {}, format: () => {}, archive: () => {} },
        () => {},
      );
      try {
        if (!opened.lease) throw Error('READ_ONLY');
        const chapterId = editor.createChapter('');
        if (kind !== 'prologue' && kind !== 'epilogue') editor.setChapterKind(chapterId, kind);
        if (kind === 'copyright') {
          editor.select(chapterId, 1);
          editor.insert(
            translate(this.value.language, 'Copyright © {year} {name}', {
              year: String(new Date().getFullYear()),
              name: author,
            }),
          );
          editor.enter();
          editor.insert(translate(this.value.language, 'All rights reserved.'));
        }
        await this.request('checkpoint', {
          bookId: metadata.id,
          lease: opened.lease,
          checkpoint: editor.checkpoint(),
          expected: opened.versions,
        });
        metadata = editor.metadata;
      } finally {
        surfaces.destroy();
        await this.request('closeBook', { bookId: metadata.id, lease: opened.lease });
      }
    }
    this.patch({ books: [...this.value.books, metadata] });
    return metadata;
  }
  addBoundPage(...args: Parameters<LibraryViewModel['addBoundPage']>) {
    return this.libraryViewModel.addBoundPage(...args);
  }
  newAuthor(...args: Parameters<LibraryViewModel['newAuthor']>) {
    return this.libraryViewModel.newAuthor(...args);
  }
  chooseAuthor(...args: Parameters<LibraryViewModel['chooseAuthor']>) {
    return this.libraryViewModel.chooseAuthor(...args);
  }
  renameAuthor(...args: Parameters<LibraryViewModel['renameAuthor']>) {
    return this.libraryViewModel.renameAuthor(...args);
  }
  deleteAuthor(...args: Parameters<LibraryViewModel['deleteAuthor']>) {
    return this.libraryViewModel.deleteAuthor(...args);
  }
  newBook(...args: Parameters<LibraryViewModel['newBook']>) {
    return this.libraryViewModel.newBook(...args);
  }
  moveBook(...args: Parameters<LibraryViewModel['moveBook']>) {
    return this.libraryViewModel.moveBook(...args);
  }
  moveToAuthor(...args: Parameters<LibraryViewModel['moveToAuthor']>) {
    return this.libraryViewModel.moveToAuthor(...args);
  }
  undoAuthorMove(...args: Parameters<LibraryViewModel['undoAuthorMove']>) {
    return this.libraryViewModel.undoAuthorMove(...args);
  }
  deleteBook(...args: Parameters<LibraryViewModel['deleteBook']>) {
    return this.libraryViewModel.deleteBook(...args);
  }
  async setCoverGoal(id: string) {
    await this.coverGoalsViewModel.set(id);
  }
  async exportBoundBook(shelfId: string) {
    const shelf = this.value.library.shelves.find((candidate) => candidate.id === shelfId);
    if (!shelf) return;
    const selection = await new Promise<string | null>((resolve) => {
      this.patch({
        modal: {
          title: translate(this.value.language, 'Export “{title}”', { title: shelf.name }),
          value: '',
          label: '',
          confirm: '',
          input: false,
          choices: collectionExportChoices.map((choice) => ({ ...choice })),
          resolve,
        },
      });
    });
    const format = collectionExportChoices.find((choice) => choice.value === selection)?.value;
    if (format) await this.exportShelf(shelfId, format);
  }
  exportShelfAnthology(id: string) {
    return this.libraryViewModel.exportShelfAnthology(id);
  }
  async setCover(id: string) {
    const source = await this.platform?.selectCoverImage?.();
    if (!source) return;
    await this.request('setCover', { bookId: id, source });
    await this.updateCoverMetadata(id, { coverImage: 'cover.json', coverMode: 'image' });
    await this.prepareCovers();
  }
  exportShelf(...args: Parameters<LibraryViewModel['exportShelf']>) {
    return this.libraryViewModel.exportShelf(...args);
  }
  shelfNumbering(...args: Parameters<LibraryViewModel['shelfNumbering']>) {
    return this.libraryViewModel.shelfNumbering(...args);
  }
  regenerateCover(...args: Parameters<LibraryViewModel['regenerateCover']>) {
    return this.libraryViewModel.regenerateCover(...args);
  }
  removeCover(...args: Parameters<LibraryViewModel['removeCover']>) {
    return this.libraryViewModel.removeCover(...args);
  }
  renameBook(...args: Parameters<LibraryViewModel['renameBook']>) {
    return this.libraryViewModel.renameBook(...args);
  }
  private async generatedCover(id: string) {
    const book =
      this.value.book?.id === id
        ? (this.editor?.metadata ?? this.value.book)
        : this.value.books.find((row) => row.id === id);
    if (!book || !this.coverProvider?.renderFull) return undefined;
    return this.coverProvider.renderFull({
      id,
      title: book.title,
      author: book.author,
      ...(typeof book.coverSeed === 'string' ? { coverSeed: book.coverSeed } : {}),
    });
  }
  async openPublicationPage(id: string, label?: string, shelfId?: string) {
    const book = this.value.books.find((row) => row.id === id);
    if (!book || !PageKinds.includes(book.kind as (typeof PageKinds)[number]))
      throw Error('INVALID_PAGE_KIND');
    if (book.kind === 'prologue' || book.kind === 'epilogue') {
      await this.openBook(id);
      if (!book.lastPosition && this.editor) {
        const first = this.editor.passageRows(this.editor.chapters[0]?.id)[0];
        if (first) this.editor.selectPassage(first.id, 0, 0);
        await this.rendered();
        this.surfaces?.focus({ preventScroll: true });
        this.surfaces?.revealSelection({ block: 'start', passageId: first?.id });
      }
      return;
    }
    if (this.value.book) await this.closeBook();
    const shelf = this.value.library.shelves.find(
      (row) => row.id === shelfId || row.bookIds.includes(id),
    );
    const kind = book.kind as (typeof PageKinds)[number];
    const part =
      shelf?.bookIds
        .slice(0, shelf.bookIds.indexOf(id) + 1)
        .filter((bookId) => this.value.books.find((row) => row.id === bookId)?.kind === 'part')
        .length ?? 1;
    await this.publicationPageViewModel.open({
      bookId: id,
      kind,
      label:
        label ??
        (kind === 'part'
          ? translate(this.value.language, 'Part {n}', { n: romanPart(part) })
          : translate(this.value.language, PageLabels[kind])),
      shelfId: shelf?.id,
      shelfName: shelf?.name,
      authorName:
        this.value.library.authors.find((row) => row.id === shelf?.authorId)?.name ??
        this.value.library.authorName,
    });
  }
  private async reopenPublicationPage() {
    const id = this.value.publicationPage?.bookId;
    if (!id) return;
    const opened = OpenReply.parse(await this.request('openBook', { bookId: id }));
    try {
      this.publicationPageViewModel.rebind(opened);
    } catch (error) {
      await this.request('closeBook', { bookId: id, lease: opened.lease }).catch(() => {});
      throw error;
    }
  }
  bindPublicationPage(body: HTMLElement, auxiliary: HTMLElement) {
    this.publicationPageViewModel.bind(body, auxiliary);
  }
  editPublicationTitle(field: TitleField, text: string) {
    this.publicationPageViewModel.edit(field, text);
  }
  pastePublicationTitle(field: TitleField, text: string, from: number, to: number) {
    this.publicationPageViewModel.pasteTitle(field, text, from, to);
  }
  async enterPublicationTitle(field: TitleField) {
    await this.publicationPageViewModel.enter(field);
  }
  async closePublicationPage() {
    await this.publicationPageViewModel.close();
  }
  publicationUndo() {
    this.publicationPageViewModel.undo();
  }
  publicationRedo() {
    this.publicationPageViewModel.redo();
  }
  async removeFromShelf(id: string) {
    await this.libraryViewModel.removeFromShelf(id);
  }
  async reshelveBook() {
    await this.libraryViewModel.reshelveBook();
  }
  private transitionBook(command: () => Promise<void>): Promise<void> {
    const transition = this.bookTransitions.then(command);
    this.bookTransitions = transition.catch(() => {});
    return transition;
  }
  openBook(id: string): Promise<void> {
    return this.transitionBook(() => this.openBookNow(id));
  }
  private async openBookNow(id: string) {
    if (this.publicationPageViewModel.active) await this.closePublicationPage();
    if (this.value.book) await this.closeBookNow();
    const opened = OpenReply.parse(await this.request('openBook', { bookId: id }));
    this.lease = opened.lease;
    this.documentVersions = opened.versions;
    this.committedDocument = {
      book: opened.book,
      reviews: opened.reviews,
      notes: opened.notes,
      outline: opened.outline,
    };
    const { editor, surfaces } = this.factory(
      opened,
      {
        undo: () => this.undo(),
        redo: () => this.redo(),
        save: () => void this.execute(() => this.save()),
        format: (mark) => this.format(mark),
        archive: () => this.archive(),
      },
      () => this.project(),
    );
    this.editor = editor;
    this.surfaces = surfaces;
    surfaces.configurePresentation({
      typewriter: Boolean(this.value.library.typewriter),
      focus:
        this.value.library.focusMode === 'sentence'
          ? 'sentence'
          : this.value.library.focusMode
            ? 'paragraph'
            : 'off',
      language: this.value.language.locale,
    });
    surfaces.setVim(Boolean(this.value.library.vimKeys ?? this.value.library.vimMode));
    surfaces.setHooks({
      activate: (target) => {
        if (target.kind === 'sticky') {
          this.showSide(true);
          void this.rendered().then(() =>
            document
              .querySelector<HTMLElement>(`[data-sticky-id="${CSS.escape(target.id)}"] textarea`)
              ?.focus(),
          );
        }
      },
      contextMenu: (target) => void this.execute(() => this.spellingMenu(target)),
      search: () => this.openSearch(),
      copy: (value) => void this.execute(() => this.platform?.writeClipboard?.(value)),
    });
    this.progress = new ProgressTracker(
      {},
      Number(this.value.library.dayEndsAt) || 0,
      () => new Date(),
    );
    this.progress.open(editor.words);
    this.progressBaseline = editor.words;
    editor.configureTypography({
      interfaceLanguage: this.value.language.locale,
      language: this.writingLanguage(),
      markdown: !this.value.library.markdownOff,
    });
    this.session = new AuthoringSession(editor, async (checkpoint) => {
      if (this.editor !== editor || this.value.book?.id !== id) throw Error('CLOSED_BOOK');
      if (!this.lease || !this.documentVersions) throw Error('READ_ONLY');
      const reply = SaveReply.parse(
        await this.request('checkpoint', {
          bookId: id,
          lease: this.lease,
          checkpoint,
          expected: this.documentVersions,
        }),
      );
      if (this.editor !== editor || this.value.book?.id !== id) return;
      this.documentVersions = reply.versions;
      this.committedDocument = {
        book: checkpoint.book,
        reviews: checkpoint.reviews,
        notes: checkpoint.notes,
        outline: checkpoint.outline,
      };
      this.patch({ dirty: editor.revision !== reply.revision });
    });
    this.unsubscribe = editor.subscribe((event) => {
      if (event.kind === 'changed') {
        this.updateProgress();
        this.session?.changed();
        this.patch({ dirty: true });
        this.scheduleSpell();
        if (this.timer) clearTimeout(this.timer);
        if (!this.hostRecoveryViewModel.blocked)
          this.timer = setTimeout(() => void this.background(() => this.save()), 500);
      }
      if (event.kind === 'selection') this.activateSpellingSection();
      this.project();
    });
    this.patch({
      view: 'editor',
      book: opened.book.metadata,
      panel:
        this.value.library.writingStyle === 'plotter' && opened.book.chapters.length === 0
          ? 'outline'
          : 'manuscript',
      readOnly: opened.readOnly,
      hint: opened.recovered
        ? 'Recovered saved book'
        : opened.readOnly
          ? 'Read-only: this book is already open'
          : '',
    });
    if (!opened.readOnly && editor.revision !== opened.book.revision) {
      this.session.changed();
      this.patch({ dirty: true });
      if (!this.hostRecoveryViewModel.blocked)
        this.timer = setTimeout(() => void this.background(() => this.save()), 500);
    }
    if (!opened.readOnly && !editor.chapters.length && this.value.panel === 'outline')
      editor.createChapter('');
    if (!opened.readOnly) {
      const day = writingDay(new Date(), Number(this.value.library.dayEndsAt) || 0),
        counts = z
          .record(z.string(), z.object({ start: z.number(), end: z.number() }))
          .catch({})
          .parse(editor.metadata.dailyCounts);
      if (!counts[day]) counts[day] = { start: editor.words, end: editor.words };
      editor.setBookkeeping({ wordCount: editor.words, dailyCounts: counts });
    }
    this.project();
    await this.rendered();
    if (this.value.panel === 'outline') this.focusOutline(editor.outlineRows[0]);
    else if (!editor.chapters.length) document.querySelector<HTMLElement>('#tp-title')?.focus();
    else {
      const saved = opened.book.metadata.lastPosition;
      if (
        !opened.readOnly &&
        saved &&
        typeof saved === 'object' &&
        !Array.isArray(saved) &&
        typeof saved.chapterId === 'string' &&
        editor.canEdit(saved.chapterId) &&
        editor.restoreSelection(saved)
      ) {
        this.surfaces?.focus({ preventScroll: true });
        this.surfaces?.revealSelection({ viewportFraction: 1 / 3 });
      } else if (
        saved &&
        typeof saved === 'object' &&
        !Array.isArray(saved) &&
        typeof saved.scroll === 'number'
      ) {
        const scroller = document.querySelector<HTMLElement>('#paper-scroll');
        if (scroller) scroller.scrollTop = saved.scroll;
      }
    }
    this.activateSpellingSection();
  }
  project() {
    if (this.telemetry) return this.telemetry.sync('ui.project', () => this.projectState());
    this.projectState();
  }
  private projectState() {
    if (!this.editor) return;
    const editor = this.editor;
    const today = z
      .record(z.string(), z.object({ start: z.number(), end: z.number() }))
      .catch({})
      .parse(editor.metadata.dailyCounts)[
      writingDay(new Date(), Number(this.value.library.dayEndsAt) || 0)
    ];
    const current =
      editor.activeSection?.role === 'chapter'
        ? editor.activeSection.id
        : this.value.currentChapter;
    const chapter = editor.chapters.find((row) => row.id === current),
      numbered = editor.chapters.filter((row) => row.kind === 'chapter');
    const selected = this.value.panel === 'manuscript' ? editor.selectedWords : 0;
    const t = (key: string, args: Record<string, string | number> = {}) =>
      translate(this.value.language, key, args);
    const wordLabel = selected
      ? t('{n} selected', { n: selected })
      : this.value.wordMode === 'book'
        ? t('{n} words', { n: editor.words })
        : chapter?.kind === 'chapter'
          ? t('ch. {ch}: {n} words', {
              ch: chapter.number ?? 0,
              n: editor.wordCountFor(chapter.id),
            })
          : t('{name}: {n} words', {
              name: chapter?.label ?? '',
              n: chapter ? editor.wordCountFor(chapter.id) : 0,
            });
    const stories = editor.chapters.filter((row) =>
      ['chapter', 'unnumbered', 'prologue', 'epilogue', 'interlude'].includes(row.kind),
    );
    const positionLabel = !chapter
      ? numbered.length > 1
        ? t('{n} chapters', { n: numbered.length })
        : ''
      : stories.length === 1 && chapter.kind === 'chapter'
        ? ''
        : chapter.kind === 'chapter'
          ? t('chapter {ch} of {total}', { ch: chapter.number ?? 0, total: numbered.length })
          : t(chapter.label);
    this.patch({
      currentChapter: current,
      wordLabel,
      positionLabel,
      todayWords: today ? today.end - today.start : 0,
      chapters: editor.chapters,
      protectedChapterIds: editor.chapters
        .filter((chapter) => !editor.supported(chapter.id))
        .map((chapter) => chapter.id),
      outlineRows: editor.outlineRows,
      contentsRows: editor.contentsRows(Boolean(this.value.library.customChapterTitles)),
      darlings: editor.darlings.map((darling) => {
        const html =
          darling.html ||
          '<p>' +
            (darling.text ?? '')
              .replaceAll('&', '&amp;')
              .replaceAll('<', '&lt;')
              .replaceAll('>', '&gt;') +
            '</p>';
        let cached = this.previewCache.get(darling.id);
        if (cached?.html !== html) {
          cached = { html, preview: this.preview(html) };
          this.previewCache.set(darling.id, cached);
        }
        return { ...darling, preview: cached.preview };
      }),
      stickies: editor.stickies.map((sticky) => ({
        ...sticky,
        text: this.pendingStickies.get(sticky.id) ?? sticky.text,
      })),
      words: editor.words,
      revision: editor.revision,
      canUndo: editor.canUndo,
      canRedo: editor.canRedo,
      book: this.value.book ? editor.metadata : null,
    });
    this.scheduleMenu();
    void this.rendered().then(() => {
      const root = document.querySelector<HTMLElement>('#chapters'),
        aux = document.querySelector<HTMLElement>('#aux-editor');
      if (root && aux) {
        if (this.mountedRoot !== root) {
          this.surfaces?.renderBook(root, aux, this.value.panel, !this.value.readOnly);
          this.mountedRoot = root;
        } else
          this.surfaces?.update(
            this.editor?.activeSection?.id ?? this.value.chapters[0]?.id ?? '',
            this.value.panel,
            !this.value.readOnly,
          );
      }
    });
  }
  readingActivityOccurred(at = Date.now()) {
    this.readingActivity = Math.max(this.readingActivity, at);
  }
  private rememberReadingPosition() {
    const editor = this.editor;
    if (!editor || this.value.readOnly) return;
    const value = editor.metadata.lastPosition;
    const previous = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const scroll = document.querySelector<HTMLElement>('#paper-scroll')?.scrollTop ?? 0;
    const native = window.getSelection()?.anchorNode;
    const element =
      native?.nodeType === Node.TEXT_NODE
        ? native.parentElement
        : native instanceof Element
          ? native
          : null;
    const selection =
      this.value.panel === 'manuscript' && element?.closest('.chapter-body')
        ? editor.selection
        : null;
    if (selection && editor.chapters.some((chapter) => chapter.id === selection.chapterId)) {
      const pIdx = editor
        .passageRows(selection.chapterId)
        .filter((row) => row.kind === 'paragraph')
        .findIndex((row) => row.id === selection.passageId);
      const same =
        previous.chapterId === selection.chapterId &&
        (previous.passageId === selection.passageId
          ? previous.from === selection.from && previous.to === selection.to
          : previous.pIdx === pIdx &&
            (previous.off ?? 0) === selection.from &&
            selection.from === selection.to);
      editor.setBookkeeping({
        lastPosition: {
          ...selection,
          ...(pIdx >= 0 ? { pIdx, off: selection.from } : {}),
          scroll,
          at: same && typeof previous.at === 'number' ? previous.at : Date.now(),
        },
      });
    } else if (
      typeof previous.chapterId === 'string' &&
      Math.abs((typeof previous.scroll === 'number' ? previous.scroll : 0) - scroll) > 40
    ) {
      editor.setBookkeeping({
        lastPosition: {
          ...previous,
          scroll,
          at: typeof previous.at === 'number' ? previous.at : Date.now(),
        },
      });
    }
  }
  private tryRemotePosition() {
    const pending = this.pendingRemotePosition,
      editor = this.editor;
    if (
      !pending ||
      !editor ||
      pending.bookId !== this.value.book?.id ||
      this.value.readOnly ||
      this.value.externalChange
    )
      return false;
    const position = pending.position,
      chapter = editor.chapters.find((row) => row.id === position.chapterId);
    const rows = chapter ? editor.passageRows(chapter.id) : [];
    const here = editor.metadata.lastPosition;
    const hereAt =
      here && typeof here === 'object' && !Array.isArray(here) && typeof here.at === 'number'
        ? here.at
        : 0;
    if (
      remotePositionEligibility({
        position,
        hereAt,
        lastActivity: this.readingActivity,
        panel: this.value.panel,
        modalOpen: this.overlayOpen(),
        now: Date.now(),
        chapter: chapter
          ? {
              id: chapter.id,
              editable: editor.canEdit(chapter.id),
              paragraphCount: rows.filter((row) => row.kind === 'paragraph').length,
              passageIds: rows.map((row) => row.id),
            }
          : null,
      }) !== 'ready'
    )
      return false;
    const scroller = document.querySelector<HTMLElement>('#paper-scroll');
    if (editor.canEdit(position.chapterId) && ('passageId' in position || 'pIdx' in position)) {
      const target =
        'passageId' in position && rows.some((row) => row.id === position.passageId)
          ? position
          : {
              chapterId: position.chapterId,
              pIdx:
                'pIdx' in position
                  ? (position.pIdx ?? Number.MAX_SAFE_INTEGER)
                  : Number.MAX_SAFE_INTEGER,
              off: 'off' in position ? (position.off ?? 0) : 'from' in position ? position.from : 0,
            };
      if (!editor.restoreSelection(target)) return false;
      this.surfaces?.focus({ preventScroll: true });
      this.surfaces?.revealSelection({ viewportFraction: 1 / 3 });
    } else if (scroller) scroller.scrollTop = position.scroll ?? 0;
    editor.setBookkeeping({
      lastPosition: { ...position, scroll: scroller?.scrollTop ?? position.scroll ?? 0 },
    });
    this.pendingRemotePosition = null;
    this.session?.changed();
    return true;
  }
  async flushForBackground() {
    if (this.editor || this.publicationPageViewModel.active) await this.save();
  }
  async save() {
    try {
      await this.flushAppearance();
    } catch (error) {
      this.fail(error);
    }
    if (this.externalReconciliation) await this.externalReconciliation;
    if (this.hostRecoveryViewModel.blocked) throw Error('HOST_RECOVERY_REQUIRED');
    if (this.publicationPageViewModel.active) {
      await this.publicationPageViewModel.save();
      return;
    }
    this.flushStickyEdits();
    if (this.value.externalChange) throw Error('EXTERNAL_CHANGE');
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.rememberReadingPosition();
    try {
      await this.session?.flush();
    } catch (error) {
      // A failed durable write remains dirty. Log only a bounded category;
      // host messages, file paths and author content never enter diagnostics.
      if (
        error instanceof Error &&
        ['DISK_ERROR', 'DISK_FULL', 'SAVE_UNCERTAIN'].includes(error.message)
      ) {
        try {
          await this.request('reportRuntimeError', {
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
    this.patch({ dirty: this.session?.dirty ?? false });
  }
  closeBook(save = true): Promise<void> {
    return this.transitionBook(() => this.closeBookNow(save));
  }
  private async closeBookNow(save = true) {
    if (this.externalReconciliation) await this.externalReconciliation;
    this.editor?.finishMetadataField();
    if (this.publicationPageViewModel.active) await this.closePublicationPage();
    if (save) await this.save();
    await this.libraryWrites;
    this.searchViewModel.closeSearch();
    this.spellingViewModel.clear();
    this.spellActiveSection = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const id = this.value.book?.id;
    if (id) await this.request('closeBook', { bookId: id, lease: this.lease });
    this.unsubscribe?.();
    this.surfaces?.destroy();
    this.editor = null;
    this.surfaces = null;
    this.mountedRoot = null;
    this.tabPlaces.clear();
    this.session = null;
    this.lease = null;
    this.documentVersions = null;
    this.committedDocument = null;
    this.pendingRemotePosition = null;
    await this.initialize();
    this.patch({ view: 'library', book: null, readOnly: false, externalChange: null });
  }
  async documentChanged(raw: unknown) {
    const change = DocumentChangeSchema.parse(raw);
    if (change.bookId !== this.value.book?.id) return;
    if (this.externalReconciliation) {
      await this.externalReconciliation;
      if (change.bookId === this.value.book?.id) await this.documentChanged(change);
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const renewedDirectory = change.code === 'RECOVERY_REQUIRED' && Boolean(change.versions);
    if (
      (change.code && !renewedDirectory) ||
      !this.editor ||
      !this.session ||
      !this.committedDocument
    ) {
      this.patch({ externalChange: change });
      return;
    }
    if (
      !renewedDirectory &&
      change.versions &&
      this.documentVersions &&
      Object.entries(change.versions).every(
        ([name, hash]) =>
          this.documentVersions![name as keyof typeof this.documentVersions] === hash,
      )
    ) {
      if (
        this.value.externalChange?.code === 'UNAVAILABLE' ||
        this.value.externalChange?.code === 'CORRUPT'
      ) {
        // A successful host read verified every original hash. Resume the same
        // author session rather than rebuilding its document, caret or history.
        this.patch({
          externalChange: null,
          hint: translate(this.value.language, 'Writing resumed'),
        });
        if (this.session.dirty) await this.save();
      }
      return;
    }
    const editor = this.editor,
      session = this.session,
      id = change.bookId;
    const reconcile = async () => {
      // Finish the already dispatched write, never flush dirty local prose over incoming files.
      await session.settle().catch(() => {});
      if (this.editor !== editor || this.value.book?.id !== id) return;
      this.flushStickyEdits();
      const baseline = this.committedDocument!;
      await this.request('closeBook', { bookId: id, lease: this.lease });
      this.lease = null;
      this.documentVersions = null;
      let opened: z.infer<typeof OpenReply>;
      try {
        opened = OpenReply.parse(await this.request('openBook', { bookId: id }));
      } catch (error) {
        this.patch({ externalChange: { bookId: id, code: 'UNAVAILABLE' } });
        throw error;
      }
      if (this.editor !== editor || this.value.book?.id !== id) {
        await this.request('closeBook', { bookId: id, lease: opened.lease });
        return;
      }
      this.lease = opened.lease;
      this.documentVersions = opened.versions;
      if (!opened.lease || opened.readOnly) {
        this.patch({
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
          conflictSuffix: translate(this.value.language, 'from other device, {time}', {
            time: new Date().toLocaleTimeString(this.value.language.locale, {
              hour: 'numeric',
              minute: '2-digit',
            }),
          }),
          chapterLabels: Object.fromEntries(
            editor.chapters.map((chapter, index) => [
              chapter.id,
              translate(this.value.language, 'Chapter {n}', { n: index + 1 }),
            ]),
          ),
        });
        this.committedDocument = incoming;
        this.patch({
          externalChange: null,
          readOnly: false,
          hint: outcome.conflictChapterIds.length
            ? translate(
                this.value.language,
                'This chapter also changed on another device. That version is saved as the chapter after it.',
              )
            : outcome.archivedDarlingIds.length
              ? translate(
                  this.value.language,
                  'Updated from your other device — the text it replaced is in Darlings',
                )
              : translate(this.value.language, 'Updated from your other device'),
        });
        if (outcome.changed) session.changed();
        await this.rendered();
        if (scroller && scroll !== undefined) scroller.scrollTop = scroll;
        const remotePosition = parseRemotePosition(incoming.book.metadata.lastPosition);
        if (
          remotePosition &&
          (!this.pendingRemotePosition ||
            remotePosition.at >= this.pendingRemotePosition.position.at)
        )
          this.pendingRemotePosition = { bookId: id, position: remotePosition };
        this.tryRemotePosition();
        await session.flush();
        this.patch({ dirty: session.dirty });
      } catch (error) {
        this.patch({ externalChange: change });
        throw error;
      }
    };
    const running = reconcile();
    this.externalReconciliation = running;
    try {
      await running;
    } catch (error) {
      if (this.editor === editor && this.value.book?.id === id)
        this.patch({ externalChange: this.value.externalChange ?? change });
      throw error;
    } finally {
      if (this.externalReconciliation === running) this.externalReconciliation = null;
    }
  }
  async reloadExternal() {
    const id = this.value.book?.id,
      caret = this.editor?.selection;
    if (!id) return;
    await this.closeBook(false);
    await this.openBook(id);
    if (caret && this.editor?.restoreSelection(caret)) this.surfaces?.focus();
    this.patch({ hint: 'Reloaded the book changed on disk', externalChange: null });
  }
  async keepExternalCopy() {
    this.flushStickyEdits();
    if (!this.editor || !this.value.book) return;
    const snapshot = this.editor.checkpoint();
    const metadata = Metadata.parse(
      await this.request('createBook', {
        title: this.editor.title + ' — local copy',
        author: this.editor.author,
        kind: String(this.editor.metadata.kind ?? 'novel'),
      }),
    );
    const opened = OpenReply.parse(await this.request('openBook', { bookId: metadata.id }));
    try {
      if (!opened.lease) throw Error('READ_ONLY');
      const version = crypto.randomUUID();
      await this.request('checkpoint', {
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
      await this.request('closeBook', { bookId: metadata.id, lease: opened.lease });
    }
    const shelf =
      this.value.library.shelves.find((s) => s.bookIds.includes(this.value.book!.id)) ??
      this.value.library.shelves[0];
    if (shelf)
      await this.updateLibrary(
        moveBook(this.value.library, metadata.id, shelf.id, shelf.bookIds.length),
        false,
      );
    await this.closeBook(false);
    await this.openBook(metadata.id);
    this.patch({ hint: 'Your unsaved writing is preserved in a separate book' });
  }
  private updateProgress() {
    if (!this.editor || !this.progress) return;
    const words = this.editor.words,
      before = this.progressBaseline,
      delta = words - before;
    this.progressBaseline = words;
    const completed = this.progress.update(words);
    if (delta) {
      const day = writingDay(new Date(), Number(this.value.library.dayEndsAt) || 0);
      const counts = z
        .record(z.string(), z.object({ start: z.number(), end: z.number() }))
        .catch({})
        .parse(this.editor.metadata.dailyCounts);
      const prior = counts[day];
      counts[day] = { start: prior?.start ?? words - delta, end: words };
      this.editor.setBookkeeping({ dailyCounts: counts, wordCount: words });
      this.patch({ todayWords: words - counts[day].start });
      if (
        before < 1000 &&
        words >= 1000 &&
        this.platform?.os &&
        !this.value.readOnly &&
        !this.hostRecoveryViewModel.blocked
      )
        void this.background(() => this.coverArtViewModel.maybePaint(this.editor!.metadata));
    }
    this.patch({ sprint: this.progress.sprint });
    if (completed)
      this.patch({
        hint: translate(this.value.language, 'Sprint complete — {n} words. Well earned.', {
          n: this.progress.sprint?.progress ?? 0,
        }),
      });
  }
  async startSprint() {
    if (!this.progress) return;
    const target = await this.prompt('Writing sprint', '500', 'Words', 'Start');
    if (target === null) return;
    this.progress.start(Math.max(1, Math.floor(Number(target) || 500)));
    this.patch({ sprint: this.progress.sprint });
  }
  endSprint() {
    const result = this.progress?.end();
    this.patch({
      sprint: null,
      hint: result
        ? translate(this.value.language, 'Sprint ended — {n} words in {min} min', {
            n: result.words,
            min: result.minutes,
          })
        : '',
    });
  }
  async showBookFolder(id: string) {
    await this.platform?.showBookFolder?.(id);
  }
  async filesDropped(raw: unknown) {
    const { paths, position, target } = FilesDroppedSchema.parse(raw);
    // A DOM target identifies intent, not authority. Keep the author's identity
    // and target fixed while host replies are pending, then validate live membership.
    const authorId = this.value.library.currentAuthorId;
    const targetShelf = () => {
      if (this.value.library.currentAuthorId !== authorId) return undefined;
      return this.value.library.shelves.find(
        (shelf) =>
          shelf.authorId === authorId &&
          (target?.kind === 'shelf'
            ? shelf.id === target.shelfId
            : target?.kind === 'book'
              ? shelf.bookIds.includes(target.bookId) &&
                this.value.books.some((book) => book.id === target.bookId)
              : true),
      );
    };
    const originalOpenBook = this.value.book?.id;
    let imported = 0;
    let failed = 0;
    for (const source of paths) {
      try {
        const shelf = targetShelf();
        if (!shelf) throw Error('DROP_TARGET_UNAVAILABLE');
        if (/\.(?:png|jpe?g|webp)$/i.test(source)) {
          const bookId =
            target?.kind === 'book'
              ? target.bookId
              : !position && !target && this.value.book?.id === originalOpenBook
                ? originalOpenBook
                : undefined;
          if (!bookId || !shelf.bookIds.includes(bookId)) throw Error('DROP_TARGET_UNAVAILABLE');
          if (this.value.book?.id === bookId && !this.writable()) throw Error('READ_ONLY');
          await this.request('setCover', { bookId, source });
          await this.updateCoverMetadata(bookId, {
            coverImage: 'cover.json',
            coverMode: 'image',
          });
          await this.prepareCovers();
          continue;
        }
        const metadata = Metadata.parse(
          await this.request(
            /\.(?:docx|txt|md)$/i.test(source) ? 'importManuscript' : 'importLegacy',
            { source },
          ),
        );
        this.patch({ books: [...this.value.books, metadata] });
        // Never move the imported book into a different author or destination
        // if the library changed while the import was being decoded.
        if (targetShelf()?.id !== shelf.id) throw Error('DROP_TARGET_UNAVAILABLE');
        await this.moveBook(metadata.id, shelf.id);
        imported++;
      } catch {
        failed++;
      }
    }
    await this.prepareCovers();
    this.patch({
      hint:
        imported || failed
          ? `Imported ${imported} book${imported === 1 ? '' : 's'}${failed ? `; ${failed} failed` : ''}`
          : 'Imported dropped files',
    });
  }
  async importBooks() {
    const paths = (await this.platform?.selectImportFiles()) ?? [];
    let imported = 0;
    let failed = 0;
    for (const source of paths) {
      try {
        const metadata = Metadata.parse(await this.request('importManuscript', { source }));
        this.patch({ books: [...this.value.books, metadata] });
        const shelf = this.value.library.shelves.find(
          (s) => s.authorId === this.value.library.currentAuthorId,
        );
        if (shelf) await this.moveBook(metadata.id, shelf.id);
        imported++;
      } catch {
        failed++;
      }
    }
    if (imported) await this.prepareCovers();
    if (paths.length)
      this.patch({
        hint: `Imported ${imported} book${imported === 1 ? '' : 's'}${failed ? `; ${failed} failed` : ''}`,
      });
  }
  async exportBook(format: OutputFormat) {
    await this.documentOutputViewModel.export(format);
  }
  async exportChapter(id: string) {
    const chapter = this.editor?.chapters.find((row) => row.id === id);
    if (!chapter) return;
    const format = await new Promise<string | null>((resolve) => {
      this.patch({
        modal: {
          title: translate(this.value.language, 'Export “{title}”', {
            title: chapter.title || chapter.label,
          }),
          value: '',
          label: '',
          confirm: '',
          input: false,
          choices: outputFormats.map((format) => ({
            value: format,
            label: {
              txt: 'Text (.txt)',
              md: 'Markdown (.md)',
              html: 'HTML (.html)',
              pdf: 'PDF (.pdf)',
              docx: 'Word (.docx)',
              epub: 'EPUB (.epub)',
            }[format],
          })),
          resolve,
        },
      });
    });
    if (format && outputFormats.includes(format as OutputFormat))
      await this.documentOutputViewModel.export(format as OutputFormat, id);
  }
  async printChapter(id: string) {
    await this.documentOutputViewModel.print(id);
  }
  exportMenu(event: MouseEvent) {
    this.menu(
      event,
      ['txt', 'md', 'html', 'docx', 'epub', 'pdf'].map((format) => ({
        label: 'Export ' + format.toUpperCase(),
        run: () => this.exportBook(format as 'txt' | 'md' | 'html' | 'docx' | 'epub' | 'pdf'),
      })),
    );
  }
  async finishClose() {
    await this.closeBook();
    await this.platform?.finishClose();
  }
  async nativeCommand(command: string) {
    if ((command === 'undo' || command === 'redo') && executeNativeFieldHistory(command)) return;
    if (command === 'reshelve-book') {
      if (!this.overlayOpen()) await this.reshelveBook();
      return;
    }
    if (this.publicationPageViewModel.active) {
      if (command === 'undo') {
        this.publicationPageViewModel.undo();
        return;
      }
      if (command === 'redo') {
        this.publicationPageViewModel.redo();
        return;
      }
      if (command === 'save') {
        await this.save();
        return;
      }
      if (command === 'bold' || command === 'italic') {
        this.publicationPageViewModel.format(command);
        return;
      }
    }
    if (
      this.overlayOpen() &&
      [
        'goals',
        'settings',
        'help',
        'help-shortcuts',
        'about',
        'check-update',
        'library-folder',
        'email-settings',
        'cover-art',
        'body-font-pick',
        'email-draft',
      ].includes(command)
    )
      return;
    const [kind, value] = command.split(':');
    if (value) {
      if (kind === 'writing-style' && (value === 'pantser' || value === 'plotter')) {
        await this.preference('writingStyle', value);
        return;
      }
      if (kind === 'body-font' || kind === 'dropcap') {
        await this.preference('fonts', {
          ...this.value.library.fonts,
          [kind === 'body-font' ? 'body' : 'dropcap']: value,
        });
        return;
      }
      if (kind === 'align' && ['left', 'center', 'right', 'justify'].includes(value)) {
        this.alignParagraph(value as 'left' | 'center' | 'right' | 'justify');
        return;
      }
      if (kind === 'language') {
        const language = LanguageCatalog.parse(
          await this.request('setLanguage', { language: value }),
        );
        this.patch({ language });
        await this.preference('language', value);
        return;
      }
      if (kind === 'spell-language') {
        await this.preference('spellLanguage', value);
        return;
      }
      if (kind === 'page-theme') {
        await this.preference('pageTheme', value);
        return;
      }
      if (kind === 'interface-zoom' && [1, 1.25, 1.5, 2, 2.5, 3].includes(Number(value))) {
        await this.preference('uiZoom', Number(value));
        return;
      }
      if (kind === 'focus') {
        await this.preference('focusMode', value === 'off' ? false : value);
        return;
      }
    }
    const shelf = this.value.library.shelves.find(
      (s) => s.authorId === this.value.library.currentAuthorId,
    );
    switch (command) {
      case 'typewriter':
        await this.preference('typewriter', !this.value.library.typewriter);
        break;
      case 'vim':
        await this.preference('vimKeys', !this.value.library.vimKeys);
        break;
      case 'markdown-emphasis':
        await this.preference('markdownOff', !this.value.library.markdownOff);
        break;
      case 'ui-bright':
        await this.preference('uiBright', !brighterInterface(this.value.library.uiBright));
        break;
      case 'focus-cycle':
        await this.cycleFocus();
        break;
      case 'text-larger':
        await this.textSize(1);
        break;
      case 'text-smaller':
        await this.textSize(-1);
        break;
      case 'text-reset':
        await this.textSize(0);
        break;
      case 'new-book':
        if (shelf) await this.newBook(shelf.id);
        break;
      case 'new-chapter':
        {
          const index =
            this.editor?.chapters.findIndex((ch) => ch.id === this.editor?.activeSection?.id) ?? -1;
          this.createChapter(index < 0 ? undefined : index + 1);
        }
        break;
      case 'import':
        await this.importBooks();
        break;
      case 'save':
        await this.save();
        break;
      case 'export': {
        const format = await this.prompt(
          'Export book',
          'docx',
          'Format (txt, md, html, docx, epub, pdf)',
          'Export',
        );
        if (format && ['txt', 'md', 'html', 'docx', 'epub', 'pdf'].includes(format))
          await this.exportBook(format as 'txt' | 'md' | 'html' | 'docx' | 'epub' | 'pdf');
        break;
      }
      case 'print':
        if (this.value.book) await this.documentOutputViewModel.print();
        break;
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'find':
        this.openSearch();
        break;
      case 'spellcheck':
        this.toggleSpelling();
        break;
      case 'bold':
        this.format('bold');
        break;
      case 'italic':
        this.format('italic');
        break;
      case 'poetry':
        this.togglePoetry();
        break;
      case 'scene-break':
        if (this.writable()) {
          this.editor?.enter();
          this.editor?.enter();
        }
        break;
      case 'zoom-in':
        this.zoom(0.1);
        break;
      case 'zoom-out':
        this.zoom(-0.1);
        break;
      case 'fullscreen':
        await this.platform?.fullscreen();
        break;
      case 'paste-match-style':
        await this.pasteMatchStyle();
        break;
      case 'show-book-folder':
        if (this.value.book) await this.platform?.showBookFolder?.(this.value.book.id);
        break;
      case 'library-folder':
        await this.libraryFolder();
        break;
      case 'help':
        await this.showInformation('shortcuts');
        break;
      case 'help-shortcuts':
        await this.showInformation('shortcuts');
        break;
      case 'about':
        await this.showInformation('about');
        break;
      case 'check-update':
        await this.showInformation('update');
        break;
      case 'email-draft':
        await this.emailDraft();
        break;
      case 'email-settings':
        await this.openEmailSettings();
        break;
      case 'cover-art':
        await this.openCoverSettings();
        break;
      case 'body-font-pick':
        await this.openFontPicker();
        break;
      case 'settings':
      case 'goals':
        this.openGoals();
        break;
    }
  }
  async showInformation(kind: InformationPresentation['kind']) {
    if (this.value.coverArt || this.value.fontPicker || this.value.emailSettings) return;
    if (this.value.information) {
      if (kind === 'shortcuts' && this.value.information.kind === 'shortcuts')
        document.querySelector<HTMLElement>('.shortcuts-content')?.focus();
      return;
    }
    let version = '0.1.0';
    if (this.platform?.os) {
      if (kind === 'update') {
        if (!this.updates) await this.initializeUpdates(false);
        version = this.value.update?.version ?? version;
      } else {
        const raw = await this.platform.os.request('version', {});
        version =
          typeof raw === 'string' ? raw : z.object({ version: z.string() }).parse(raw).version;
      }
    }
    const titles = {
      help: 'Writing with Leafloom',
      shortcuts: 'Keyboard shortcuts',
      about: 'Leafloom',
      update: 'Updates',
    };
    this.patch({
      information: {
        kind,
        title: titles[kind],
        version,
        vim: Boolean(this.value.library.vimKeys),
        ...(kind === 'update' && this.value.update ? { update: this.value.update } : {}),
      },
    });
    if (kind === 'update') await this.updates?.check();
  }
  closeInformation() {
    this.patch({ information: null });
    void this.rendered().then(() => this.surfaces?.focus());
  }
  private scheduleMenu() {
    if (!this.platform?.os || this.nativeMenuPending) return;
    this.nativeMenuPending = true;
    queueMicrotask(() => {
      this.nativeMenuPending = false;
      void this.background(() => this.synchronizeMenu());
    });
  }
  private async synchronizeMenu() {
    const os = this.platform?.os;
    if (!os) return;
    const prefs = this.value.library;
    const state = {
      bodyFont: prefs.fonts.body,
      writingStyle: prefs.writingStyle,
      dropcap: prefs.fonts.dropcap,
      language: this.value.language.locale,
      spellLanguage: this.effectiveSpellLanguage,
      pageTheme: prefs.pageTheme,
      focus: prefs.focusMode === 'sentence' ? 'sentence' : prefs.focusMode ? 'paragraph' : 'off',
      typewriter: Boolean(prefs.typewriter),
      vim: Boolean(prefs.vimKeys),
      markdownEmphasis: !prefs.markdownOff,
      uiBright: brighterInterface(prefs.uiBright),
      interfaceZoom: Number(prefs.uiZoom) || 1,
      poetry: this.editor?.activeFormatting.poetry ?? false,
      align: this.editor?.activeFormatting.align ?? 'left',
    };
    const signature = JSON.stringify(state);
    if (signature === this.nativeMenuSignature) return;
    this.nativeMenuSignature = signature;
    try {
      await os.request('setMenuState', state);
    } catch (error) {
      if (this.nativeMenuSignature === signature) this.nativeMenuSignature = '';
      throw error;
    }
  }
  fullscreenChanged(raw: unknown) {
    const { fullscreen } = FullscreenChangedSchema.parse(
      raw && typeof raw === 'object'
        ? { fullscreen: (raw as { fullscreen: unknown }).fullscreen }
        : raw,
    );
    this.fullscreen = fullscreen;
    document.body.classList.toggle('full-screen', fullscreen);
  }
  async cycleFocus() {
    const levels = [false, 'paragraph', 'sentence'] as const;
    const current =
      this.value.library.focusMode === true ? 'paragraph' : this.value.library.focusMode || false;
    await this.preference(
      'focusMode',
      levels[(levels.indexOf(current as (typeof levels)[number]) + 1) % levels.length],
    );
  }
  async textSize(delta: number) {
    const size =
      delta === 0
        ? 17
        : Math.min(22, Math.max(14, (Number(this.value.library.editorFontSize) || 17) + delta));
    if (size === (Number(this.value.library.editorFontSize) || 17) &&
        (delta !== 0 || this.value.zoom === 1)) return;
    const next = Library.parse({ ...this.value.library, editorFontSize: size,
      ...(delta === 0 ? { pageZoom: 1 } : {}) });
    this.libraryGeneration++;
    this.patch({ library: next, ...(delta === 0 ? { zoom: 1 } : {}) });
    keepReadingPlace(() => {
      applyPresentation(next);
      this.applyPlatformDropcap();
      document.documentElement.style.setProperty('--body-font', this.bodyFontStyle(next.fonts.body));
    });
    const saved = new Promise<void>((resolve, reject) => this.appearanceWaiters.push({ resolve, reject }));
    this.scheduleAppearanceSave();
    this.scheduleMenu();
    await this.rendered();
    await saved;
  }
  async pasteMatchStyle() {
    if (!this.writable() || !this.editor) return;
    const clip = this.platform?.os
      ? z
          .object({ text: z.string(), html: z.string().nullable() })
          .parse(await this.platform.os.request('readClipboard', {}))
      : { text: await navigator.clipboard.readText() };
    this.editor.paste({ text: clip.text });
    this.surfaces?.focus();
  }
  libraryFolder() {
    if (this.overlayOpen()) return;
    return this.librarySettingsViewModel.open();
  }
  closeLibrarySettings() {
    this.librarySettingsViewModel.close();
  }
  chooseLibraryFolder(defaultFolder = false) {
    return this.librarySettingsViewModel.choose(defaultFolder);
  }
  backupLibrary() {
    return this.librarySettingsViewModel.backup();
  }
  revealLibrary() {
    return this.librarySettingsViewModel.reveal();
  }
  confirm(title: string, message: string, label = 'Delete'): Promise<boolean> {
    return new Promise((resolve) =>
      this.patch({
        modal: {
          title,
          value: '',
          label: message,
          confirm: label,
          input: false,
          resolve: (value) => resolve(value !== null),
        },
      }),
    );
  }
  async editPreference(key: string, title: string, value: unknown) {
    const result = await this.prompt(title, String(value ?? ''));
    if (result !== null) await this.preference(key, result);
  }
  openGoals() {
    if (this.overlayOpen()) return;
    this.goalsViewModel.open();
  }
  editGoal(field: keyof GoalsDraft, value: string) {
    this.goalsViewModel.edit(field, value);
  }
  async closeGoals() {
    await this.goalsViewModel.close();
    await this.rendered();
    this.surfaces?.focus();
  }
  async goalsSprint() {
    await this.goalsViewModel.toggleSprint();
    await this.rendered();
    this.surfaces?.focus();
  }
  private async saveGoals(draft: GoalsDraft) {
    await this.updateLibrary(
      Library.parse({
        ...this.value.library,
        dailyGoal: Math.max(0, parseInt(draft.daily, 10) || 0),
        dayEndsAt: draft.cutoff,
      }),
      false,
    );
    if (this.progress) this.progress.cutoff = draft.cutoff;
    if (this.editor && !this.value.readOnly)
      this.editor.updateMetadata({ wordGoal: Math.max(0, parseInt(draft.book, 10) || 0) });
    this.project();
  }
  async bookGoal() {
    this.openGoals();
  }
  async dailyGoal() {
    this.openGoals();
  }
  async renameTab(tab: 'notes' | 'outline') {
    if (!this.writable()) return;
    const names = z.record(z.string(), z.string()).catch({}).parse(this.value.book?.tabNames);
    const title = await this.prompt(
      'Rename tab',
      names[tab] ?? (tab === 'notes' ? 'Notes' : 'Outline'),
      'New tab name',
    );
    if (!title?.trim()) return;
    this.editor?.updateMetadata({ tabNames: { ...names, [tab]: title.trim() } });
    const defaults = z
      .record(z.string(), z.string())
      .catch({})
      .parse(this.value.library.tabDefaults);
    await this.preference('tabDefaults', { ...defaults, [tab]: title.trim() });
  }
  focusOutline(target?: OutlineTarget) {
    if (!target) return;
    void this.rendered().then(() => {
      const selector = target.sectionId
        ? `.ol-line[data-sec-id="${CSS.escape(target.sectionId)}"] .ol-text`
        : `.ol-chapter[data-ch-id="${CSS.escape(target.chapterId)}"] .ol-text`;
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return;
      element.focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  }
  editOutline(target: OutlineTarget, value: string) {
    if (
      !this.editor?.outlineRows.some(
        (row) => row.chapterId === target.chapterId && row.sectionId === target.sectionId,
      )
    )
      return;
    if (this.writable())
      this.editor?.editOutlineRow(
        {
          chapterId: target.chapterId,
          ...(target.sectionId ? { sectionId: target.sectionId } : {}),
        },
        value.trim(),
      );
  }
  outlineKey(target: OutlineTarget, event: KeyboardEvent) {
    if (!this.writable() || !this.editor) return;
    target = {
      chapterId: target.chapterId,
      ...(target.sectionId ? { sectionId: target.sectionId } : {}),
    };
    const element = event.currentTarget as HTMLElement;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const rows = this.editor.outlineRows.filter((row) => row.kind !== 'part');
      const index = rows.findIndex(
        (row) => row.chapterId === target.chapterId && row.sectionId === target.sectionId,
      );
      this.editOutline(target, element.textContent ?? '');
      this.focusOutline(rows[index + (event.key === 'ArrowUp' ? -1 : 1)]);
      return;
    }
    if (
      event.key !== 'Enter' &&
      event.key !== 'Tab' &&
      !(event.key === 'Backspace' && !element.textContent?.trim())
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const selection = window.getSelection();
    let before = false;
    if (element.textContent?.trim() && selection?.isCollapsed && selection.rangeCount) {
      const prefix = selection.getRangeAt(0).cloneRange();
      prefix.selectNodeContents(element);
      prefix.setEnd(selection.anchorNode!, selection.anchorOffset);
      before = prefix.toString().length === 0;
    }
    this.editOutline(target, element.textContent ?? '');
    if (event.key === 'Enter') this.focusOutline(this.editor.outlineEnter(target, before));
    else if (event.key === 'Tab') {
      const result = this.editor.outlineIndent(target, event.shiftKey);
      if (result.notice) this.patch({ hint: result.notice });
      this.focusOutline(result.target);
    } else
      this.focusOutline(
        this.editor.outlineDelete({
          chapterId: target.chapterId,
          ...(target.sectionId ? { sectionId: target.sectionId } : {}),
        }),
      );
  }
  outlineContext(target: OutlineTarget): MenuItem[] {
    return [
      {
        label: target.sectionId ? 'Delete section' : 'Delete chapter',
        run: () => {
          if (!this.writable() || !this.editor) return;
          if (!target.sectionId) this.deleteChapter(target.chapterId);
          else
            this.focusOutline(
              this.editor.outlineDelete({
                chapterId: target.chapterId,
                sectionId: target.sectionId,
              }),
            );
        },
      },
    ];
  }
  chapterNote(id: string, value: string) {
    if (!this.writable()) return;
    const notes = z.record(z.string(), z.string()).catch({}).parse(this.value.book?.chapterNotes);
    this.editor?.updateMetadata({ chapterNotes: { ...notes, [id]: value } });
  }
  chapterContext(id: string, index: number): MenuItem[] {
    const chapter = this.editor?.chapters.find((row) => row.id === id);
    if (!chapter) return [];
    const hasWords = this.editor!.passageRows(id).some((row) => /[\p{L}\p{N}]/u.test(row.text));
    const otherContents = this.value.chapters.some(
      (row) => row.id !== id && row.kind === 'contents',
    );
    const names: Record<string, string> = {
      copyright: 'Copyright',
      dedication: 'Dedication',
      epigraph: 'Epigraph',
      contents: 'Contents',
      prologue: 'Prologue',
      part: 'Part',
      chapter: 'Chapter',
      unnumbered: 'Unnumbered Chapter',
      epilogue: 'Epilogue',
      acknowledgments: 'Acknowledgments',
      about: 'About the Author',
    };
    const items: MenuItem[] = Object.entries(names).map(([kind, label]) => ({
      label,
      checked: chapter.kind === kind,
      disabled:
        this.value.readOnly ||
        (kind === 'contents' && chapter.kind !== kind && (otherContents || hasWords)),
      run: () => this.setChapterKind(id, kind),
    }));
    const separator = { label: '', separator: true, run() {} };
    if (['chapter', 'unnumbered', 'prologue', 'epilogue'].includes(chapter.kind) && hasWords)
      items.push(separator, { label: 'Export Chapter…', run: () => this.exportChapter(id) });
    if (chapter.kind === 'part')
      items.push(separator, {
        label: 'Restart Chapter Numbers at Each Part',
        checked: Boolean(this.value.book?.restartNumbering),
        disabled: this.value.readOnly,
        run: () => {
          if (this.writable())
            this.editor?.updateMetadata({ restartNumbering: !this.value.book?.restartNumbering });
        },
      });
    items.push(
      separator,
      { label: 'Rename…', disabled: this.value.readOnly, run: () => this.renameChapterPrompt(id) },
      { label: 'Duplicate', disabled: this.value.readOnly, run: () => this.duplicateChapter(id) },
      {
        label: 'Move up',
        disabled: this.value.readOnly || index === 0,
        run: () => this.reorderChapter(id, index - 1),
      },
      {
        label: 'Move down',
        disabled: this.value.readOnly || index === this.value.chapters.length - 1,
        run: () => this.reorderChapter(id, index + 1),
      },
      separator,
      {
        label: 'Delete',
        danger: true,
        disabled: this.value.readOnly,
        run: () => this.deleteChapter(id),
      },
    );
    return items;
  }
  chapterInsertionContext(index: number): MenuItem[] {
    const names = {
      copyright: 'Copyright',
      dedication: 'Dedication',
      epigraph: 'Epigraph',
      contents: 'Contents',
      prologue: 'Prologue',
      part: 'Part',
      chapter: 'Chapter',
      unnumbered: 'Unnumbered Chapter',
      epilogue: 'Epilogue',
      acknowledgments: 'Acknowledgments',
      about: 'About the Author',
    };
    return Object.entries(names).map(([kind, label]) => ({
      label,
      disabled:
        this.value.readOnly ||
        (kind === 'contents' && this.value.chapters.some((c) => c.kind === 'contents')),
      run: () => this.createChapter(index, kind),
    }));
  }
  formatMenu(event: MouseEvent) {
    this.menu(event, [
      { label: 'Bold', run: () => this.format('bold') },
      { label: 'Italic', run: () => this.format('italic') },
      { label: 'Poetry', run: () => this.togglePoetry() },
      ...(['left', 'center', 'right', 'justify'] as const).map((value) => ({
        label: value[0].toUpperCase() + value.slice(1),
        run: () => this.alignParagraph(value),
      })),
      { label: 'Margin note…', run: () => this.newSticky() },
      { label: 'Save Darling', run: () => this.archive() },
      {
        label: this.value.spellOn ? 'Spellcheck off' : 'Spellcheck on',
        run: () => this.toggleSpelling(),
      },
      ...[
        'en-US',
        'en-GB',
        'en-AU',
        'en-CA',
        'fr',
        'de',
        'es',
        'el',
        'nl',
        'pl',
        'pt',
        'ro',
        'ru',
      ].map((language) => ({
        label: 'Language: ' + language,
        run: () => this.preference('spellLanguage', language),
      })),
      { label: 'Vim mode', run: () => this.preference('vimKeys', !this.value.library.vimKeys) },
      { label: 'Word goal…', run: () => this.bookGoal() },
      { label: 'Daily goal…', run: () => this.dailyGoal() },
      { label: 'Start sprint…', run: () => this.startSprint() },
      { label: 'End sprint', run: () => this.endSprint() },
    ]);
  }
  fileMenu(event: MouseEvent) {
    this.menu(event, [
      { label: 'Import', run: () => this.importBooks() },
      { label: 'Reshelve a Book…', run: () => this.reshelveBook() },
    ]);
  }
  viewMenu(event: MouseEvent) {
    this.menu(event, [
      { label: 'Reshelve a Book…', run: () => this.reshelveBook() },
      ...(['pantser', 'plotter'] as const).map((style) => ({
        label: style === 'pantser' ? 'Pantser' : 'Plotter',
        checked: this.value.library.writingStyle === style,
        run: () => this.preference('writingStyle', style),
      })),
      ...['paper', 'night', 'light'].map((theme) => ({
        label: 'Theme: ' + theme,
        run: () => this.preference('pageTheme', theme),
      })),
      {
        label: 'Typewriter scrolling',
        run: () => this.preference('typewriter', !this.value.library.typewriter),
      },
      {
        label: 'Focus mode',
        run: () => this.preference('focusMode', !this.value.library.focusMode),
      },
      {
        label: 'Hide drop cap',
        run: () =>
          this.preference('fonts', {
            ...this.value.library.fonts,
            dropcap: this.value.library.fonts.dropcap === 'none' ? 'literary' : 'none',
          }),
      },
      {
        label: 'Body font…',
        run: async () => {
          await this.openFontPicker();
        },
      },
      { label: 'Find and replace', run: () => this.openSearch() },
      { label: 'Cover Art…', run: () => this.openCoverSettings() },
      { label: 'Email a draft…', run: () => this.emailDraft() },
      { label: 'Email settings…', run: () => this.openEmailSettings() },
      { label: 'Library folder…', run: () => this.libraryFolder() },
      { label: 'Help', run: () => this.showInformation('help') },
      { label: 'Keyboard shortcuts', run: () => this.showInformation('shortcuts') },
      { label: 'About Leafloom', run: () => this.showInformation('about') },
    ]);
  }
  async preference(key: string, value: unknown) {
    if (key === 'spellLanguage') {
      const generation = ++this.spellLanguageGeneration;
      const selected = z.string().min(1).parse(value);
      try {
        z.record(z.string(), z.boolean()).parse(
          await this.request('spellcheck', { words: [], language: selected || 'en' }),
        );
      } catch (error) {
        if (generation === this.spellLanguageGeneration)
          throw Error(translate(this.value.language, 'That dictionary would not load'), {
            cause: error,
          });
        return;
      }
      if (generation !== this.spellLanguageGeneration) return;
    }
    const next = Library.parse({ ...this.value.library, [key]: value });
    const saving = this.updateLibrary(next, false);
    this.editor?.configureTypography({
      interfaceLanguage: this.value.language.locale,
      language: this.writingLanguage(next),
      markdown: !next.markdownOff,
    });
    this.surfaces?.setVim(Boolean(next.vimKeys ?? next.vimMode));
    this.surfaces?.configurePresentation({
      typewriter: Boolean(next.typewriter),
      focus: next.focusMode === 'sentence' ? 'sentence' : next.focusMode ? 'paragraph' : 'off',
      language: this.value.language.locale,
    });
    if (this.value.spellOn) this.scheduleSpell();
    await saving;
    await this.synchronizeMenu();
  }
  toggleSpelling() {
    this.patch({ spellOn: !this.value.spellOn });
    if (this.value.spellOn) {
      this.spellActiveSection = this.editor?.activeSection?.id ?? null;
      void this.background(() => this.spellingViewModel.activate());
    } else {
      this.spellingViewModel.clear();
      this.spellActiveSection = null;
      this.dismissMenu();
    }
  }
  private activateSpellingSection() {
    const id = this.editor?.activeSection?.id ?? null;
    if (!this.value.spellOn || id === this.spellActiveSection) return;
    this.spellActiveSection = id;
    void this.background(() => this.spellingViewModel.activate());
  }
  private scheduleSpell() {
    this.spellingViewModel.schedule();
  }
  private async scanSpelling() {
    await this.spellingViewModel.scan();
  }
  private async spellingMenu(target: Annotation & { text: string; x: number; y: number }) {
    if (target.kind !== 'spelling' || !this.editor || !this.value.spellOn) return;
    const editor = this.editor;
    const passage = editor.passageRows().find((row) => row.id === target.passageId);
    if (!passage || passage.text.slice(target.from, target.to) !== target.text) return;
    const text = passage.text,
      generation = ++this.spellingMenuGeneration;
    const language = this.effectiveSpellLanguage,
      languageGeneration = this.spellLanguageGeneration;
    const valid = () =>
      this.editor === editor &&
      this.value.spellOn &&
      generation === this.spellingMenuGeneration &&
      languageGeneration === this.spellLanguageGeneration &&
      language === this.effectiveSpellLanguage &&
      editor.passageRows().find((row) => row.id === target.passageId)?.text === text &&
      editor.annotations.some(
        (row) =>
          row.kind === 'spelling' &&
          row.passageId === target.passageId &&
          row.from === target.from &&
          row.to === target.to,
      );
    const suggestions = z
      .array(z.string())
      .parse(
        await this.request('spellSuggest', { word: normalizeSpellingWord(target.text), language }),
      );
    if (!valid()) return;
    this.patch({
      menu: {
        allowShortcuts: true,
        x: target.x,
        y: target.y,
        items: [
          ...(!suggestions.length ? [{ label: 'No suggestions', disabled: true, run() {} }] : []),
          ...suggestions.map((word) => ({
            label: word,
            localize: false,
            run: () => {
              if (this.writable() && valid())
                editor.replacePassageText(target.passageId, target.from, target.to, word);
            },
          })),
          {
            label: 'Learn “' + target.text + '”',
            run: async () => {
              if (!valid()) return;
              const existing = z.array(z.string()).catch([]).parse(this.value.library.customWords);
              await this.updateLibrary(
                Library.parse({
                  ...this.value.library,
                  customWords: [...new Set([...existing, normalizeSpellingWord(target.text)])],
                }),
              );
              await this.request('spellLearn', {
                word: normalizeSpellingWord(target.text),
                language,
              });
              await this.spellingViewModel.learned(normalizeSpellingWord(target.text));
            },
          },
        ],
      },
    });
  }
  togglePoetry() {
    if (!this.writable()) return;
    this.editor?.togglePoetry();
    this.surfaces?.focus();
  }
  openingPoetry(id: string) {
    if (!this.writable()) return;
    this.editor?.insertOpeningPoetry(id);
    this.surfaces?.focus();
  }
  async newSticky() {
    if (!this.writable() || !this.editor) return;
    const anchor = window.getSelection()?.anchorNode;
    const element =
      anchor?.nodeType === Node.TEXT_NODE
        ? anchor.parentElement
        : anchor instanceof Element
          ? anchor
          : null;
    if (this.value.panel !== 'manuscript' || !element?.closest('.chapter-body')) {
      this.patch({ hint: 'Click into a chapter first, then ⌘⇧X drops a placeholder' });
      return;
    }
    const id = this.editor.createSticky('');
    this.patch({ sideOpen: true });
    await this.rendered();
    document
      .querySelector<HTMLTextAreaElement>(`.sticky[data-sticky-id="${CSS.escape(id)}"] textarea`)
      ?.focus();
  }
  updateSticky(id: string, text: string) {
    if (!this.writable() || !this.editor?.stickies.some((sticky) => sticky.id === id)) return;
    this.pendingStickies.set(id, text);
    this.patch({
      dirty: true,
      stickies: this.value.stickies.map((sticky) =>
        sticky.id === id ? { ...sticky, text } : sticky,
      ),
    });
    if (this.stickyTimer) clearTimeout(this.stickyTimer);
    this.stickyTimer = setTimeout(() => {
      this.flushStickyEdits();
      void this.background(() => this.save());
    }, 600);
  }
  private flushStickyEdits() {
    if (this.stickyTimer) {
      clearTimeout(this.stickyTimer);
      this.stickyTimer = null;
    }
    for (const [id, text] of this.pendingStickies) {
      this.pendingStickies.delete(id);
      if (this.editor?.stickies.some((sticky) => sticky.id === id))
        this.editor.updateSticky(id, { text });
    }
  }
  resolveSticky(id: string, resolved: boolean) {
    if (resolved) this.removeSticky(id);
  }
  removeSticky(id: string) {
    if (!this.writable()) return;
    this.pendingStickies.delete(id);
    this.editor?.removeSticky(id);
  }
  async selectSticky(id: string) {
    this.flushStickyEdits();
    if (this.value.panel !== 'manuscript') {
      this.setPanel('manuscript');
      await this.rendered();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    }
    if (!this.editor?.selectSticky(id, true)) return;
    this.surfaces?.focus({ preventScroll: true });
    const mark = document.querySelector<HTMLElement>(`.ph-mark[data-sid="${CSS.escape(id)}"]`),
      scroll = document.querySelector<HTMLElement>('#paper-scroll');
    if (mark && scroll) {
      const rect = mark.getBoundingClientRect(),
        box = scroll.getBoundingClientRect();
      if (rect.top < box.top + 40 || rect.bottom > box.bottom - 40)
        mark.scrollIntoView({ block: 'center' });
    }
    if (!this.value.sidePinned) this.patch({ sideOpen: false });
  }
  setPanel(panel: string) {
    const scroll = document.querySelector<HTMLElement>('#paper-scroll');
    if (panel !== this.value.panel)
      this.tabPlaces.set(this.value.panel, {
        scroll: scroll?.scrollTop ?? 0,
        caret: this.editor?.selection,
      });
    if (
      panel === 'outline' &&
      this.writable() &&
      !this.editor?.outlineRows.some((row) => row.kind === 'chapter')
    )
      this.editor?.createChapter('');
    this.patch({ panel });
    this.project();
    const back = this.tabPlaces.get(panel);
    void this.rendered().then(async () => {
      if (
        (panel === 'manuscript' || panel === 'notes') &&
        back?.caret &&
        this.editor?.restoreSelection(back.caret)
      )
        this.surfaces?.focus({ preventScroll: Boolean(back) });
      else if (panel === 'notes') this.surfaces?.focus({ preventScroll: Boolean(back) });
      if (back && scroll) {
        await this.rendered();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (this.value.panel === panel) scroll.scrollTop = back.scroll;
      }
      if (this.value.searchOpen) this.searchViewModel.search(this.value.search);
    });
  }
  setMetadata(patch: { title?: string; subtitle?: string; author?: string }) {
    if (!this.writable()) return;
    this.editor?.setMetadata(patch);
  }
  editMetadataField(field: MetadataField, value: string) {
    if (!this.writable()) return;
    const text = value.trim();
    this.editor?.editMetadataField(
      field,
      field === 'title' ? text || translate(this.value.language, 'Untitled') : text,
    );
  }
  finishMetadataField(field: MetadataField) {
    this.editor?.finishMetadataField(field);
  }
  enterTitlePage() {
    this.editor?.finishMetadataField();
    const first = this.editor?.chapters.find((chapter) =>
      ['chapter', 'unnumbered', 'prologue', 'epilogue'].includes(chapter.kind),
    );
    if (first) this.focusChapter(first.id);
    else this.createChapter();
  }
  createChapter(index?: number, kind?: string) {
    if (!this.writable()) return;
    const editor = this.editor,
      id = editor?.createChapter(
        '',
        index,
        kind ? { kind, ...this.copyrightOptions(kind) } : undefined,
      );
    if (id && editor) {
      if (this.value.panel !== 'manuscript') this.setPanel('manuscript');
      editor.select(id, 1);
      this.project();
      void this.rendered().then(() => {
        if (this.editor === editor && editor.activeSection?.id === id) this.surfaces?.focus();
      });
    }
  }
  renameChapter(id: string, title: string) {
    if (!this.writable()) return;
    this.editor?.renameChapter(id, title);
  }
  async renameChapterPrompt(id: string) {
    const chapter = this.value.chapters.find((c) => c.id === id);
    const title = await this.prompt('Rename chapter', chapter?.title);
    if (title !== null) this.renameChapter(id, title);
  }
  duplicateChapter(id: string) {
    if (!this.writable()) return;
    this.editor?.duplicateChapter(id);
  }
  deleteChapter(id: string) {
    if (!this.writable()) return;
    this.editor?.deleteChapter(id);
  }
  reorderChapter(id: string, index: number) {
    if (!this.writable()) return;
    this.editor?.reorderChapter(id, index);
  }
  setChapterKind(id: string, kind: string) {
    if (!this.writable()) return;
    this.editor?.setChapterKind(id, kind, this.copyrightOptions(kind));
  }
  private copyrightOptions(kind: string) {
    return kind === 'copyright'
      ? {
          copyrightStarter: {
            notice: translate(this.value.language, 'Copyright © {year} {name}', {
              year: String(new Date().getFullYear()),
              name:
                this.editor?.author ||
                this.value.library.authorName ||
                translate(this.value.language, 'Anonymous'),
            }),
            rights: translate(this.value.language, 'All rights reserved.'),
          },
        }
      : undefined;
  }
  focusChapter(id: string) {
    if (this.value.panel !== 'manuscript') this.setPanel('manuscript');
    const last = this.editor?.passageRows(id).at(-1);
    if (last) this.editor?.selectPassage(last.id, last.size);
    this.surfaces?.focus({ preventScroll: true });
    void this.rendered().then(() => {
      document
        .querySelector<HTMLElement>(`.chapter[data-chid="${CSS.escape(id)}"]`)
        ?.scrollIntoView({
          block: 'start',
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth',
        });
    });
  }
  undo() {
    if (!this.writable()) return;
    this.flushStickyEdits();
    if (this.editor) {
      this.editor.undo();
      this.surfaces?.focus();
    } else if (this.libraryViewModel.canUndoMove) void this.execute(() => this.undoAuthorMove());
    else {
      const previous = this.libraryUndo.pop();
      if (previous) {
        this.libraryRedo.push(this.value.library);
        void this.execute(() => this.updateLibrary(previous, false));
      }
    }
  }
  redo() {
    if (!this.writable()) return;
    this.flushStickyEdits();
    if (this.editor) {
      this.editor.redo();
      this.surfaces?.focus();
    } else {
      const next = this.libraryRedo.pop();
      if (next) {
        this.libraryUndo.push(this.value.library);
        void this.execute(() => this.updateLibrary(next, false));
      }
    }
  }
  alignParagraph(value: 'left' | 'center' | 'right' | 'justify') {
    if (!this.writable()) return;
    this.editor?.alignParagraph(value);
    this.surfaces?.focus();
  }
  format(mark: 'bold' | 'italic') {
    if (!this.writable()) return;
    this.editor?.format(mark);
    this.surfaces?.focus();
  }
  archive() {
    if (!this.writable()) return;
    if (!this.editor) return;
    if (!this.editor.copySelection().text.trim()) {
      this.patch({ hint: 'Select the passage first' });
      return;
    }
    this.editor.archive();
    this.patch({
      hint: translate(
        this.value.language,
        'Saved to Darlings — kill without remorse ({key} to undo)',
        { key: '⌘Z' },
      ),
    });
  }
  archiveDropped() {
    if (!this.writable()) return;
    if (this.surfaces?.archiveDraggedSelection())
      this.patch({ hint: 'Saved to Darlings — kill without remorse (⌘Z to undo)' });
    else this.archive();
  }
  restore(id: string) {
    if (!this.writable()) return;
    const restored = this.editor?.restore(id);
    if (!restored) return;
    this.patch({
      panel: 'manuscript',
      hint: restored.notice ?? 'Darling restored to its original spot',
    });
    this.project();
    void this.rendered().then(() => {
      this.surfaces?.focus();
      this.surfaces?.revealSelection({ block: 'center', passageId: restored.restoredPassageId });
    });
  }
  async removeDarling(id: string) {
    if (!this.writable()) return;
    this.editor?.removeDarling(id);
  }

  openSearch(...args: Parameters<SearchViewModel['openSearch']>) {
    return this.searchViewModel.openSearch(...args);
  }
  searchKey(...args: Parameters<SearchViewModel['searchKey']>) {
    return this.searchViewModel.searchKey(...args);
  }
  closeSearch(...args: Parameters<SearchViewModel['closeSearch']>) {
    return this.searchViewModel.closeSearch(...args);
  }
  search(...args: Parameters<SearchViewModel['search']>) {
    return this.searchViewModel.input(...args);
  }
  nextMatch(...args: Parameters<SearchViewModel['nextMatch']>) {
    return this.searchViewModel.nextMatch(...args);
  }
  private focusMatch(id: string) {
    document
      .querySelector<HTMLElement>(`.chapter[data-chid="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: 'center' });
    this.surfaces?.focus();
  }
  replace(...args: Parameters<SearchViewModel['replace']>) {
    return this.searchViewModel.replace(...args);
  }

  cycleWordCounter() {
    this.patch({ wordMode: this.value.wordMode === 'book' ? 'chapter' : 'book' });
    this.project();
  }
  trackVisibleChapter() {
    if (this.value.panel !== 'manuscript') return;
    let best: string | null = null;
    for (const element of document.querySelectorAll<HTMLElement>('#chapters .chapter'))
      if (element.getBoundingClientRect().top < window.innerHeight * 0.4)
        best = element.dataset.chid ?? null;
    if (best && best !== this.value.currentChapter) {
      this.patch({ currentChapter: best });
      this.projectCounters(best);
    }
  }
  private projectCounters(id: string) {
    const editor = this.editor,
      chapter = editor?.chapters.find((row) => row.id === id);
    if (!editor || !chapter) return;
    const t = (key: string, args: Record<string, string | number> = {}) =>
      translate(this.value.language, key, args);
    const numbered = editor.chapters.filter((row) => row.kind === 'chapter');
    this.patch({
      positionLabel:
        chapter.kind === 'chapter' && numbered.length === 1
          ? ''
          : chapter.kind === 'chapter'
            ? t('chapter {ch} of {total}', { ch: chapter.number ?? 0, total: numbered.length })
            : t(chapter.label),
      ...(this.value.wordMode === 'chapter'
        ? {
            wordLabel:
              chapter.kind === 'chapter'
                ? t('ch. {ch}: {n} words', { ch: chapter.number ?? 0, n: editor.wordCountFor(id) })
                : t('{name}: {n} words', { name: chapter.label, n: editor.wordCountFor(id) }),
          }
        : {}),
    });
  }
  zoom(delta: number) {
    this.setPageZoom(delta === 0 ? 1 : this.value.zoom + delta);
  }
  private setPageZoom(next: number, point?: { x: number; y: number }) {
    if (!Number.isFinite(next)) return;
    const zoom = Math.max(0.75, Math.min(3, next));
    if (zoom === this.value.zoom) return;
    this.libraryGeneration++;
    this.patch({ zoom, library: { ...this.value.library, pageZoom: zoom } });
    keepReadingPlace(
      () => document.documentElement.style.setProperty('--page-zoom', String(zoom)),
      point,
    );
    this.scheduleAppearanceSave();
  }
  private scheduleAppearanceSave() {
    if (this.appearanceTimer) clearTimeout(this.appearanceTimer);
    this.appearanceTimer = setTimeout(() => void this.background(() => this.flushAppearance()), 600);
  }
  private async flushAppearance() {
    if (!this.appearanceTimer) return;
    clearTimeout(this.appearanceTimer);
    this.appearanceTimer = null;
    const waiters = this.appearanceWaiters.splice(0);
    try {
      await this.updateLibrary(this.value.library, false);
      for (const waiter of waiters) waiter.resolve();
    } catch (error) {
      for (const waiter of waiters) waiter.reject(error);
      throw error;
    }
  }
  pageZoomWheel(event: WheelEvent) {
    if (event.ctrlKey) {
      event.preventDefault();
      this.setPageZoom(this.value.zoom * Math.exp(-event.deltaY * 0.005), {
        x: event.clientX,
        y: event.clientY,
      });
    } else if (
      event.target instanceof Element &&
      !event.target.closest('#paper-scroll,#nav-pane,#side-pane')
    ) {
      const scroll = document.querySelector<HTMLElement>('#paper-scroll');
      if (scroll) scroll.scrollTop += event.deltaY;
    }
  }
  zoomControlWheel(event: WheelEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.setPageZoom(this.value.zoom * Math.exp(-event.deltaY * 0.002));
  }
  systemContrastChanged() {
    document.body.classList.toggle('bright', brighterInterface(this.value.library.uiBright));
    this.scheduleMenu();
  }
  chapterNavigationKey(event: KeyboardEvent) {
    const mod = this.platform?.isMac ? event.metaKey : event.ctrlKey;
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      !mod ||
      !event.altKey ||
      event.shiftKey ||
      !['ArrowUp', 'ArrowDown'].includes(event.key) ||
      this.value.view !== 'editor' ||
      this.overlayOpen()
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const chapters = this.editor?.chapters ?? [];
    let index = chapters.findIndex((row) => row.id === this.value.currentChapter);
    if (index < 0) index = direction > 0 ? -1 : chapters.length;
    const next = Math.max(0, Math.min(chapters.length - 1, index + direction));
    if (next === index || !chapters[next]) return;
    const id = chapters[next].id;
    if (this.value.panel !== 'manuscript') {
      this.tabPlaces.delete('manuscript');
      this.setPanel('manuscript');
    }
    void this.rendered().then(() => {
      const first = this.editor?.passageRows(id)[0];
      if (first) this.editor?.selectPassage(first.id, 0);
      this.surfaces?.focus({ preventScroll: true });
      document
        .querySelector<HTMLElement>(`.chapter[data-chid="${CSS.escape(id)}"]`)
        ?.scrollIntoView({
          block: 'start',
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth',
        });
    });
  }
  showNav(open: boolean) {
    this.patch({ navOpen: open });
  }
  showSide(open: boolean) {
    this.patch({ sideOpen: open });
  }
  toggleNav() {
    this.patch({ navPinned: !this.value.navPinned });
    this.platform?.panePreferences?.write({
      nav: this.value.navPinned,
      side: this.value.sidePinned,
    });
  }
  toggleSide() {
    this.patch({ sidePinned: !this.value.sidePinned });
    this.platform?.panePreferences?.write({
      nav: this.value.navPinned,
      side: this.value.sidePinned,
    });
  }
  fieldTypographyKey(event: KeyboardEvent) {
    this.fieldTypography?.key(event);
  }
  key(event: KeyboardEvent) {
    if (this.publicationPageViewModel.active) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void this.execute(() => this.save());
      }
      return;
    }
    // ProseMirror prevents native Escape/Enter defaults even when its commands stand down.
    // Vim and modal owners stop propagation; these author-global keys still belong here.
    const authorGlobalKey =
      (event.key === 'Escape' ||
        (event.key === 'Enter' &&
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          !event.altKey)) &&
      event.target instanceof Element &&
      event.target.closest('.chapter-body,#aux-editor');
    if ((event.defaultPrevented && !authorGlobalKey) || event.isComposing || event.keyCode === 229)
      return;
    if (
      !this.value.coverArt &&
      !this.value.fontPicker &&
      !this.value.emailSettings &&
      this.keyboardNavigation.key(event)
    )
      return;
    if (event.key === 'Escape') {
      if (this.value.emailSettings) this.closeEmailSettings();
      else if (this.value.coverArt) this.closeCoverArt();
      else if (this.value.fontPicker) this.closeFontPicker();
      else if (this.value.information) this.closeInformation();
      else if (this.value.librarySettings) this.closeLibrarySettings();
      else if (this.value.goals) void this.execute(() => this.closeGoals());
      else if (this.value.modal) this.answer(null);
      else if (this.value.searchOpen) this.closeSearch();
      else if (this.value.view === 'library' && this.libraryViewModel.canUndoMove)
        void this.execute(() => this.undoAuthorMove());
      else if (this.value.menu) this.dismissMenu();
      else if (this.fullscreen)
        void this.execute(async () => {
          await this.platform?.os?.request('fullscreenEscape', {});
          this.fullscreenChanged({ fullscreen: false });
        });
      else if (this.value.view === 'editor') void this.execute(() => this.closeBook());
      else this.dismissMenu();
      return;
    }
    if (
      this.value.information?.kind === 'shortcuts' &&
      (event.metaKey || event.ctrlKey) &&
      (event.key === '/' || event.key === '?')
    ) {
      event.preventDefault();
      document.querySelector<HTMLElement>('.shortcuts-content')?.focus();
      return;
    }
    if (this.overlayOpen()) return;
    const modifier = event.metaKey || event.ctrlKey;
    if (!modifier) return;
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      void this.execute(() => this.platform?.fullscreen() ?? Promise.resolve());
      return;
    }
    if (
      !event.altKey &&
      ((event.shiftKey && event.key === ';') || (event.code === 'Semicolon' && event.key !== ';'))
    ) {
      event.preventDefault();
      this.toggleSpelling();
      return;
    }
    const key = event.key.toLowerCase();
    if (
      !this.value.nativeMenus &&
      event.shiftKey &&
      !event.altKey &&
      ['l', 'c', 'r', 'j'].includes(key)
    ) {
      event.preventDefault();
      const alignment = { l: 'left', c: 'center', r: 'right', j: 'justify' } as const;
      this.alignParagraph(alignment[key as keyof typeof alignment]);
      return;
    }
    if ((key === 'z' || key === 'y') && nativeHistoryField(event.target)) return;
    if (key === ',') {
      event.preventDefault();
      this.openGoals();
    } else if (key === 't' && event.shiftKey) {
      event.preventDefault();
      void this.execute(() => this.nativeCommand('typewriter'));
    } else if (key === 'o' && event.shiftKey) {
      event.preventDefault();
      void this.execute(() => this.cycleFocus());
    } else if (key === 'f' && event.shiftKey) {
      event.preventDefault();
      void this.execute(() => this.platform?.fullscreen() ?? Promise.resolve());
    } else if (key === '=' || key === '+' || key === '-' || key === '0') {
      event.preventDefault();
      void this.execute(() => this.textSize(key === '0' ? 0 : key === '-' ? -1 : 1));
    } else if (key === '/' || key === '?') {
      event.preventDefault();
      void this.execute(() => this.showInformation('shortcuts'));
    } else if (key === 'e') {
      event.preventDefault();
      void this.execute(() => this.emailDraft());
    } else if (key === 's') {
      event.preventDefault();
      void this.execute(() => this.save());
    } else if (key === 'z') {
      event.preventDefault();
      event.shiftKey ? this.redo() : this.undo();
    } else if (key === 'y') {
      event.preventDefault();
      this.redo();
    } else if (key === 'x' && event.shiftKey) {
      event.preventDefault();
      void this.execute(() => this.newSticky());
    } else if (key === 'd' && event.shiftKey) {
      event.preventDefault();
      this.archive();
    } else if (key === 'f') {
      event.preventDefault();
      this.openSearch();
    }
  }
}

export type AppActions = Pick<
  Application,
  | 'openPublicationPage'
  | 'bindPublicationPage'
  | 'editPublicationTitle'
  | 'pastePublicationTitle'
  | 'enterPublicationTitle'
  | 'closePublicationPage'
  | 'publicationUndo'
  | 'publicationRedo'
  | 'removeFromShelf'
  | 'reshelveBook'
  | 'restartForUpdate'
  | 'showInformation'
  | 'closeInformation'
  | 'libraryFolder'
  | 'closeLibrarySettings'
  | 'chooseLibraryFolder'
  | 'backupLibrary'
  | 'revealLibrary'
  | 'archiveDropped'
  | 'modalValue'
  | 'answer'
  | 'addBoundPage'
  | 'dropShelf'
  | 'moveShelf'
  | 'bindShelf'
  | 'chapterContext'
  | 'chapterInsertionContext'
  | 'reorderChapter'
  | 'chooseAuthor'
  | 'closeBook'
  | 'closeSearch'
  | 'createChapter'
  | 'reloadExternal'
  | 'keepExternalCopy'
  | 'openGoals'
  | 'editGoal'
  | 'closeGoals'
  | 'goalsSprint'
  | 'dailyGoal'
  | 'deleteAuthor'
  | 'deleteBook'
  | 'deleteShelf'
  | 'dismissHint'
  | 'dismissMenu'
  | 'execute'
  | 'exportMenu'
  | 'focusChapter'
  | 'alignParagraph'
  | 'formatMenu'
  | 'importBooks'
  | 'fieldTypographyKey'
  | 'key'
  | 'menu'
  | 'moveToAuthor'
  | 'moveBook'
  | 'newAuthor'
  | 'newBook'
  | 'newShelf'
  | 'nextMatch'
  | 'editOutline'
  | 'outlineKey'
  | 'outlineContext'
  | 'renameTab'
  | 'onboard'
  | 'openBook'
  | 'openingPoetry'
  | 'removeDarling'
  | 'removeSticky'
  | 'renameAuthor'
  | 'exportShelfAnthology'
  | 'exportShelf'
  | 'shelfNumbering'
  | 'showBookFolder'
  | 'setCoverGoal'
  | 'exportBoundBook'
  | 'setCover'
  | 'regenerateCover'
  | 'removeCover'
  | 'renameBook'
  | 'renameChapter'
  | 'renameShelf'
  | 'replace'
  | 'resolveSticky'
  | 'restore'
  | 'search'
  | 'searchKey'
  | 'selectSticky'
  | 'setMetadata'
  | 'editMetadataField'
  | 'finishMetadataField'
  | 'enterTitlePage'
  | 'setPanel'
  | 'showNav'
  | 'showSide'
  | 'toggleNav'
  | 'toggleSide'
  | 'updateSticky'
  | 'fileMenu'
  | 'viewMenu'
  | 'cycleWordCounter'
  | 'trackVisibleChapter'
  | 'openCoverSettings'
  | 'editCoverSettings'
  | 'saveCoverSettings'
  | 'closeCoverArt'
  | 'openCoverChoices'
  | 'chooseCover'
  | 'openFontPicker'
  | 'searchFonts'
  | 'previewFont'
  | 'leaveFontList'
  | 'chooseFont'
  | 'fontPickerEnter'
  | 'closeFontPicker'
  | 'bodyFontStyle'
  | 'emailDraft'
  | 'openEmailSettings'
  | 'chooseEmailMethod'
  | 'closeEmailSettings'
  | 'recoverHost'
  | 'zoom'
  | 'pageZoomWheel'
  | 'zoomControlWheel'
  | 'chapterNavigationKey'
>;
export function applicationActions(vm: Application): AppActions {
  return {
    removeFromShelf: vm.removeFromShelf.bind(vm),
    reshelveBook: vm.reshelveBook.bind(vm),
    openPublicationPage: vm.openPublicationPage.bind(vm),
    bindPublicationPage: vm.bindPublicationPage.bind(vm),
    editPublicationTitle: vm.editPublicationTitle.bind(vm),
    pastePublicationTitle: vm.pastePublicationTitle.bind(vm),
    enterPublicationTitle: vm.enterPublicationTitle.bind(vm),
    closePublicationPage: vm.closePublicationPage.bind(vm),
    publicationUndo: vm.publicationUndo.bind(vm),
    publicationRedo: vm.publicationRedo.bind(vm),
    recoverHost: vm.recoverHost.bind(vm),
    emailDraft: vm.emailDraft.bind(vm),
    openEmailSettings: vm.openEmailSettings.bind(vm),
    chooseEmailMethod: vm.chooseEmailMethod.bind(vm),
    closeEmailSettings: vm.closeEmailSettings.bind(vm),
    openCoverSettings: vm.openCoverSettings.bind(vm),
    editCoverSettings: vm.editCoverSettings.bind(vm),
    saveCoverSettings: vm.saveCoverSettings.bind(vm),
    closeCoverArt: vm.closeCoverArt.bind(vm),
    openCoverChoices: vm.openCoverChoices.bind(vm),
    chooseCover: vm.chooseCover.bind(vm),
    openFontPicker: vm.openFontPicker.bind(vm),
    searchFonts: vm.searchFonts.bind(vm),
    previewFont: vm.previewFont.bind(vm),
    leaveFontList: vm.leaveFontList.bind(vm),
    chooseFont: vm.chooseFont.bind(vm),
    fontPickerEnter: vm.fontPickerEnter.bind(vm),
    closeFontPicker: vm.closeFontPicker.bind(vm),
    bodyFontStyle: vm.bodyFontStyle.bind(vm),
    restartForUpdate: vm.restartForUpdate.bind(vm),
    showInformation: vm.showInformation.bind(vm),
    closeInformation: vm.closeInformation.bind(vm),
    libraryFolder: vm.libraryFolder.bind(vm),
    closeLibrarySettings: vm.closeLibrarySettings.bind(vm),
    chooseLibraryFolder: vm.chooseLibraryFolder.bind(vm),
    backupLibrary: vm.backupLibrary.bind(vm),
    revealLibrary: vm.revealLibrary.bind(vm),
    archiveDropped: vm.archiveDropped.bind(vm),
    modalValue: vm.modalValue.bind(vm),
    answer: vm.answer.bind(vm),
    addBoundPage: vm.addBoundPage.bind(vm),
    dropShelf: vm.dropShelf.bind(vm),
    moveShelf: vm.moveShelf.bind(vm),
    bindShelf: vm.bindShelf.bind(vm),
    chapterContext: vm.chapterContext.bind(vm),
    chapterInsertionContext: vm.chapterInsertionContext.bind(vm),
    reorderChapter: vm.reorderChapter.bind(vm),
    chooseAuthor: vm.chooseAuthor.bind(vm),
    closeBook: vm.closeBook.bind(vm),
    closeSearch: vm.closeSearch.bind(vm),
    createChapter: vm.createChapter.bind(vm),
    reloadExternal: vm.reloadExternal.bind(vm),
    keepExternalCopy: vm.keepExternalCopy.bind(vm),
    openGoals: vm.openGoals.bind(vm),
    editGoal: vm.editGoal.bind(vm),
    closeGoals: vm.closeGoals.bind(vm),
    goalsSprint: vm.goalsSprint.bind(vm),
    dailyGoal: vm.dailyGoal.bind(vm),
    deleteAuthor: vm.deleteAuthor.bind(vm),
    deleteBook: vm.deleteBook.bind(vm),
    deleteShelf: vm.deleteShelf.bind(vm),
    dismissHint: vm.dismissHint.bind(vm),
    dismissMenu: vm.dismissMenu.bind(vm),
    execute: vm.execute.bind(vm),
    exportMenu: vm.exportMenu.bind(vm),
    focusChapter: vm.focusChapter.bind(vm),
    alignParagraph: vm.alignParagraph.bind(vm),
    formatMenu: vm.formatMenu.bind(vm),
    importBooks: vm.importBooks.bind(vm),
    fieldTypographyKey: vm.fieldTypographyKey.bind(vm),
    key: vm.key.bind(vm),
    menu: vm.menu.bind(vm),
    moveToAuthor: vm.moveToAuthor.bind(vm),
    moveBook: vm.moveBook.bind(vm),
    newAuthor: vm.newAuthor.bind(vm),
    newBook: vm.newBook.bind(vm),
    newShelf: vm.newShelf.bind(vm),
    nextMatch: vm.nextMatch.bind(vm),
    editOutline: vm.editOutline.bind(vm),
    outlineKey: vm.outlineKey.bind(vm),
    outlineContext: vm.outlineContext.bind(vm),
    renameTab: vm.renameTab.bind(vm),
    onboard: vm.onboard.bind(vm),
    openBook: vm.openBook.bind(vm),
    openingPoetry: vm.openingPoetry.bind(vm),
    removeDarling: vm.removeDarling.bind(vm),
    removeSticky: vm.removeSticky.bind(vm),
    renameAuthor: vm.renameAuthor.bind(vm),
    exportShelfAnthology: vm.exportShelfAnthology.bind(vm),
    exportShelf: vm.exportShelf.bind(vm),
    shelfNumbering: vm.shelfNumbering.bind(vm),
    showBookFolder: vm.showBookFolder.bind(vm),
    setCoverGoal: vm.setCoverGoal.bind(vm),
    exportBoundBook: vm.exportBoundBook.bind(vm),
    setCover: vm.setCover.bind(vm),
    regenerateCover: vm.regenerateCover.bind(vm),
    removeCover: vm.removeCover.bind(vm),
    renameBook: vm.renameBook.bind(vm),
    renameChapter: vm.renameChapter.bind(vm),
    renameShelf: vm.renameShelf.bind(vm),
    replace: vm.replace.bind(vm),
    resolveSticky: vm.resolveSticky.bind(vm),
    restore: vm.restore.bind(vm),
    search: vm.search.bind(vm),
    searchKey: vm.searchKey.bind(vm),
    selectSticky: vm.selectSticky.bind(vm),
    setMetadata: vm.setMetadata.bind(vm),
    editMetadataField: vm.editMetadataField.bind(vm),
    finishMetadataField: vm.finishMetadataField.bind(vm),
    enterTitlePage: vm.enterTitlePage.bind(vm),
    setPanel: vm.setPanel.bind(vm),
    showNav: vm.showNav.bind(vm),
    showSide: vm.showSide.bind(vm),
    toggleNav: vm.toggleNav.bind(vm),
    toggleSide: vm.toggleSide.bind(vm),
    updateSticky: vm.updateSticky.bind(vm),
    fileMenu: vm.fileMenu.bind(vm),
    viewMenu: vm.viewMenu.bind(vm),
    cycleWordCounter: vm.cycleWordCounter.bind(vm),
    trackVisibleChapter: vm.trackVisibleChapter.bind(vm),
    zoom: vm.zoom.bind(vm),
    pageZoomWheel: vm.pageZoomWheel.bind(vm),
    zoomControlWheel: vm.zoomControlWheel.bind(vm),
    chapterNavigationKey: vm.chapterNavigationKey.bind(vm),
  };
}
