import type { BrowserReadAloud } from './browser-read-aloud';
import { interfaceBrightness, auxiliaryBrightness } from './interface-brightness';
import { type HostMethod, type HostPayload } from '@leafloom/desktop-host';
import { type EditorPort } from '@leafloom/editor-contracts';
import { LanguageCatalog } from '@leafloom/language-contracts';
import type { AppState, ApplicationPlatform } from './application';
import { DocumentOutputViewModel, type OutputFormat } from './document-output';
import { executeNativeFieldHistory } from './field-history';
import type { InformationPresentation } from './information';
import { brighterInterface } from './presentation';
import { PublicationPageViewModel } from './publication-page';


export interface ApplicationNativeCommandsContext {
  readAloud: BrowserReadAloud | null;
  overlayOpen: () => boolean;
  reshelveBook: () => Promise<void>;
  publicationPageViewModel: PublicationPageViewModel;
  save: () => Promise<void>;
  preference: (key: string, value: unknown) => Promise<void>;
  value: AppState;
  alignParagraph: (value: 'left' | 'center' | 'right' | 'justify') => void;
  request: <M extends HostMethod>(method: M, payload: HostPayload<M>) => Promise<unknown>;
  patch: (patch: Partial<AppState>) => void;
  cycleFocus: () => Promise<void>;
  textSize: (delta: number) => Promise<void>;
  newBook: (
    shelfId: string,
    kind?: string | undefined,
    title?: string | undefined,
  ) => Promise<void>;
  editor: EditorPort | null;
  createChapter: (index?: number, kind?: string) => void;
  importBooks: () => Promise<void>;
  prompt: (
    title: string,
    value?: string,
    label?: string,
    confirm?: string,
  ) => Promise<string | null>;
  exportBook: (format: OutputFormat) => Promise<void>;
  documentOutputViewModel: DocumentOutputViewModel;
  undo: () => void;
  redo: () => void;
  openSearch: () => void;
  toggleSpelling: () => void;
  format: (mark: 'bold' | 'italic' | 'underline' | 'strike') => void;
  togglePoetry: () => void;
  toggleFlush: () => void;
  writable: () => boolean;
  zoom: (delta: number) => void;
  platform: ApplicationPlatform | undefined;
  pasteMatchStyle: () => Promise<void>;
  libraryFolder: () => Promise<void> | undefined;
  showInformation: (kind: InformationPresentation['kind']) => Promise<void>;
  emailDraft: () => Promise<void>;
  openEmailSettings: () => Promise<void>;
  openCoverSettings: () => Promise<void>;
  openFontPicker: () => Promise<void>;
  openGoals: () => void;
}

