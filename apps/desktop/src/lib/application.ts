import { AuthoringSession, ProgressTracker } from '@leafloom/authoring';
import type { CoverProvider } from '@leafloom/cover-contracts';
import { type DesktopHost, type HostMethod, type HostPayload } from '@leafloom/desktop-host';
import { type JSONValue } from '@leafloom/document-contracts';
import type { TextTypographyPort } from '@leafloom/editor-contracts';
import {
  OpenReply,
  type Annotation,
  type DocumentSnapshotValue,
  type EditorPort,
  type RemotePosition,
  type SurfacePort,
} from '@leafloom/editor-contracts';
import { type LibraryValue } from '@leafloom/library';
import type { Telemetry } from '@leafloom/telemetry-contracts';
import { z } from 'zod';
import * as applicationAnnotations from './application-annotations';
import * as applicationAuthorCommands from './application-author-commands';
import * as applicationBookSession from './application-book-session';
import { applicationCommands } from './application-commands';
import * as applicationCovers from './application-covers';
import * as applicationGoals from './application-goals';
import * as applicationInteraction from './application-interaction';
import * as applicationLibrary from './application-library';
import * as applicationMenus from './application-menus';
import * as applicationNativeCommands from './application-native-commands';
import * as applicationNavigation from './application-navigation';
import * as applicationOutline from './application-outline';
import * as applicationOutput from './application-output';
import * as applicationPersistence from './application-persistence';
import * as applicationPreferences from './application-preferences';
import * as applicationProjection from './application-projection';
import * as applicationSpelling from './application-spelling';
import * as applicationStartup from './application-startup';
import { createApplicationState } from './application-state';
import type { AppState, ApplicationPlatform, EditorFactory } from './application-types';
import * as applicationUpdates from './application-updates';
import * as applicationWiring from './application-wiring';
import { CoverArtViewModel } from './cover-art';
import { CoverGoalsViewModel } from './cover-goals';
import { DocumentOutputViewModel } from './document-output';
import { EmailDraftViewModel } from './email-draft';
import { FieldTypographyViewModel } from './field-typography';
import { FontPickerViewModel } from './font-picker';
import { GoalsViewModel, type GoalsDraft } from './goals';
import { HostRecoveryViewModel } from './host-recovery';
import { KeyboardNavigation } from './keyboard-navigation';
import { LibrarySettingsViewModel } from './library-settings';
import { LibraryViewModel } from './library-view-model';
import { PublicationPageViewModel } from './publication-page';
import { SearchViewModel } from './search-view-model';
import { SpellingViewModel } from './spelling-view-model';
import { UpdateViewModel } from './update-view-model';
export { applicationActions } from './application-actions';
export type {
  AppActions,
  AppState,
  ApplicationPlatform,
  BookMetadata,
  EditorFactory,
  MenuItem,
  Modal,
} from './application-types';

