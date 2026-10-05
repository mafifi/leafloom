import { type RuntimeErrorReportValue } from '@leafloom/desktop-host';
import type { MetadataField } from '@leafloom/editor-contracts';
import { type OutlineTarget } from '@leafloom/editor-contracts';
import { type LibraryValue } from '@leafloom/library';
import * as applicationAnnotations from './application-annotations';
import * as applicationAuthorCommands from './application-author-commands';
import * as applicationBookSession from './application-book-session';
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
import type { MenuItem } from './application-types';
import * as applicationUpdates from './application-updates';
import * as applicationWiring from './application-wiring';
import { type CoverArtDraft, type CoverChoice } from './cover-art';
import { type OutputFormat } from './document-output';
import { type EmailMethod } from './email-draft';
import { type GoalsDraft } from './goals';
import type { InformationPresentation } from './information';
import { LibraryViewModel } from './library-view-model';
import { type TitleField } from './publication-page';
import { SearchViewModel } from './search-view-model';

export type ApplicationCommandsContext = applicationWiring.ApplicationWiringContext &
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
  applicationUpdates.ApplicationUpdatesContext;

export function applicationCommands(context: ApplicationCommandsContext) {
  return {
    initializeUpdates: async (packaged: boolean): Promise<void> => {
      return applicationUpdates.initializeUpdates(context, packaged);
    },
    updateStatusChanged: (value: unknown): void => {
      return applicationUpdates.updateStatusChanged(context, value);
    },
    updateWake: (): void => {
      return applicationUpdates.updateWake(context);
    },
    disposeUpdates: (): void => {
      return applicationUpdates.disposeUpdates(context);
    },
    restartForUpdate: async (): Promise<void> => {
      return applicationUpdates.restartForUpdate(context);
    },
    initialize: async (): Promise<void> => {
      return applicationStartup.initialize(context);
    },
    bodyFontStyle: (font: string): string => {
      return applicationStartup.bodyFontStyle(context, font);
    },
    refreshLibraryFromDisk: async (): Promise<void> => {
      return applicationStartup.refreshLibraryFromDisk(context);
    },
    hostFailed: (value: unknown): void => {
      return applicationCovers.hostFailed(context, value);
    },
    recoverHost: async (): Promise<void> => {
      return applicationCovers.recoverHost(context);
    },
    emailDraft: async (): Promise<void> => {
      return applicationCovers.emailDraft(context);
    },
    openEmailSettings: async (): Promise<void> => {
      return applicationCovers.openEmailSettings(context);
    },
    chooseEmailMethod: (method: EmailMethod): Promise<void> => {
      return applicationCovers.chooseEmailMethod(context, method);
    },
    closeEmailSettings: (): void => {
      return applicationCovers.closeEmailSettings(context);
    },
    openCoverSettings: async (): Promise<void> => {
      return applicationCovers.openCoverSettings(context);
    },
    editCoverSettings: (field: keyof CoverArtDraft, value: string | boolean): void => {
      return applicationCovers.editCoverSettings(context, field, value);
    },
    saveCoverSettings: (): Promise<void> => {
      return applicationCovers.saveCoverSettings(context);
    },
    closeCoverArt: (): void => {
      return applicationCovers.closeCoverArt(context);
    },
    openCoverChoices: async (id: string): Promise<void> => {
      return applicationCovers.openCoverChoices(context, id);
    },
    chooseCover: (id: string, choice: CoverChoice): Promise<void> => {
      return applicationCovers.chooseCover(context, id, choice);
    },
    coverArtProgress: (value: unknown): Promise<void> => {
      return applicationCovers.coverArtProgress(context, value);
    },
    openFontPicker: async (): Promise<void> => {
      return applicationCovers.openFontPicker(context);
    },
    searchFonts: (query: string): void => {
      return applicationCovers.searchFonts(context, query);
    },
    previewFont: (font: string): void => {
      return applicationCovers.previewFont(context, font);
    },
    leaveFontList: (): void => {
      return applicationCovers.leaveFontList(context);
    },
    chooseFont: (font: string): Promise<void> => {
      return applicationCovers.chooseFont(context, font);
    },
    fontPickerEnter: (): Promise<void> => {
      return applicationCovers.fontPickerEnter(context);
    },
    closeFontPicker: (): void => {
      return applicationCovers.closeFontPicker(context);
    },
    reportRuntimeFailure: async (value: RuntimeErrorReportValue): Promise<void> => {
      return applicationInteraction.reportRuntimeFailure(context, value);
    },
    background: async (command: () => void | Promise<void>): Promise<void> => {
      return applicationInteraction.background(context, command);
    },
    execute: async (
      command: () => void | Promise<void>,
      options: { closeMenu?: boolean } = {},
    ): Promise<void> => {
      return applicationInteraction.execute(context, command, options);
    },
    prompt: (
      title: string,
      value = '',
      label = 'Name',
      confirm = 'Save',
    ): Promise<string | null> => {
      return applicationInteraction.prompt(context, title, value, label, confirm);
    },
    modalValue: (value: string): void => {
      return applicationInteraction.modalValue(context, value);
    },
    answer: (value: string | null): void => {
      return applicationInteraction.answer(context, value);
    },
    menu: (event: MouseEvent, items: MenuItem[]): void => {
      return applicationInteraction.menu(context, event, items);
    },
    dismissHint: (): void => {
      return applicationInteraction.dismissHint(context);
    },
    dismissMenu: (): void => {
      return applicationInteraction.dismissMenu(context);
    },
    updateLibrary: async (value: LibraryValue, history = false): Promise<void> => {
      return applicationLibrary.updateLibrary(context, value, history);
    },
    onboard: async (
      name: string,
      style: 'pantser' | 'plotter',
      pen = '',
      fonts = { body: 'Georgia', dropcap: 'literary' },
    ): Promise<void> => {
      return applicationLibrary.onboard(context, name, style, pen, fonts);
    },
    newShelf: (...args: Parameters<LibraryViewModel['newShelf']>): Promise<void> => {
      return applicationLibrary.newShelf(context, ...args);
    },
    renameShelf: (...args: Parameters<LibraryViewModel['renameShelf']>): Promise<void> => {
      return applicationLibrary.renameShelf(context, ...args);
    },
    deleteShelf: (...args: Parameters<LibraryViewModel['deleteShelf']>): Promise<void> => {
      return applicationLibrary.deleteShelf(context, ...args);
    },
    dropShelf: async (id: string, targetId: string, after: boolean): Promise<void> => {
      return applicationLibrary.dropShelf(context, id, targetId, after);
    },
    moveShelf: (...args: Parameters<LibraryViewModel['moveShelf']>): Promise<void> => {
      return applicationLibrary.moveShelf(context, ...args);
    },
    bindShelf: (...args: Parameters<LibraryViewModel['bindShelf']>): Promise<void> => {
      return applicationLibrary.bindShelf(context, ...args);
    },
    addBoundPage: (...args: Parameters<LibraryViewModel['addBoundPage']>): Promise<void> => {
      return applicationLibrary.addBoundPage(context, ...args);
    },
    newAuthor: (...args: Parameters<LibraryViewModel['newAuthor']>): Promise<void> => {
      return applicationLibrary.newAuthor(context, ...args);
    },
    chooseAuthor: (...args: Parameters<LibraryViewModel['chooseAuthor']>): Promise<void> => {
      return applicationLibrary.chooseAuthor(context, ...args);
    },
    renameAuthor: (...args: Parameters<LibraryViewModel['renameAuthor']>): Promise<void> => {
      return applicationLibrary.renameAuthor(context, ...args);
    },
    deleteAuthor: (...args: Parameters<LibraryViewModel['deleteAuthor']>): Promise<void> => {
      return applicationLibrary.deleteAuthor(context, ...args);
    },
    newBook: (...args: Parameters<LibraryViewModel['newBook']>): Promise<void> => {
      return applicationLibrary.newBook(context, ...args);
    },
    moveBook: (...args: Parameters<LibraryViewModel['moveBook']>): Promise<void> => {
      return applicationLibrary.moveBook(context, ...args);
    },
    moveToAuthor: (...args: Parameters<LibraryViewModel['moveToAuthor']>): Promise<void> => {
      return applicationLibrary.moveToAuthor(context, ...args);
    },
    undoAuthorMove: (...args: Parameters<LibraryViewModel['undoAuthorMove']>): Promise<void> => {
      return applicationLibrary.undoAuthorMove(context, ...args);
    },
    deleteBook: (...args: Parameters<LibraryViewModel['deleteBook']>): Promise<void> => {
      return applicationLibrary.deleteBook(context, ...args);
    },
    setCoverGoal: async (id: string): Promise<void> => {
      return applicationLibrary.setCoverGoal(context, id);
    },
    exportBoundBook: async (shelfId: string): Promise<void> => {
      return applicationLibrary.exportBoundBook(context, shelfId);
    },
    exportShelfAnthology: (id: string): Promise<void> => {
      return applicationLibrary.exportShelfAnthology(context, id);
    },
    setCover: async (id: string): Promise<void> => {
      return applicationLibrary.setCover(context, id);
    },
    exportShelf: (...args: Parameters<LibraryViewModel['exportShelf']>): Promise<void> => {
      return applicationLibrary.exportShelf(context, ...args);
    },
    shelfNumbering: (...args: Parameters<LibraryViewModel['shelfNumbering']>): Promise<void> => {
      return applicationLibrary.shelfNumbering(context, ...args);
    },
    regenerateCover: (...args: Parameters<LibraryViewModel['regenerateCover']>): Promise<void> => {
      return applicationLibrary.regenerateCover(context, ...args);
    },
    removeCover: (...args: Parameters<LibraryViewModel['removeCover']>): Promise<void> => {
      return applicationLibrary.removeCover(context, ...args);
    },
    renameBook: (...args: Parameters<LibraryViewModel['renameBook']>): Promise<void> => {
      return applicationLibrary.renameBook(context, ...args);
    },
    openPublicationPage: async (id: string, label?: string, shelfId?: string): Promise<void> => {
      return applicationLibrary.openPublicationPage(context, id, label, shelfId);
    },
    bindPublicationPage: (body: HTMLElement, auxiliary: HTMLElement): void => {
      return applicationLibrary.bindPublicationPage(context, body, auxiliary);
    },
    editPublicationTitle: (field: TitleField, text: string): void => {
      return applicationLibrary.editPublicationTitle(context, field, text);
    },
    pastePublicationTitle: (field: TitleField, text: string, from: number, to: number): void => {
      return applicationLibrary.pastePublicationTitle(context, field, text, from, to);
    },
    enterPublicationTitle: async (field: TitleField): Promise<void> => {
      return applicationLibrary.enterPublicationTitle(context, field);
    },
    closePublicationPage: async (): Promise<void> => {
      return applicationLibrary.closePublicationPage(context);
    },
    publicationUndo: (): void => {
      return applicationLibrary.publicationUndo(context);
    },
    publicationRedo: (): void => {
      return applicationLibrary.publicationRedo(context);
    },
    removeFromShelf: async (id: string): Promise<void> => {
      return applicationLibrary.removeFromShelf(context, id);
    },
    reshelveBook: async (): Promise<void> => {
      return applicationLibrary.reshelveBook(context);
    },
    openBook: (id: string): Promise<void> => {
      return applicationBookSession.openBook(context, id);
    },
    project: (): void => {
      return applicationProjection.project(context);
    },
    readingActivityOccurred: (at = Date.now()): void => {
      return applicationProjection.readingActivityOccurred(context, at);
    },
    flushForBackground: async (): Promise<void> => {
      return applicationPersistence.flushForBackground(context);
    },
    save: async (): Promise<void> => {
      return applicationPersistence.save(context);
    },
    closeBook: (save = true): Promise<void> => {
      return applicationBookSession.closeBook(context, save);
    },
    documentChanged: async (raw: unknown): Promise<void> => {
      return applicationPersistence.documentChanged(context, raw);
    },
    reloadExternal: async (): Promise<void> => {
      return applicationPersistence.reloadExternal(context);
    },
    keepExternalCopy: async (): Promise<void> => {
      return applicationPersistence.keepExternalCopy(context);
    },
    startSprint: async (): Promise<void> => {
      return applicationGoals.startSprint(context);
    },
    endSprint: (): void => {
      return applicationGoals.endSprint(context);
    },
    showBookFolder: async (id: string): Promise<void> => {
      return applicationOutput.showBookFolder(context, id);
    },
    filesDropped: async (raw: unknown): Promise<void> => {
      return applicationOutput.filesDropped(context, raw);
    },
    importBooks: async (): Promise<void> => {
      return applicationOutput.importBooks(context);
    },
    exportBook: async (format: OutputFormat): Promise<void> => {
      return applicationOutput.exportBook(context, format);
    },
    exportChapter: async (id: string): Promise<void> => {
      return applicationOutput.exportChapter(context, id);
    },
    printChapter: async (id: string): Promise<void> => {
      return applicationOutput.printChapter(context, id);
    },
    exportMenu: (event: MouseEvent): void => {
      return applicationOutput.exportMenu(context, event);
    },
    finishClose: async (): Promise<void> => {
      return applicationOutput.finishClose(context);
    },
    nativeCommand: async (command: string): Promise<void> => {
      return applicationNativeCommands.nativeCommand(context, command);
    },
    showInformation: async (kind: InformationPresentation['kind']): Promise<void> => {
      return applicationMenus.showInformation(context, kind);
    },
    closeInformation: (): void => {
      return applicationMenus.closeInformation(context);
    },
    fullscreenChanged: (raw: unknown): void => {
      return applicationMenus.fullscreenChanged(context, raw);
    },
    cycleFocus: async (): Promise<void> => {
      return applicationMenus.cycleFocus(context);
    },
    textSize: async (delta: number): Promise<void> => {
      return applicationMenus.textSize(context, delta);
    },
    pasteMatchStyle: async (): Promise<void> => {
      return applicationMenus.pasteMatchStyle(context);
    },
    libraryFolder: (): Promise<void> | undefined => {
      return applicationMenus.libraryFolder(context);
    },
    closeLibrarySettings: (): void => {
      return applicationMenus.closeLibrarySettings(context);
    },
    chooseLibraryFolder: (defaultFolder = false): Promise<void> => {
      return applicationMenus.chooseLibraryFolder(context, defaultFolder);
    },
    backupLibrary: (): Promise<void> => {
      return applicationMenus.backupLibrary(context);
    },
    revealLibrary: (): Promise<void> => {
      return applicationMenus.revealLibrary(context);
    },
    confirm: (title: string, message: string, label = 'Delete'): Promise<boolean> => {
      return applicationInteraction.confirm(context, title, message, label);
    },
    editPreference: async (key: string, title: string, value: unknown): Promise<void> => {
      return applicationInteraction.editPreference(context, key, title, value);
    },
    openGoals: (): void => {
      return applicationGoals.openGoals(context);
    },
    editGoal: (field: keyof GoalsDraft, value: string): void => {
      return applicationGoals.editGoal(context, field, value);
    },
    closeGoals: async (): Promise<void> => {
      return applicationGoals.closeGoals(context);
    },
    goalsSprint: async (): Promise<void> => {
      return applicationGoals.goalsSprint(context);
    },
    bookGoal: async (): Promise<void> => {
      return applicationGoals.bookGoal(context);
    },
    dailyGoal: async (): Promise<void> => {
      return applicationGoals.dailyGoal(context);
    },
    renameTab: async (tab: 'notes' | 'outline'): Promise<void> => {
      return applicationOutline.renameTab(context, tab);
    },
    focusOutline: (target?: OutlineTarget): void => {
      return applicationOutline.focusOutline(context, target);
    },
    editOutline: (target: OutlineTarget, value: string): void => {
      return applicationOutline.editOutline(context, target, value);
    },
    outlineKey: (target: OutlineTarget, event: KeyboardEvent): void => {
      return applicationOutline.outlineKey(context, target, event);
    },
    outlineContext: (target: OutlineTarget): MenuItem[] => {
      return applicationMenus.outlineContext(context, target);
    },
    chapterNote: (id: string, value: string): void => {
      return applicationMenus.chapterNote(context, id, value);
    },
    chapterContext: (id: string, index: number): MenuItem[] => {
      return applicationMenus.chapterContext(context, id, index);
    },
    chapterInsertionContext: (index: number): MenuItem[] => {
      return applicationMenus.chapterInsertionContext(context, index);
    },
    formatMenu: (event: MouseEvent): void => {
      return applicationMenus.formatMenu(context, event);
    },
    fileMenu: (event: MouseEvent): void => {
      return applicationMenus.fileMenu(context, event);
    },
    viewMenu: (event: MouseEvent): void => {
      return applicationMenus.viewMenu(context, event);
    },
    preference: async (key: string, value: unknown): Promise<void> => {
      return applicationPreferences.preference(context, key, value);
    },
    toggleSpelling: (): void => {
      return applicationPreferences.toggleSpelling(context);
    },
    togglePoetry: (): void => {
      return applicationAnnotations.togglePoetry(context);
    },
    openingPoetry: (id: string): void => {
      return applicationAnnotations.openingPoetry(context, id);
    },
    newSticky: async (): Promise<void> => {
      return applicationAnnotations.newSticky(context);
    },
    updateSticky: (id: string, text: string): void => {
      return applicationAnnotations.updateSticky(context, id, text);
    },
    resolveSticky: (id: string, resolved: boolean): void => {
      return applicationAnnotations.resolveSticky(context, id, resolved);
    },
    removeSticky: (id: string): void => {
      return applicationAnnotations.removeSticky(context, id);
    },
    selectSticky: async (id: string): Promise<void> => {
      return applicationAnnotations.selectSticky(context, id);
    },
    setPanel: (panel: string): void => {
      return applicationAnnotations.setPanel(context, panel);
    },
    setMetadata: (patch: { title?: string; subtitle?: string; author?: string }): void => {
      return applicationAuthorCommands.setMetadata(context, patch);
    },
    editMetadataField: (field: MetadataField, value: string): void => {
      return applicationAuthorCommands.editMetadataField(context, field, value);
    },
    finishMetadataField: (field: MetadataField): void => {
      return applicationAuthorCommands.finishMetadataField(context, field);
    },
    enterTitlePage: (): void => {
      return applicationAuthorCommands.enterTitlePage(context);
    },
    createChapter: (index?: number, kind?: string): void => {
      return applicationAuthorCommands.createChapter(context, index, kind);
    },
    renameChapter: (id: string, title: string): void => {
      return applicationAuthorCommands.renameChapter(context, id, title);
    },
    renameChapterPrompt: async (id: string): Promise<void> => {
      return applicationAuthorCommands.renameChapterPrompt(context, id);
    },
    duplicateChapter: (id: string): void => {
      return applicationAuthorCommands.duplicateChapter(context, id);
    },
    deleteChapter: (id: string): void => {
      return applicationAuthorCommands.deleteChapter(context, id);
    },
    reorderChapter: (id: string, index: number): void => {
      return applicationAuthorCommands.reorderChapter(context, id, index);
    },
    setChapterKind: (id: string, kind: string): void => {
      return applicationAuthorCommands.setChapterKind(context, id, kind);
    },
    focusScreenplayScene: (id: string): void => {
      context.setPanel('manuscript');
      context.editor?.selectPassage(id, 0);
      context.surfaces?.focus();
    },
    focusChapter: (id: string): void => {
      return applicationAuthorCommands.focusChapter(context, id);
    },
    undo: (): void => {
      return applicationAuthorCommands.undo(context);
    },
    redo: (): void => {
      return applicationAuthorCommands.redo(context);
    },
    alignParagraph: (value: 'left' | 'center' | 'right' | 'justify'): void => {
      return applicationAuthorCommands.alignParagraph(context, value);
    },
    format: (mark: 'bold' | 'italic'): void => {
      return applicationAuthorCommands.format(context, mark);
    },
    archive: (): void => {
      return applicationAuthorCommands.archive(context);
    },
    archiveDropped: (): void => {
      return applicationAuthorCommands.archiveDropped(context);
    },
    restore: (id: string): void => {
      return applicationAuthorCommands.restore(context, id);
    },
    removeDarling: async (id: string): Promise<void> => {
      return applicationAuthorCommands.removeDarling(context, id);
    },
    openSearch: (...args: Parameters<SearchViewModel['openSearch']>): void => {
      return applicationAuthorCommands.openSearch(context, ...args);
    },
    searchKey: (...args: Parameters<SearchViewModel['searchKey']>): void => {
      return applicationAuthorCommands.searchKey(context, ...args);
    },
    closeSearch: (...args: Parameters<SearchViewModel['closeSearch']>): void => {
      return applicationAuthorCommands.closeSearch(context, ...args);
    },
    search: (...args: Parameters<SearchViewModel['search']>): void => {
      return applicationAuthorCommands.search(context, ...args);
    },
    nextMatch: (...args: Parameters<SearchViewModel['nextMatch']>): void => {
      return applicationAuthorCommands.nextMatch(context, ...args);
    },
    replace: (...args: Parameters<SearchViewModel['replace']>): void => {
      return applicationAuthorCommands.replace(context, ...args);
    },
    cycleWordCounter: (): void => {
      return applicationNavigation.cycleWordCounter(context);
    },
    trackVisibleChapter: (): void => {
      return applicationNavigation.trackVisibleChapter(context);
    },
    zoom: (delta: number): void => {
      return applicationPreferences.zoom(context, delta);
    },
    pageZoomWheel: (event: WheelEvent): void => {
      return applicationPreferences.pageZoomWheel(context, event);
    },
    zoomControlWheel: (event: WheelEvent): void => {
      return applicationPreferences.zoomControlWheel(context, event);
    },
    systemContrastChanged: (): void => {
      return applicationPreferences.systemContrastChanged(context);
    },
    chapterNavigationKey: (event: KeyboardEvent): void => {
      return applicationNavigation.chapterNavigationKey(context, event);
    },
    showNav: (open: boolean): void => {
      return applicationNavigation.showNav(context, open);
    },
    showSide: (open: boolean): void => {
      return applicationNavigation.showSide(context, open);
    },
    toggleNav: (): void => {
      return applicationNavigation.toggleNav(context);
    },
    toggleSide: (): void => {
      return applicationNavigation.toggleSide(context);
    },
    fieldTypographyKey: (event: KeyboardEvent): void => {
      return applicationNavigation.fieldTypographyKey(context, event);
    },
    key: (event: KeyboardEvent): void => {
      return applicationNavigation.key(context, event);
    },
  };
}