export async function nativeCommand(
  context: ApplicationNativeCommandsContext,
  command: string,
): Promise<void> {
  if ((command === 'undo' || command === 'redo') && executeNativeFieldHistory(command)) return;
  if (command === 'reshelve-book') {
    if (!context.overlayOpen()) await context.reshelveBook();
    return;
  }
  if (context.publicationPageViewModel.active) {
    if (command === 'undo') {
      context.publicationPageViewModel.undo();
      return;
    }
    if (command === 'redo') {
      context.publicationPageViewModel.redo();
      return;
    }
    if (command === 'save') {
      await context.save();
      return;
    }
    if (command === 'bold' || command === 'italic') {
      context.publicationPageViewModel.format(command);
      return;
    }
  }
  if (
    context.overlayOpen() &&
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
      await context.preference('writingStyle', value);
      return;
    }
    if (kind === 'body-font' || kind === 'dropcap') {
      await context.preference('fonts', {
        ...context.value.library.fonts,
        [kind === 'body-font' ? 'body' : 'dropcap']: value,
      });
      return;
    }
    if (kind === 'align' && ['left', 'center', 'right', 'justify'].includes(value)) {
      context.alignParagraph(value as 'left' | 'center' | 'right' | 'justify');
      return;
    }
    if (kind === 'language') {
      const language = LanguageCatalog.parse(
        await context.request('setLanguage', { language: value }),
      );
      context.patch({ language });
      await context.preference('language', value);
      return;
    }
    if (kind === 'spell-language') {
      await context.preference('spellLanguage', value);
      return;
    }
    if (kind === 'page-theme') {
      await context.preference('pageTheme', value);
      return;
    }
    if (kind === 'interface-zoom' && [1, 1.25, 1.5, 2, 2.5, 3].includes(Number(value))) {
      await context.preference('uiZoom', Number(value));
      return;
    }
    if (kind === 'focus') {
      await context.preference('focusMode', value === 'off' ? false : value);
      return;
    }
  }
  const shelf = context.value.library.shelves.find(
    (s) => s.authorId === context.value.library.currentAuthorId,
  );
  switch (command) {
    case 'typewriter':
      await context.preference('typewriter', !context.value.library.typewriter);
      break;
    case 'vim':
      await context.preference('vimKeys', !context.value.library.vimKeys);
      break;
    case 'markdown-emphasis':
      await context.preference('markdownOff', !context.value.library.markdownOff);
      break;
    case 'ui-bright':
      await context.preference(auxiliaryBrightness(context.value.view, context.value.panel) ? 'uiBrightAside' : 'uiBright', !interfaceBrightness(context.value.library, context.value.view, context.value.panel, brighterInterface(undefined)));
      break;
    case 'focus-cycle':
      await context.cycleFocus();
      break;
    case 'text-larger':
      await context.textSize(1);
      break;
    case 'text-smaller':
      await context.textSize(-1);
      break;
    case 'text-reset':
      await context.textSize(0);
      break;
    case 'new-book':
      if (shelf) await context.newBook(shelf.id);
      break;
    case 'new-chapter':
      {
        const index =
          context.editor?.chapters.findIndex((ch) => ch.id === context.editor?.activeSection?.id) ??
          -1;
        context.createChapter(index < 0 ? undefined : index + 1);
      }
      break;
    case 'import':
      await context.importBooks();
      break;
    case 'save':
      await context.save();
      break;
    case 'export': {
      const format = await context.prompt(
        'Export book',
        'docx',
        'Format (txt, md, html, docx, epub, pdf)',
        'Export',
      );
      if (format && ['txt', 'md', 'html', 'docx', 'epub', 'pdf'].includes(format))
        await context.exportBook(format as 'txt' | 'md' | 'html' | 'docx' | 'epub' | 'pdf');
      break;
    }
    case 'print':
      if (context.value.book) await context.documentOutputViewModel.print();
      break;
    case 'undo':
      context.undo();
      break;
    case 'redo':
      context.redo();
      break;
    case 'find':
      context.openSearch();
      break;
    case 'spellcheck':
      context.toggleSpelling();
      break;
    case 'bold':
      context.format('bold');
      break;
    case 'italic':
      context.format('italic');
      break;
    case 'underline':
      context.format('underline');
      break;
    case 'strike':
      context.format('strike');
      break;
    case 'read-aloud':
      await context.readAloud?.toggle();
      break;
    case 'flush':
      context.toggleFlush();
      break;
    case 'poetry':
      context.togglePoetry();
      break;
    case 'scene-break':
      if (context.writable()) {
        context.editor?.enter();
        context.editor?.enter();
      }
      break;
    case 'zoom-in':
      context.zoom(0.1);
      break;
    case 'zoom-out':
      context.zoom(-0.1);
      break;
    case 'fullscreen':
      await context.platform?.fullscreen();
      break;
    case 'paste-match-style':
      await context.pasteMatchStyle();
      break;
    case 'show-book-folder':
      if (context.value.book) await context.platform?.showBookFolder?.(context.value.book.id);
      break;
    case 'library-folder':
      await context.libraryFolder();
      break;
    case 'help':
      await context.showInformation('shortcuts');
      break;
    case 'help-shortcuts':
      await context.showInformation('shortcuts');
      break;
    case 'about':
      await context.showInformation('about');
      break;
    case 'check-update':
      await context.showInformation('update');
      break;
    case 'email-draft':
      await context.emailDraft();
      break;
    case 'email-settings':
      await context.openEmailSettings();
      break;
    case 'cover-art':
      await context.openCoverSettings();
      break;
    case 'body-font-pick':
      await context.openFontPicker();
      break;
    case 'settings':
    case 'goals':
      context.openGoals();
      break;
  }
}