export class Application {
  private readonly operations: applicationWiring.ApplicationWiringContext &
    applicationNavigation.ApplicationNavigationContext &
    applicationAuthorCommands.ApplicationAuthorCommandsContext &
    applicationAnnotations.ApplicationAnnotationsContext &
    applicationSpelling.ApplicationSpellingContext &
    applicationPreferences.ApplicationPreferencesContext &
    applicationOutline.ApplicationOutlineContext &
    applicationMenus.ApplicationMenusContext &
    applicationNativeCommands.ApplicationNativeCommandsContext &
    applicationOutput.ApplicationOutputContext &
    applicationGoals.ApplicationGoalsContext &
    applicationPersistence.ApplicationPersistenceContext &
    applicationProjection.ApplicationProjectionContext &
    applicationBookSession.ApplicationBookSessionContext &
    applicationLibrary.ApplicationLibraryContext &
    applicationInteraction.ApplicationInteractionContext &
    applicationCovers.ApplicationCoversContext &
    applicationStartup.ApplicationStartupContext &
    applicationUpdates.ApplicationUpdatesContext = (() => {
    const owner = this;
    return {
      get state() {
        return owner.state;
      },
      get value() {
        return owner.value;
      },
      set value(value) {
        owner.value = value;
      },
      patch: (...args) => owner.patch(...args),
      get platform() {
        return owner.platform;
      },
      get fieldTypography() {
        return owner.fieldTypography;
      },
      set fieldTypography(value) {
        owner.fieldTypography = value;
      },
      get editor() {
        return owner.editor;
      },
      get publicationPageViewModel() {
        return owner.publicationPageViewModel;
      },
      set publicationPageViewModel(value) {
        owner.publicationPageViewModel = value;
      },
      request: (...args) => owner.request(...args),
      get factory() {
        return owner.factory;
      },
      get rendered() {
        return owner.rendered;
      },
      initialize: (...args) => owner.initialize(...args),
      prepareCovers: (...args) => owner.prepareCovers(...args),
      updateLibrary: (...args) => owner.updateLibrary(...args),
      fail: (...args) => owner.fail(...args),
      get hostRecoveryViewModel() {
        return owner.hostRecoveryViewModel;
      },
      set hostRecoveryViewModel(value) {
        owner.hostRecoveryViewModel = value;
      },
      get timer() {
        return owner.timer;
      },
      set timer(value) {
        owner.timer = value;
      },
      get session() {
        return owner.session;
      },
      get pendingStickies() {
        return owner.pendingStickies;
      },
      reopenPublicationPage: (...args) => owner.reopenPublicationPage(...args),
      keepExternalCopy: (...args) => owner.keepExternalCopy(...args),
      reloadExternal: (...args) => owner.reloadExternal(...args),
      get spellingViewModel() {
        return owner.spellingViewModel;
      },
      set spellingViewModel(value) {
        owner.spellingViewModel = value;
      },
      get effectiveSpellLanguage() {
        return owner.effectiveSpellLanguage;
      },
      get documentOutputViewModel() {
        return owner.documentOutputViewModel;
      },
      set documentOutputViewModel(value) {
        owner.documentOutputViewModel = value;
      },
      writingLanguage: (...args) => owner.writingLanguage(...args),
      save: (...args) => owner.save(...args),
      writable: (...args) => owner.writable(...args),
      generatedCover: (...args) => owner.generatedCover(...args),
      get emailDraftViewModel() {
        return owner.emailDraftViewModel;
      },
      set emailDraftViewModel(value) {
        owner.emailDraftViewModel = value;
      },
      prompt: (...args) => owner.prompt(...args),
      get coverArtViewModel() {
        return owner.coverArtViewModel;
      },
      set coverArtViewModel(value) {
        owner.coverArtViewModel = value;
      },
      updateCoverMetadata: (...args) => owner.updateCoverMetadata(...args),
      get coverGoalsViewModel() {
        return owner.coverGoalsViewModel;
      },
      set coverGoalsViewModel(value) {
        owner.coverGoalsViewModel = value;
      },
      get fontPickerViewModel() {
        return owner.fontPickerViewModel;
      },
      set fontPickerViewModel(value) {
        owner.fontPickerViewModel = value;
      },
      previewBodyFont: (...args) => owner.previewBodyFont(...args),
      preference: (...args) => owner.preference(...args),
      get keyboardNavigation() {
        return owner.keyboardNavigation;
      },
      set keyboardNavigation(value) {
        owner.keyboardNavigation = value;
      },
      get surfaces() {
        return owner.surfaces;
      },
      get librarySettingsViewModel() {
        return owner.librarySettingsViewModel;
      },
      set librarySettingsViewModel(value) {
        owner.librarySettingsViewModel = value;
      },
      closeBook: (...args) => owner.closeBook(...args),
      get searchViewModel() {
        return owner.searchViewModel;
      },
      set searchViewModel(value) {
        owner.searchViewModel = value;
      },
      focusOutline: (...args) => owner.focusOutline(...args),
      get libraryViewModel() {
        return owner.libraryViewModel;
      },
      set libraryViewModel(value) {
        owner.libraryViewModel = value;
      },
      confirm: (...args) => owner.confirm(...args),
      openBook: (...args) => owner.openBook(...args),
      openPublicationPage: (...args) => owner.openPublicationPage(...args),
      createPage: (...args) => owner.createPage(...args),
      get goalsViewModel() {
        return owner.goalsViewModel;
      },
      set goalsViewModel(value) {
        owner.goalsViewModel = value;
      },
      saveGoals: (...args) => owner.saveGoals(...args),
      endSprint: (...args) => owner.endSprint(...args),
      get progress() {
        return owner.progress;
      },
      project: (...args) => owner.project(...args),
      projectCounters: (...args) => owner.projectCounters(...args),
      overlayOpen: (...args) => owner.overlayOpen(...args),
      get tabPlaces() {
        return owner.tabPlaces;
      },
      setPanel: (...args) => owner.setPanel(...args),
      execute: (...args) => owner.execute(...args),
      closeEmailSettings: (...args) => owner.closeEmailSettings(...args),
      closeCoverArt: (...args) => owner.closeCoverArt(...args),
      closeFontPicker: (...args) => owner.closeFontPicker(...args),
      closeInformation: (...args) => owner.closeInformation(...args),
      closeLibrarySettings: (...args) => owner.closeLibrarySettings(...args),
      closeGoals: (...args) => owner.closeGoals(...args),
      answer: (...args) => owner.answer(...args),
      closeSearch: (...args) => owner.closeSearch(...args),
      undoAuthorMove: (...args) => owner.undoAuthorMove(...args),
      dismissMenu: (...args) => owner.dismissMenu(...args),
      get fullscreen() {
        return owner.fullscreen;
      },
      fullscreenChanged: (...args) => owner.fullscreenChanged(...args),
      toggleSpelling: (...args) => owner.toggleSpelling(...args),
      alignParagraph: (...args) => owner.alignParagraph(...args),
      openGoals: (...args) => owner.openGoals(...args),
      nativeCommand: (...args) => owner.nativeCommand(...args),
      cycleFocus: (...args) => owner.cycleFocus(...args),
      textSize: (...args) => owner.textSize(...args),
      showInformation: (...args) => owner.showInformation(...args),
      emailDraft: (...args) => owner.emailDraft(...args),
      redo: (...args) => owner.redo(...args),
      undo: (...args) => owner.undo(...args),
      newSticky: (...args) => owner.newSticky(...args),
      archive: (...args) => owner.archive(...args),
      openSearch: (...args) => owner.openSearch(...args),
      set editor(value) {
        owner.editor = value;
      },
      focusChapter: (...args) => owner.focusChapter(...args),
      createChapter: (...args) => owner.createChapter(...args),
      copyrightOptions: (...args) => owner.copyrightOptions(...args),
      renameChapter: (...args) => owner.renameChapter(...args),
      flushStickyEdits: (...args) => owner.flushStickyEdits(...args),
      get libraryUndo() {
        return owner.libraryUndo;
      },
      get libraryRedo() {
        return owner.libraryRedo;
      },
      get stickyTimer() {
        return owner.stickyTimer;
      },
      set stickyTimer(value) {
        owner.stickyTimer = value;
      },
      background: (...args) => owner.background(...args),
      removeSticky: (...args) => owner.removeSticky(...args),
      get spellingMenuGeneration() {
        return owner.spellingMenuGeneration;
      },
      set spellingMenuGeneration(value) {
        owner.spellingMenuGeneration = value;
      },
      get spellLanguageGeneration() {
        return owner.spellLanguageGeneration;
      },
      set spellLanguageGeneration(value) {
        owner.spellLanguageGeneration = value;
      },
      scheduleSpell: (...args) => owner.scheduleSpell(...args),
      synchronizeMenu: (...args) => owner.synchronizeMenu(...args),
      get spellActiveSection() {
        return owner.spellActiveSection;
      },
      set spellActiveSection(value) {
        owner.spellActiveSection = value;
      },
      setPageZoom: (...args) => owner.setPageZoom(...args),
      get libraryGeneration() {
        return owner.libraryGeneration;
      },
      set libraryGeneration(value) {
        owner.libraryGeneration = value;
      },
      scheduleAppearanceSave: (...args) => owner.scheduleAppearanceSave(...args),
      get appearanceTimer() {
        return owner.appearanceTimer;
      },
      set appearanceTimer(value) {
        owner.appearanceTimer = value;
      },
      flushAppearance: (...args) => owner.flushAppearance(...args),
      get appearanceWaiters() {
        return owner.appearanceWaiters;
      },
      scheduleMenu: (...args) => owner.scheduleMenu(...args),
      editOutline: (...args) => owner.editOutline(...args),
      get updates() {
        return owner.updates;
      },
      set updates(value) {
        owner.updates = value;
      },
      initializeUpdates: (...args) => owner.initializeUpdates(...args),
      get nativeMenuPending() {
        return owner.nativeMenuPending;
      },
      set nativeMenuPending(value) {
        owner.nativeMenuPending = value;
      },
      get nativeMenuSignature() {
        return owner.nativeMenuSignature;
      },
      set nativeMenuSignature(value) {
        owner.nativeMenuSignature = value;
      },
      set fullscreen(value) {
        owner.fullscreen = value;
      },
      applyPlatformDropcap: (...args) => owner.applyPlatformDropcap(...args),
      bodyFontStyle: (...args) => owner.bodyFontStyle(...args),
      deleteChapter: (...args) => owner.deleteChapter(...args),
      setChapterKind: (...args) => owner.setChapterKind(...args),
      exportChapter: (...args) => owner.exportChapter(...args),
      renameChapterPrompt: (...args) => owner.renameChapterPrompt(...args),
      duplicateChapter: (...args) => owner.duplicateChapter(...args),
      reorderChapter: (...args) => owner.reorderChapter(...args),
      menu: (...args) => owner.menu(...args),
      format: (...args) => owner.format(...args),
      togglePoetry: (...args) => owner.togglePoetry(...args),
      bookGoal: (...args) => owner.bookGoal(...args),
      dailyGoal: (...args) => owner.dailyGoal(...args),
      startSprint: (...args) => owner.startSprint(...args),
      importBooks: (...args) => owner.importBooks(...args),
      reshelveBook: (...args) => owner.reshelveBook(...args),
      openFontPicker: (...args) => owner.openFontPicker(...args),
      openCoverSettings: (...args) => owner.openCoverSettings(...args),
      openEmailSettings: (...args) => owner.openEmailSettings(...args),
      libraryFolder: (...args) => owner.libraryFolder(...args),
      newBook: (...args) => owner.newBook(...args),
      exportBook: (...args) => owner.exportBook(...args),
      zoom: (...args) => owner.zoom(...args),
      pasteMatchStyle: (...args) => owner.pasteMatchStyle(...args),
      moveBook: (...args) => owner.moveBook(...args),
      set progress(value) {
        owner.progress = value;
      },
      get progressBaseline() {
        return owner.progressBaseline;
      },
      set progressBaseline(value) {
        owner.progressBaseline = value;
      },
      get externalReconciliation() {
        return owner.externalReconciliation;
      },
      set externalReconciliation(value) {
        owner.externalReconciliation = value;
      },
      rememberReadingPosition: (...args) => owner.rememberReadingPosition(...args),
      set session(value) {
        owner.session = value;
      },
      documentChanged: (...args) => owner.documentChanged(...args),
      get committedDocument() {
        return owner.committedDocument;
      },
      set committedDocument(value) {
        owner.committedDocument = value;
      },
      get documentVersions() {
        return owner.documentVersions;
      },
      set documentVersions(value) {
        owner.documentVersions = value;
      },
      get lease() {
        return owner.lease;
      },
      set lease(value) {
        owner.lease = value;
      },
      get pendingRemotePosition() {
        return owner.pendingRemotePosition;
      },
      set pendingRemotePosition(value) {
        owner.pendingRemotePosition = value;
      },
      tryRemotePosition: (...args) => owner.tryRemotePosition(...args),
      get telemetry() {
        return owner.telemetry;
      },
      projectState: (...args) => owner.projectState(...args),
      get previewCache() {
        return owner.previewCache;
      },
      get preview() {
        return owner.preview;
      },
      get mountedRoot() {
        return owner.mountedRoot;
      },
      set mountedRoot(value) {
        owner.mountedRoot = value;
      },
      get readingActivity() {
        return owner.readingActivity;
      },
      set readingActivity(value) {
        owner.readingActivity = value;
      },
      get bookTransitions() {
        return owner.bookTransitions;
      },
      set bookTransitions(value) {
        owner.bookTransitions = value;
      },
      transitionBook: (...args) => owner.transitionBook(...args),
      openBookNow: (...args) => owner.openBookNow(...args),
      closePublicationPage: (...args) => owner.closePublicationPage(...args),
      closeBookNow: (...args) => owner.closeBookNow(...args),
      set surfaces(value) {
        owner.surfaces = value;
      },
      showSide: (...args) => owner.showSide(...args),
      spellingMenu: (...args) => owner.spellingMenu(...args),
      get unsubscribe() {
        return owner.unsubscribe;
      },
      set unsubscribe(value) {
        owner.unsubscribe = value;
      },
      updateProgress: (...args) => owner.updateProgress(...args),
      activateSpellingSection: (...args) => owner.activateSpellingSection(...args),
      get libraryWrites() {
        return owner.libraryWrites;
      },
      set libraryRedo(value) {
        owner.libraryRedo = value;
      },
      get pendingLibraryWrites() {
        return owner.pendingLibraryWrites;
      },
      set pendingLibraryWrites(value) {
        owner.pendingLibraryWrites = value;
      },
      set libraryWrites(value) {
        owner.libraryWrites = value;
      },
      moveShelf: (...args) => owner.moveShelf(...args),
      exportShelf: (...args) => owner.exportShelf(...args),
      get coverProvider() {
        return owner.coverProvider;
      },
      get runtimeFailureNotified() {
        return owner.runtimeFailureNotified;
      },
      set runtimeFailureNotified(value) {
        owner.runtimeFailureNotified = value;
      },
      regenerateCover: (...args) => owner.regenerateCover(...args),
      set coverProvider(value) {
        owner.coverProvider = value;
      },
      get coverGeneration() {
        return owner.coverGeneration;
      },
      set coverGeneration(value) {
        owner.coverGeneration = value;
      },
      refreshLibraryFromDisk: (...args) => owner.refreshLibraryFromDisk(...args),
      get refreshingLibrary() {
        return owner.refreshingLibrary;
      },
      set refreshingLibrary(value) {
        owner.refreshingLibrary = value;
      },
      get updateListeners() {
        return owner.updateListeners;
      },
    };
  })();
  private readonly commands = applicationCommands(this.operations);

