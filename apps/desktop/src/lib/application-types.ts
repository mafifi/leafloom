import type { Application } from './application';
import type { CoverPresentationValue } from '@leafloom/cover-contracts';
import {
  type DesktopOS,
  type DocumentChange,
  type UpdateStatusValue,
} from '@leafloom/desktop-host';
import { Metadata } from '@leafloom/document-contracts';
import {
  OpenReply,
  type EditorPort,
  type SurfaceActions,
  type SurfacePort,
} from '@leafloom/editor-contracts';
import { type LanguageCatalogValue } from '@leafloom/language-contracts';
import { type LibraryValue } from '@leafloom/library';
import { z } from 'zod';
import { type CoverArtPresentation } from './cover-art';
import { type EmailPresentation } from './email-draft';
import { type FontChoicesValue, type FontPlatform } from './font-choices';
import { type FontPickerPresentation } from './font-picker';
import { type GoalsPresentation } from './goals';
import { type HostRecoveryPresentation } from './host-recovery';
import type { InformationPresentation } from './information';
import { type LibrarySettingsPresentation } from './library-settings';
import type { PanePreferencePort } from './pane-preferences';
import type { PopupMenuItem } from './popup-menu';
import { type PublicationPagePresentation } from './publication-page';
import { type FindMatch } from './search-view-model';
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
  manuscriptMode: EditorPort['manuscriptMode'];
  screenplayScenes: EditorPort['screenplayScenes'];
  chapters: EditorPort['chapters'];
  protectedChapterIds: string[];
  outlineRows: EditorPort['outlineRows'];
  outlineCards: EditorPort['outlineCards'];
  looseOutlineCards: EditorPort['looseOutlineCards'];
  walkingOutlineNote: EditorPort['walkingOutlineNote'];
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
  stickyAutoOpened: boolean;
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
export type AppActions = Pick<
  Application,
  | 'openPublicationPage'
  | 'bindScriptLayout'
  | 'editScriptTitle'
  | 'finishScriptContact'
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
  | 'focusScreenplayScene'
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
  | 'newScript'
  | 'newShelf'
  | 'nextMatch'
  | 'editOutline'
  | 'dismissWalkingOutlineNote'
  | 'outlineBoard'
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
  | 'cyclePositionCounter'
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