  readonly state = createApplicationState();
  private value!: AppState;
  private publicationPageViewModel!: PublicationPageViewModel;
  private hostRecoveryViewModel!: HostRecoveryViewModel;
  private spellingViewModel!: SpellingViewModel;
  private spellActiveSection: string | null = null;
  private spellLanguageGeneration = 0;
  private spellingMenuGeneration = 0;
  private documentOutputViewModel!: DocumentOutputViewModel;
  private emailDraftViewModel!: EmailDraftViewModel;
  private coverArtViewModel!: CoverArtViewModel;
  private coverGoalsViewModel!: CoverGoalsViewModel;
  private fontPickerViewModel!: FontPickerViewModel;
  private goalsViewModel!: GoalsViewModel;
  private libraryViewModel!: LibraryViewModel;
  private searchViewModel!: SearchViewModel;
  private librarySettingsViewModel!: LibrarySettingsViewModel;
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
  private keyboardNavigation!: KeyboardNavigation;
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
  initializeUpdates = this.commands.initializeUpdates;
  updateStatusChanged = this.commands.updateStatusChanged;
  updateWake = this.commands.updateWake;
  disposeUpdates = this.commands.disposeUpdates;
  restartForUpdate = this.commands.restartForUpdate;
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
    this.wire(typography);
  }
  private wire(typography?: TextTypographyPort): void {
    return applicationWiring.wire(this.operations, typography);
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
  initialize = this.commands.initialize;
  private writingLanguage(preferences = this.value.library): string {
    return applicationStartup.writingLanguage(this.operations, preferences);
  }
  private get effectiveSpellLanguage(): string {
    return applicationStartup.effectiveSpellLanguage(this.operations);
  }
  bodyFontStyle = this.commands.bodyFontStyle;
  private applyPlatformDropcap(): void {
    return applicationStartup.applyPlatformDropcap(this.operations);
  }
  private previewBodyFont(font: string): void {
    return applicationStartup.previewBodyFont(this.operations, font);
  }
  private overlayOpen(): boolean {
    return applicationStartup.overlayOpen(this.operations);
  }
  refreshLibraryFromDisk = this.commands.refreshLibraryFromDisk;
  hostFailed = this.commands.hostFailed;
  recoverHost = this.commands.recoverHost;
  emailDraft = this.commands.emailDraft;
  openEmailSettings = this.commands.openEmailSettings;
  chooseEmailMethod = this.commands.chooseEmailMethod;
  closeEmailSettings = this.commands.closeEmailSettings;
  openCoverSettings = this.commands.openCoverSettings;
  editCoverSettings = this.commands.editCoverSettings;
  saveCoverSettings = this.commands.saveCoverSettings;
  closeCoverArt = this.commands.closeCoverArt;
  openCoverChoices = this.commands.openCoverChoices;
  chooseCover = this.commands.chooseCover;
  coverArtProgress = this.commands.coverArtProgress;
  openFontPicker = this.commands.openFontPicker;
  searchFonts = this.commands.searchFonts;
  previewFont = this.commands.previewFont;
  leaveFontList = this.commands.leaveFontList;
  chooseFont = this.commands.chooseFont;
  fontPickerEnter = this.commands.fontPickerEnter;
  closeFontPicker = this.commands.closeFontPicker;
  private async updateCoverMetadata(
    id: string,
    patch: Record<string, JSONValue>,
    history = true,
  ): Promise<void> {
    return applicationCovers.updateCoverMetadata(this.operations, id, patch, history);
  }
  private coverGeneration = 0;
  private async prepareCovers(): Promise<void> {
    return applicationCovers.prepareCovers(this.operations);
  }
  private writable(): boolean {
    return applicationCovers.writable(this.operations);
  }
  private runtimeFailureNotified = false;
  reportRuntimeFailure = this.commands.reportRuntimeFailure;
  private fail(error: unknown): void {
    return applicationInteraction.fail(this.operations, error);
  }
  background = this.commands.background;
  execute = this.commands.execute;
  prompt = this.commands.prompt;
  modalValue = this.commands.modalValue;
  answer = this.commands.answer;
  menu = this.commands.menu;
  dismissHint = this.commands.dismissHint;
  dismissMenu = this.commands.dismissMenu;
  updateLibrary = this.commands.updateLibrary;
  onboard = this.commands.onboard;
  newShelf = this.commands.newShelf;
  renameShelf = this.commands.renameShelf;
  deleteShelf = this.commands.deleteShelf;
  dropShelf = this.commands.dropShelf;
  moveShelf = this.commands.moveShelf;

  bindShelf = this.commands.bindShelf;
  private async createPage(
    shelf: LibraryValue['shelves'][number],
    kind: string,
  ): Promise<{ [x: string]: z.core.util.JSONType; id: string; title: string; author: string }> {
    return applicationLibrary.createPage(this.operations, shelf, kind);
  }
  addBoundPage = this.commands.addBoundPage;
  newAuthor = this.commands.newAuthor;
  chooseAuthor = this.commands.chooseAuthor;
  renameAuthor = this.commands.renameAuthor;
  deleteAuthor = this.commands.deleteAuthor;
  newBook = this.commands.newBook;
  moveBook = this.commands.moveBook;
  moveToAuthor = this.commands.moveToAuthor;
  undoAuthorMove = this.commands.undoAuthorMove;
  deleteBook = this.commands.deleteBook;
  setCoverGoal = this.commands.setCoverGoal;
  exportBoundBook = this.commands.exportBoundBook;
  exportShelfAnthology = this.commands.exportShelfAnthology;
  setCover = this.commands.setCover;
  exportShelf = this.commands.exportShelf;
  shelfNumbering = this.commands.shelfNumbering;
  regenerateCover = this.commands.regenerateCover;
  removeCover = this.commands.removeCover;
  renameBook = this.commands.renameBook;
  private async generatedCover(id: string): Promise<string | undefined> {
    return applicationLibrary.generatedCover(this.operations, id);
  }
  openPublicationPage = this.commands.openPublicationPage;
  private async reopenPublicationPage(): Promise<void> {
    return applicationLibrary.reopenPublicationPage(this.operations);
  }
  bindPublicationPage = this.commands.bindPublicationPage;
  editPublicationTitle = this.commands.editPublicationTitle;
  pastePublicationTitle = this.commands.pastePublicationTitle;
  enterPublicationTitle = this.commands.enterPublicationTitle;
  closePublicationPage = this.commands.closePublicationPage;
  publicationUndo = this.commands.publicationUndo;
  publicationRedo = this.commands.publicationRedo;
  removeFromShelf = this.commands.removeFromShelf;
  reshelveBook = this.commands.reshelveBook;
  private transitionBook(command: () => Promise<void>): Promise<void> {
    return applicationBookSession.transitionBook(this.operations, command);
  }
  openBook = this.commands.openBook;
  private async openBookNow(id: string): Promise<void> {
    return applicationBookSession.openBookNow(this.operations, id);
  }
  project = this.commands.project;
  private projectState(): void {
    return applicationProjection.projectState(this.operations);
  }
  readingActivityOccurred = this.commands.readingActivityOccurred;
  private rememberReadingPosition(): void {
    return applicationProjection.rememberReadingPosition(this.operations);
  }
  private tryRemotePosition(): boolean {
    return applicationProjection.tryRemotePosition(this.operations);
  }
  flushForBackground = this.commands.flushForBackground;
  save = this.commands.save;
  closeBook = this.commands.closeBook;
  private async closeBookNow(save = true): Promise<void> {
    return applicationBookSession.closeBookNow(this.operations, save);
  }
  documentChanged = this.commands.documentChanged;
  reloadExternal = this.commands.reloadExternal;
  keepExternalCopy = this.commands.keepExternalCopy;
  private updateProgress(): void {
    return applicationGoals.updateProgress(this.operations);
  }
  startSprint = this.commands.startSprint;
  endSprint = this.commands.endSprint;
  showBookFolder = this.commands.showBookFolder;
  filesDropped = this.commands.filesDropped;
  importBooks = this.commands.importBooks;
  exportBook = this.commands.exportBook;
  exportChapter = this.commands.exportChapter;
  printChapter = this.commands.printChapter;
  exportMenu = this.commands.exportMenu;
  finishClose = this.commands.finishClose;
  nativeCommand = this.commands.nativeCommand;
  showInformation = this.commands.showInformation;
  closeInformation = this.commands.closeInformation;
  private scheduleMenu(): void {
    return applicationMenus.scheduleMenu(this.operations);
  }
  private async synchronizeMenu(): Promise<void> {
    return applicationMenus.synchronizeMenu(this.operations);
  }
  fullscreenChanged = this.commands.fullscreenChanged;
  cycleFocus = this.commands.cycleFocus;
  textSize = this.commands.textSize;
  pasteMatchStyle = this.commands.pasteMatchStyle;
  libraryFolder = this.commands.libraryFolder;
  closeLibrarySettings = this.commands.closeLibrarySettings;
  chooseLibraryFolder = this.commands.chooseLibraryFolder;
  backupLibrary = this.commands.backupLibrary;
  revealLibrary = this.commands.revealLibrary;
  confirm = this.commands.confirm;
  editPreference = this.commands.editPreference;
  openGoals = this.commands.openGoals;
  editGoal = this.commands.editGoal;
  closeGoals = this.commands.closeGoals;
  goalsSprint = this.commands.goalsSprint;
  private async saveGoals(draft: GoalsDraft): Promise<void> {
    return applicationGoals.saveGoals(this.operations, draft);
  }
  bookGoal = this.commands.bookGoal;
  dailyGoal = this.commands.dailyGoal;
  renameTab = this.commands.renameTab;
  focusOutline = this.commands.focusOutline;
  editOutline = this.commands.editOutline;
  outlineKey = this.commands.outlineKey;
  outlineContext = this.commands.outlineContext;
  chapterNote = this.commands.chapterNote;
  chapterContext = this.commands.chapterContext;
  chapterInsertionContext = this.commands.chapterInsertionContext;
  formatMenu = this.commands.formatMenu;
  fileMenu = this.commands.fileMenu;
  viewMenu = this.commands.viewMenu;
  preference = this.commands.preference;
  toggleSpelling = this.commands.toggleSpelling;
  private activateSpellingSection(): void {
    return applicationPreferences.activateSpellingSection(this.operations);
  }
  private scheduleSpell(): void {
    return applicationPreferences.scheduleSpell(this.operations);
  }
  private async scanSpelling(): Promise<void> {
    return applicationPreferences.scanSpelling(this.operations);
  }
  private async spellingMenu(
    target: Annotation & { text: string; x: number; y: number },
  ): Promise<void> {
    return applicationSpelling.spellingMenu(this.operations, target);
  }
  togglePoetry = this.commands.togglePoetry;
  openingPoetry = this.commands.openingPoetry;
  newSticky = this.commands.newSticky;
  updateSticky = this.commands.updateSticky;
  private flushStickyEdits(): void {
    return applicationAnnotations.flushStickyEdits(this.operations);
  }
  resolveSticky = this.commands.resolveSticky;
  removeSticky = this.commands.removeSticky;
  selectSticky = this.commands.selectSticky;
  setPanel = this.commands.setPanel;
  setMetadata = this.commands.setMetadata;
  editMetadataField = this.commands.editMetadataField;
  finishMetadataField = this.commands.finishMetadataField;
  enterTitlePage = this.commands.enterTitlePage;
  createChapter = this.commands.createChapter;
  renameChapter = this.commands.renameChapter;
  renameChapterPrompt = this.commands.renameChapterPrompt;
  duplicateChapter = this.commands.duplicateChapter;
  deleteChapter = this.commands.deleteChapter;
  reorderChapter = this.commands.reorderChapter;
  setChapterKind = this.commands.setChapterKind;
  private copyrightOptions(
    kind: string,
  ): { copyrightStarter: { notice: string; rights: string } } | undefined {
    return applicationAuthorCommands.copyrightOptions(this.operations, kind);
  }
  focusScreenplayScene = this.commands.focusScreenplayScene;
  focusChapter = this.commands.focusChapter;
  undo = this.commands.undo;
  redo = this.commands.redo;
  alignParagraph = this.commands.alignParagraph;
  format = this.commands.format;
  archive = this.commands.archive;
  archiveDropped = this.commands.archiveDropped;
  restore = this.commands.restore;
  removeDarling = this.commands.removeDarling;

  openSearch = this.commands.openSearch;
  searchKey = this.commands.searchKey;
  closeSearch = this.commands.closeSearch;
  search = this.commands.search;
  nextMatch = this.commands.nextMatch;
  private focusMatch(id: string): void {
    return applicationAuthorCommands.focusMatch(this.operations, id);
  }
  replace = this.commands.replace;

  cycleWordCounter = this.commands.cycleWordCounter;
  trackVisibleChapter = this.commands.trackVisibleChapter;
  private projectCounters(id: string): void {
    return applicationNavigation.projectCounters(this.operations, id);
  }
  zoom = this.commands.zoom;
  private setPageZoom(next: number, point?: { x: number; y: number }): void {
    return applicationPreferences.setPageZoom(this.operations, next, point);
  }
  private scheduleAppearanceSave(): void {
    return applicationPreferences.scheduleAppearanceSave(this.operations);
  }
  private async flushAppearance(): Promise<void> {
    return applicationPreferences.flushAppearance(this.operations);
  }
  pageZoomWheel = this.commands.pageZoomWheel;
  zoomControlWheel = this.commands.zoomControlWheel;
  systemContrastChanged = this.commands.systemContrastChanged;
  chapterNavigationKey = this.commands.chapterNavigationKey;
  showNav = this.commands.showNav;
  showSide = this.commands.showSide;
  toggleNav = this.commands.toggleNav;
  toggleSide = this.commands.toggleSide;
  fieldTypographyKey = this.commands.fieldTypographyKey;
  key = this.commands.key;
}
