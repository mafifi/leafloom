import { DOMSerializer, type Node as PMNode } from 'prosemirror-model';
import { openingPresentation } from './opening-presentation';
import { ManuscriptPresentation } from './presentation';
import { VimController } from './vim';
import { EditorState, TextSelection, Plugin } from 'prosemirror-state';
import { Mapping, StepMap } from 'prosemirror-transform';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { BookCore, bookSchema } from './core';
import type {
  SurfacePort,
  SurfaceActions,
  SurfaceHooks,
  PresentationPreferences,
  Annotation,
} from '@leafloom/editor-contracts';
import { CompositionTelemetry } from './telemetry';

/** Native chapter projections send every step into the book's single history. */
export class ProseMirrorSurfaces implements SurfacePort<HTMLElement> {
  private roomObserver: ResizeObserver | null = null;
  private readonly resizePresentation = () => this.presentation.room(this.core.document);
  private pasteMatchesStyle = false;
  private revealRequested = false;
  private keyboardNavigation = false;
  private readonly literalInputs = new WeakSet<EditorView>();
  private readonly nativeTextInputs = new WeakMap<
    EditorView,
    { character: string; previousTextNodePrefix: string }
  >();
  private dragOrigin: { from: number; to: number; doc: import('prosemirror-model').Node } | null =
    null;
  archiveDraggedSelection() {
    const origin = this.dragOrigin;
    this.dragOrigin = null;
    if (!origin || !origin.doc.content.eq(this.core.state.doc.content)) return false;
    if (
      !origin.doc
        .textBetween(origin.from, origin.to, '', (node) =>
          node.type.name === 'placeholder' ? '⚑' : '',
        )
        .trim()
    ) return false;
    this.core.dispatch(
      this.core.state.tr.setSelection(
        TextSelection.create(this.core.state.doc, origin.from, origin.to),
      ),
      'selection',
    );
    this.core.archive();
    return true;
  }
  private readonly presentation = new ManuscriptPresentation();
  configurePresentation(preferences: PresentationPreferences) {
    this.publicationPage = preferences.publicationPage;
    this.presentation.configure(preferences);
    this.presentation.room(this.core.document);
    this.presentation.paint(this.core.document);
  }
  private publicationPage: PresentationPreferences['publicationPage'];
  private mainView: EditorView | null = null;
  private auxView: EditorView | null = null;
  private hostPointerListeners = new Map<EditorView, () => void>();
  private chapterViews = new Map<string, { host: HTMLElement; view: EditorView }>();
  private hooks: SurfaceHooks = {};
  private decorationRanges = new Map<string, { annotation: Annotation; position: number }[]>();
  private readonly vim: VimController;
  private bookRoot: HTMLElement | null = null;
  private enabled = true;
  private refreshingFromCore = false;
  private pendingFocus: string | null = null;
  private current = '';
  private panel = 'notes';
  private readonly readNativeSelection = () => {
    if (this.panel === 'manuscript') this.presentation.paintDropcap(this.core.document);
    const candidates = [
      ...Array.from(this.chapterViews, ([id, entry]) => ({ id, view: entry.view })),
      ...(this.mainView ? [{ id: this.current, view: this.mainView }] : []),
      ...(this.auxView ? [{ id: this.auxiliaryId(), view: this.auxView }] : []),
    ];
    const focused = candidates.find(({ view }) => view.hasFocus() && !view.composing);
    if (focused) this.syncDOMSelection(focused.view, focused.id);
  };
  private readonly readFocus = (event: FocusEvent) => {
    const target = event.target,
      NodeConstructor = this.core.document.defaultView?.Node;
    if (!NodeConstructor || !(target instanceof NodeConstructor)) return;
    const views = [
      ...Array.from(this.chapterViews.values(), (entry) => entry.view),
      this.mainView,
      this.auxView,
    ];
    if (!views.some((view) => view?.dom.contains(target))) this.vim.leaveEditor();
  };
  private readonly unsubscribe: () => void;
  constructor(
    private readonly core: BookCore,
    private readonly actions: SurfaceActions,
    private readonly telemetry = new CompositionTelemetry(),
    private readonly input: () => void = () => {},
  ) {
    // Read the author range before PM's recent-focus safeguard can interpret a
    // deliberate first-paragraph caret as a browser reset and restore the old end.
    this.core.document.addEventListener('selectionchange', this.readNativeSelection, true);
    this.core.document.addEventListener('focusin', this.readFocus);
    this.core.document.defaultView?.addEventListener('resize', this.resizePresentation);
    this.vim = new VimController(
      core,
      () => this.hooks,
      () => this.focus(),
      (coords) => this.manuscriptPositionAt(coords),
    );
    this.unsubscribe = core.subscribe((event) => {
      if (
        event.command === 'selection.keyboard' ||
        event.command === 'vim.motion' ||
        (event.kind === 'changed' &&
          /^(?:typing$|author\.|paste$|cut$|vim\.(?:paragraph|delete)$|chapter\.(?:create|merge|empty\.delete)$|darling\.restore$)/.test(
            event.command ?? '',
          ))
      )
        this.revealRequested = true;
      this.refreshingFromCore = true;
      try {
        this.update(this.current, this.panel, this.enabled);
      } finally {
        this.refreshingFromCore = false;
      }
    });
  }
  /** A manuscript viewport point can belong to any mounted chapter, not the focused view. */
  private manuscriptPositionAt(coords: { left: number; top: number }): number | null {
    if (this.panel !== 'manuscript') return null;
    const target = this.core.document.elementFromPoint(coords.left, coords.top);
    if (!target) return null;
    const candidates = [
      ...Array.from(this.chapterViews, ([id, entry]) => ({ id, view: entry.view })),
      ...(this.mainView ? [{ id: this.current, view: this.mainView }] : []),
    ];
    for (const { id, view } of candidates) {
      if (!view.dom.contains(target) || !this.core.canEdit(id)) continue;
      const point = view.posAtCoords(coords);
      if (point) return point.pos + this.core.section(id).pos + 1;
    }
    return null;
  }
  setVim(enabled: boolean) {
    this.vim.setEnabled(enabled);
  }
  get vimState() {
    return this.vim.state;
  }
  setHooks(hooks: SurfaceHooks) {
    this.hooks = hooks;
  }
  private auxiliaryId() {
    return this.panel === 'outline' ? 'outline' : 'notes';
  }
  private localState(id: string, composing = false) {
    const section = this.core.section(id),
      doc = bookSchema.nodes.surface.create(null, section.node.content);
    const selection = this.core.state.selection,
      base = section.pos + 1;
    const from = Math.max(1, Math.min(doc.content.size - 1, selection.from - base));
    const to = Math.max(1, Math.min(doc.content.size - 1, selection.to - base));
    // The fallback map only implements ordinary deletion/navigation after the authoring commands.
    return EditorState.create({
      doc,
      selection: TextSelection.between(doc.resolve(from), doc.resolve(to)),
      storedMarks: composing ? null : this.core.inputMarks,
      plugins: [this.annotationPlugin(id, doc), keymap(baseKeymap)],
    });
  }
  private pageFor(id: string) {
    return this.publicationPage && this.core.section(id).node.attrs.role === 'chapter'
      ? this.publicationPage
      : undefined;
  }
  private annotationPlugin(id: string, doc: import('prosemirror-model').Node) {
    const base = this.core.section(id).pos + 1,
      decorations: Decoration[] = [];
    for (const { annotation, position } of this.decorationRanges.get(id) ?? []) {
      decorations.push(
        Decoration.inline(
          position + 1 + annotation.from - base,
          position + 1 + annotation.to - base,
          {
            class: 'leafloom-annotation annotation-' + annotation.kind,
            'data-leafloom-annotation': annotation.id,
            'data-annotation-kind': annotation.kind,
            ...(annotation.message ? { title: annotation.message } : {}),
          },
        ),
      );
    }
    const presentation = openingPresentation(doc);
    const pageKind = this.pageFor(id)?.kind ?? this.core.section(id).node.attrs.kind;
    if (['dedication', 'epigraph', 'part'].includes(pageKind))
      for (const attribution of presentation.attributions)
        decorations.push(Decoration.node(attribution.from, attribution.to, { 'data-attr': '' }));
    if (this.core.section(id).node.attrs.role === 'chapter')
      for (const speech of presentation.speech)
        decorations.push(Decoration.node(speech.from, speech.to, { 'data-speech': '' }));
    // This plugin belongs to one immutable projected state. PM queries its
    // decorations repeatedly while updating a view; construct the tree once.
    const decorationSet = DecorationSet.create(doc, decorations);
    return new Plugin({ props: { decorations: () => decorationSet } });
  }
  private projectAnnotations() {
    const annotations = this.core.annotations;
    this.decorationRanges = new Map();
    if (!annotations.length) return;
    const passages = new Map(this.core.passages().map((passage) => [passage.id, passage]));
    for (const annotation of annotations) {
      const passage = passages.get(annotation.passageId);
      if (!passage) continue;
      const ranges = this.decorationRanges.get(passage.chapterId) ?? [];
      ranges.push({ annotation, position: passage.pos });
      this.decorationRanges.set(passage.chapterId, ranges);
    }
  }
  private syncDOMSelection(view: EditorView, id: string) {
    if (
      this.pendingFocus &&
      this.core.activeSection?.id === this.pendingFocus &&
      id !== this.pendingFocus
    )
      return;
    const selection = view.dom.ownerDocument.getSelection();
    if (
      !selection?.anchorNode ||
      !selection.focusNode ||
      !view.dom.contains(selection.anchorNode) ||
      !view.dom.contains(selection.focusNode)
    )
      return;
    const base = this.core.section(id).pos + 1,
      anchor = view.posAtDOM(selection.anchorNode, selection.anchorOffset) + base,
      head = view.posAtDOM(selection.focusNode, selection.focusOffset) + base;
    const end = base + this.core.section(id).node.content.size;
    // Native composition/deletion may still await PM's DOM parser. Its transaction
    // owns those ranges; a selection-only event must not resolve beyond the model.
    if (anchor < base || head < base || anchor > end || head > end) return;
    // Native Select All and rich paste can put range endpoints on the editor
    // root. Resolve those block boundaries into inline text positions first.
    const next = TextSelection.between(
      this.core.state.doc.resolve(anchor),
      this.core.state.doc.resolve(head),
    );
    if (!this.core.state.selection.eq(next))
      this.core.dispatch(this.core.state.tr.setSelection(next), 'selection');
  }
  /** Passage identifiers belong to native paragraph DOM, not a book-sized decoration tree. */
  private passageView(node: PMNode) {
    const render = node.type.spec.toDOM;
    if (!render) throw Error('MISSING_NODE_RENDERER');
    const rendered = DOMSerializer.renderSpec(this.core.document, render(node));
    const ElementType = this.core.document.defaultView?.HTMLElement;
    if (!ElementType || !(rendered.dom instanceof ElementType))
      throw Error('INVALID_NODE_RENDERER');
    rendered.dom.setAttribute('data-pid', String(node.attrs.pid));
    let current = node;
    return {
      dom: rendered.dom,
      contentDOM: rendered.contentDOM,
      update(next: PMNode) {
        if (!next.sameMarkup(current)) return false;
        current = next;
        return true;
      },
    };
  }
  private createView(host: HTMLElement, id: () => string) {
    host.classList.toggle(
      'opens-dialogue',
      this.core.section(id()).node.attrs.role === 'chapter' &&
        openingPresentation(this.core.section(id()).node).opensDialogue,
    );
    const view = new EditorView(host, {
      state: this.localState(id()),
      editable: () => this.enabled && this.core.canEdit(id()),
      nodeViews: {
        paragraph: (node) => this.passageView(node),
        heading: (node) => this.passageView(node),
        code_block: (node) => this.passageView(node),
      },
      attributes: (state) => {
        const page = this.pageFor(id());
        return {
          role: 'textbox',
          'aria-label':
            page?.label ??
            (id() === 'notes' ? 'Book notes' : id() === 'outline' ? 'Book outline' : 'Manuscript'),
          spellcheck: 'false',
          ...(page
            ? {
                class:
                  'ps-body' +
                  (state.doc
                    .textBetween(0, state.doc.content.size, '', (node) =>
                      node.type.name === 'placeholder' ? '⚑' : '',
                    )
                    .trim()
                    ? ''
                    : ' empty'),
                ...(page.placeholder !== undefined ? { 'data-ph': page.placeholder } : {}),
              }
            : {}),
        };
      },
      handleDOMEvents: {
        // The author selection belongs to the master state and native selection
        // observer. PM's default focus handler schedules a 20ms selection reset,
        // which can overwrite a subsequent Select All before its Delete event.
        // Own focus presentation synchronously through the public DOM hooks.
        focus: (view) => {
          view.dom.classList.add('ProseMirror-focused');
          return true;
        },
        blur: (view) => {
          view.dom.classList.remove('ProseMirror-focused');
          return true;
        },
        copy: (view) => {
          this.syncDOMSelection(view, id());
          this.core.rememberClipboardStickies();
          return false;
        },
        cut: (view) => {
          this.syncDOMSelection(view, id());
          this.core.rememberClipboardStickies();
          return false;
        },
        keydown: (view, event) => {
          this.nativeTextInputs.delete(view);
          if (
            event.key.length === 1 &&
            !event.isComposing &&
            event.keyCode !== 229 &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey
          ) {
            const native = view.dom.ownerDocument.getSelection(),
              anchor = native?.anchorNode;
            if (native?.isCollapsed && anchor && view.dom.contains(anchor))
              this.nativeTextInputs.set(view, {
                character: event.key,
                previousTextNodePrefix:
                  anchor.nodeType === Node.TEXT_NODE
                    ? (anchor.textContent ?? '').slice(0, native.anchorOffset)
                    : '',
              });
          }
          this.pasteMatchesStyle =
            (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'v';
          if (!event.metaKey && !event.ctrlKey && !event.altKey) this.presentation.keyboard = true;
          this.keyboardNavigation =
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey &&
            /^(?:Arrow|Home$|End$|PageUp$|PageDown$)/.test(event.key);
          if (
            event.isComposing ||
            event.keyCode === 229 ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey
          )
            this.literalInputs.add(view);
          else this.literalInputs.delete(view);
          return false;
        },
        compositionstart: (view) => {
          this.literalInputs.add(view);
          return false;
        },
        dragstart: (view) => {
          this.syncDOMSelection(view, id());
          const { from, to, empty } = this.core.state.selection;
          this.dragOrigin = empty ? null : { from, to, doc: this.core.state.doc };
          return false;
        },
        dragend: () => {
          this.dragOrigin = null;
          return false;
        },
        beforeinput: () => {
          this.core.resetEnter();
          this.input();
          return false;
        },
        pointerdown: () => {
          this.keyboardNavigation = false;
          this.presentation.keyboard = false;
          this.pendingFocus = null;
          this.core.resetEnter();
          return false;
        },
        click: (view, event) => {
          const ghost = event.target instanceof Element ? event.target.closest('p.ghost') : null;
          if (ghost && view.dom.contains(ghost)) {
            const at = view.posAtDOM(ghost, 0),
              node = view.state.doc.resolve(at).parent;
            this.core.select(id(), at, at + node.content.size);
            return true;
          }
          const target =
            event.target instanceof Element
              ? event.target.closest('.ph-mark,[data-annotation-kind="review"]')
              : null;
          if (target?.classList.contains('ph-mark'))
            this.hooks.activate?.({ kind: 'sticky', id: target.getAttribute('data-sid') ?? '' });
          else if (target)
            this.hooks.activate?.({
              kind: 'review',
              id: target.getAttribute('data-leafloom-annotation') ?? '',
            });
          return false;
        },
        contextmenu: (view, event) => {
          if (!this.hooks.contextMenu) return false;
          const target =
            event.target instanceof Element
              ? event.target.closest('[data-leafloom-annotation]')
              : null;
          const annotation = this.core.annotations.find(
            (annotation) => annotation.id === target?.getAttribute('data-leafloom-annotation'),
          );
          if (!annotation) return false;
          const passage = this.core
            .passageRows(id())
            .find((passage) => passage.id === annotation.passageId);
          if (!passage) return false;
          event.preventDefault();
          this.hooks.contextMenu({
            ...annotation,
            text: passage.text.slice(annotation.from, annotation.to),
            x: event.clientX,
            y: event.clientY,
          });
          return true;
        },
      },
      handleTextInput: (_view, from, to, text) => {
        if (_view.composing || this.literalInputs.has(_view)) return false;
        // The SDK can call this after the browser has inserted raw text. Use
        // the endpoint captured at keydown, before its observer normalizes the
        // DOM: two text nodes can share one model position at a mark boundary.
        const nativeInput = this.nativeTextInputs.get(_view),
          previousTextNodePrefix =
            nativeInput?.character === text ? nativeInput.previousTextNodePrefix : undefined;
        this.nativeTextInputs.delete(_view);
        const base = this.core.section(id()).pos + 1;
        if (
          !(this.pendingFocus && this.core.activeSection?.id === this.pendingFocus) &&
          (this.core.state.selection.from !== from + base ||
            this.core.state.selection.to !== to + base)
        ) {
          const marks = this.core.state.storedMarks;
          this.core.dispatch(
            this.core.state.tr
              .setSelection(TextSelection.create(this.core.state.doc, from + base, to + base))
              .setStoredMarks(marks),
            'selection',
          );
        }
        if (this.enabled && this.core.canEdit(id()))
          this.core.insert(text, {
            typography: !this.literalInputs.has(_view),
            previousTextNodePrefix,
          });
        this.literalInputs.delete(_view);
        return true;
      },
      handleKeyDown: (view, event) => {
        if (event.isComposing || event.keyCode === 229) {
          this.literalInputs.add(view);
          return false;
        }
        if (event.altKey || event.ctrlKey || event.metaKey) this.literalInputs.add(view);
        else this.literalInputs.delete(view);
        if (!event.metaKey && !event.ctrlKey && !event.altKey) this.presentation.keyboard = true;
        this.syncDOMSelection(view, id());
        if (this.vim.handle(event, view)) return true;
        const mod = event.metaKey || event.ctrlKey,
          key = event.key.toLowerCase();
        if (!this.enabled || !this.core.canEdit(id())) return true;
        if (event.key === 'Enter' && event.shiftKey && (mod || event.altKey)) {
          this.core.resetEnter();
          return false;
        }
        if (event.key === 'Enter')
          return this.core.enter(event.shiftKey, Boolean(this.pageFor(id())));
        if (!mod && !event.altKey && event.key === 'Backspace' && this.core.backspace())
          return true;
        if (!mod && !event.altKey && event.key === 'Delete' && this.core.deleteForward())
          return true;
        if (event.key === 'Tab') {
          this.core.indent(event.shiftKey);
          return true;
        }
        this.core.resetEnter();
        if (mod && key === 'z') {
          event.stopPropagation();
          event.shiftKey ? this.actions.redo() : this.actions.undo();
          return true;
        }
        if (mod && key === 'y') {
          event.stopPropagation();
          this.actions.redo();
          return true;
        }
        if (mod && key === 's') {
          event.stopPropagation();
          this.actions.save();
          return true;
        }
        if (mod && (key === 'b' || key === 'i')) {
          event.stopPropagation();
          this.actions.format(key === 'b' ? 'bold' : 'italic');
          return true;
        }
        if (mod && event.shiftKey && key === 'd') {
          event.stopPropagation();
          this.actions.archive();
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        this.syncDOMSelection(view, id());
        if (!this.enabled || !this.core.canEdit(id())) return true;
        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        const matchStyle = this.pasteMatchesStyle;
        this.pasteMatchesStyle = false;
        this.core.paste({
          text: clipboard.getData('text/plain'),
          html: clipboard.getData('text/html') || undefined,
          matchStyle,
        });
        return true;
      },
      handleDrop: (view, event) => {
        const origin = this.dragOrigin;
        if (!origin) return false;
        this.dragOrigin = null;
        if (!origin.doc.content.eq(this.core.state.doc.content)) return true;
        if (!this.enabled || !this.core.canEdit(id())) return true;
        const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (!coordinates) return true;
        const offset = coordinates.pos;
        this.core.dispatch(
          this.core.state.tr.setSelection(
            TextSelection.create(this.core.state.doc, origin.from, origin.to),
          ),
          'selection',
        );
        if (event.altKey || event.ctrlKey) {
          const clipboard = this.core.copySelection();
          this.core.select(id(), offset);
          this.core.paste(clipboard);
        } else this.core.moveSelection(id(), offset);
        return true;
      },
      dispatchTransaction: (local) => {
        if (
          !local.docChanged &&
          !local.storedMarksSet &&
          local.selection.from + this.core.section(id()).pos + 1 ===
            this.core.state.selection.from &&
          local.selection.to + this.core.section(id()).pos + 1 === this.core.state.selection.to
        )
          return;
        if (local.docChanged && (!this.enabled || !this.core.canEdit(id()))) return;
        const base = this.core.section(id()).pos + 1,
          mapping = new Mapping([StepMap.offset(base)]),
          transaction = this.core.state.tr;
        for (const step of local.steps) {
          const mapped = step.map(mapping);
          if (!mapped) throw Error('INVALID_SURFACE_STEP');
          transaction.step(mapped);
        }
        transaction.setSelection(local.selection.map(transaction.doc, mapping));
        if (local.storedMarksSet) transaction.setStoredMarks(local.storedMarks);
        const composition = local.getMeta('composition');
        if (composition !== undefined) transaction.setMeta('composition', `${id()}:${composition}`);
        if (transaction.docChanged)
          this.telemetry.sync('ui.input', (parent) =>
            this.core.dispatch(transaction, 'typing', false, parent),
          );
        else {
          const command = this.keyboardNavigation ? 'selection.keyboard' : 'selection';
          this.keyboardNavigation = false;
          this.core.dispatch(transaction, command);
        }
      },
    });
    const focusBlankWorkspace = (event: PointerEvent) => {
      if (event.target !== host || event.button !== 0 || !this.enabled || !this.core.canEdit(id()))
        return;
      this.keyboardNavigation = false;
      this.presentation.keyboard = false;
      this.pendingFocus = null;
      this.core.resetEnter();
      this.core.select(id(), view.state.doc.content.size - 1);
      this.focusView(view, id(), { preventScroll: true });
      event.preventDefault();
    };
    host.addEventListener('pointerdown', focusBlankWorkspace);
    this.hostPointerListeners.set(view, () =>
      host.removeEventListener('pointerdown', focusBlankWorkspace),
    );
    return view;
  }
  private destroyView(view: EditorView | null) {
    if (!view) return;
    this.hostPointerListeners.get(view)?.();
    this.hostPointerListeners.delete(view);
    view.destroy();
  }
  private observeRoom(host: HTMLElement) {
    const window = host.ownerDocument.defaultView;
    if (window?.ResizeObserver) {
      this.roomObserver = new window.ResizeObserver(this.resizePresentation);
      this.roomObserver.observe(host);
    }
    this.resizePresentation();
  }
  private clearViews() {
    this.roomObserver?.disconnect();
    this.roomObserver = null;
    this.destroyView(this.mainView);
    this.destroyView(this.auxView);
    for (const entry of this.chapterViews.values()) this.destroyView(entry.view);
    this.mainView = null;
    this.auxView = null;
    this.chapterViews.clear();
    this.bookRoot = null;
  }
  render(
    main: HTMLElement,
    auxiliary: HTMLElement,
    current: string,
    panel: string,
    enabled: boolean,
  ) {
    this.clearViews();
    this.current = current;
    this.panel = panel;
    this.enabled = enabled;
    this.projectAnnotations();
    this.observeRoom(main);
    this.mainView = this.createView(main, () => this.current);
    this.auxView = this.createView(auxiliary, () => this.auxiliaryId());
  }
  renderBook(root: HTMLElement, auxiliary: HTMLElement, panel: string, enabled: boolean) {
    this.clearViews();
    this.bookRoot = root;
    this.panel = panel;
    this.enabled = enabled;
    this.current = this.core.chapters[0]?.id ?? '';
    this.projectAnnotations();
    this.auxView = this.createView(auxiliary, () => this.auxiliaryId());
    this.refreshChapters();
    this.observeRoom(root);
  }
  private refreshChapters() {
    if (!this.bookRoot) return;
    const valid = new Set(this.core.chapters.map((chapter) => chapter.id));
    const hosts = new Map(
      Array.from(this.bookRoot.querySelectorAll<HTMLElement>('.chapter-body[data-chid]')).flatMap(
        (host) => {
          const id = host.dataset.chid;
          return id && valid.has(id) ? [[id, host] as const] : [];
        },
      ),
    );
    for (const [id, entry] of this.chapterViews)
      if (hosts.get(id) !== entry.host) {
        this.destroyView(entry.view);
        this.chapterViews.delete(id);
      }
    for (const [id, host] of hosts)
      if (!this.chapterViews.has(id))
        this.chapterViews.set(id, { host, view: this.createView(host, () => id) });
  }
  update(current: string, panel: string, enabled: boolean) {
    if (!this.refreshingFromCore) {
      for (const [id, entry] of this.chapterViews)
        if (
          this.core.activeSection?.id === id &&
          this.core.chapters.some((chapter) => chapter.id === id) &&
          !entry.view.composing &&
          entry.view.hasFocus() &&
          entry.view.state.doc.content.eq(this.core.section(id).node.content)
        )
          this.syncDOMSelection(entry.view, id);
      if (
        this.core.activeSection?.id === this.current &&
        this.core.chapters.some((chapter) => chapter.id === this.current) &&
        !this.mainView?.composing &&
        this.mainView?.hasFocus() &&
        this.mainView.state.doc.content.eq(this.core.section(this.current).node.content)
      )
        this.syncDOMSelection(this.mainView, this.current);
      if (
        this.core.activeSection?.id === this.auxiliaryId() &&
        !this.auxView?.composing &&
        this.auxView?.hasFocus() &&
        this.auxView.state.doc.content.eq(this.core.section(this.auxiliaryId()).node.content)
      )
        this.syncDOMSelection(this.auxView, this.auxiliaryId());
    }
    const hadFocus = Array.from(this.chapterViews.values()).some((entry) => entry.view.hasFocus());
    this.current = current;
    this.panel = panel;
    this.enabled = enabled;
    this.projectAnnotations();
    this.refreshChapters();
    if (this.mainView && current && this.core.chapters.some((chapter) => chapter.id === current)) {
      this.mainView.dom.parentElement?.classList.toggle(
        'opens-dialogue',
        openingPresentation(this.core.section(current).node).opensDialogue,
      );
      this.mainView.updateState(this.localState(current, this.mainView.composing));
    }
    if (this.auxView)
      this.auxView.updateState(this.localState(this.auxiliaryId(), this.auxView.composing));
    for (const [id, entry] of this.chapterViews) {
      entry.host.classList.toggle(
        'opens-dialogue',
        openingPresentation(this.core.section(id).node).opensDialogue,
      );
      const next = this.telemetry.sync('editor.surface.project', () =>
        this.localState(id, entry.view.composing),
      );
      this.telemetry.sync('editor.surface.update', () => entry.view.updateState(next));
    }
    this.telemetry.sync('editor.presentation.room', () =>
      this.presentation.room(this.core.document),
    );
    this.telemetry.sync('editor.presentation.paint', () =>
      this.presentation.paint(this.core.document),
    );
    if (hadFocus) {
      const target = this.core.activeSection?.id ?? current,
        view = this.chapterViews.get(target)?.view;
      if (view) {
        this.pendingFocus = null;
        if (!view.hasFocus()) view.focus();
      } else if (this.core.chapters.some((chapter) => chapter.id === target))
        this.pendingFocus = target;
      if (view && this.revealRequested) {
        this.revealRequested = false;
        this.revealCaret();
      }
    }
  }
  private revealCaret() {
    if (
      this.presentation.enabled &&
      (!this.presentation.keyboard || !this.core.state.selection.empty)
    )
      return;
    const id = this.core.activeSection?.id,
      view = id ? this.chapterViews.get(id)?.view : this.mainView;
    if (!view) return;
    const scroll = view.dom.closest<HTMLElement>('#paper-scroll');
    if (!scroll) return;
    requestAnimationFrame(() => {
      if (!view.dom.isConnected) return;
      const caret = view.coordsAtPos(view.state.selection.head),
        box = scroll.getBoundingClientRect(),
        room = Math.min(48, box.height / 6);
      if (this.presentation.typewriter && view.state.selection.empty) {
        const window = view.dom.ownerDocument.defaultView;
        if (window) {
          const lineHeight = parseFloat(window.getComputedStyle(view.dom).lineHeight) || 30,
            difference = caret.top - window.innerHeight * 0.45;
          if (Math.abs(difference) > lineHeight * 1.5)
            scroll.scrollTo({
              top: scroll.scrollTop + difference,
              behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
                ? 'instant'
                : 'smooth',
            });
        }
        return;
      }
      if (caret.bottom > box.bottom - room) scroll.scrollTop += caret.bottom - (box.bottom - room);
      else if (caret.top < box.top + 8) scroll.scrollTop -= box.top + 8 - caret.top;
    });
  }
  private focusView(view: EditorView, id: string, options?: { preventScroll?: boolean }) {
    this.keyboardNavigation = false;
    this.revealRequested = false;
    const scroll = view.dom.closest<HTMLElement>('#paper-scroll'),
      previous = scroll?.scrollTop;
    view.updateState(this.localState(id));
    view.focus();
    if (options?.preventScroll) {
      if (scroll && previous !== undefined) scroll.scrollTop = previous;
      return;
    }
    const selection = view.dom.ownerDocument.getSelection(),
      anchor = view.domAtPos(view.state.selection.anchor),
      head = view.domAtPos(view.state.selection.head);
    selection?.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
  }
  focus(options?: { preventScroll?: boolean }) {
    if (this.panel === 'notes' || this.panel === 'outline') {
      const view = this.auxView;
      if (view) {
        const id = this.auxiliaryId();
        if (this.core.activeSection?.id !== id)
          this.core.select(id, view.state.selection.from, view.state.selection.to);
        this.focusView(view, id, options);
      }
      return;
    }
    if (this.mainView) {
      this.focusView(this.mainView, this.current, options);
      return;
    }
    const active = this.core.activeSection?.id ?? this.current;
    const view = this.chapterViews.get(active)?.view;
    if (view) this.focusView(view, active, options);
  }
  revealSelection(
    options: {
      block?: 'start' | 'center' | 'end' | 'nearest';
      passageId?: string;
      viewportFraction?: number;
    } = {},
  ) {
    const passage = options.passageId
      ? this.core.passages().find((passage) => passage.id === options.passageId)
      : undefined;
    if (options.passageId && !passage) return;
    const id = passage?.chapterId ?? this.core.activeSection?.id;
    if (!id) return;
    const view =
      this.chapterViews.get(id)?.view ??
      (this.mainView && id === this.current ? this.mainView : undefined) ??
      (id === this.auxiliaryId() ? this.auxView : undefined);
    if (!view) return;
    const at =
      (passage ? passage.pos + 1 : this.core.state.selection.head) - this.core.section(id).pos - 1;
    const localPosition = Math.max(0, Math.min(at, view.state.doc.content.size));
    if (options.viewportFraction !== undefined) {
      if (
        !Number.isFinite(options.viewportFraction) ||
        options.viewportFraction < 0 ||
        options.viewportFraction > 1
      )
        throw RangeError('Viewport fraction must be between zero and one');
      const scroller = view.dom.closest<HTMLElement>('#paper-scroll');
      if (scroller) {
        const caret = view.coordsAtPos(localPosition),
          box = scroller.getBoundingClientRect();
        scroller.scrollTop +=
          caret.top - box.top - scroller.clientHeight * options.viewportFraction;
      }
      return;
    }
    const point = view.domAtPos(localPosition);
    const element = point.node.nodeType === 1 ? (point.node as Element) : point.node.parentElement;
    const paragraph = element?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6,li,pre');
    if (!paragraph || !view.dom.contains(paragraph)) return;
    paragraph.scrollIntoView({
      block: options.block ?? 'center',
      behavior: view.dom.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')
        .matches
        ? 'instant'
        : 'smooth',
    });
  }
  destroy() {
    this.core.document.removeEventListener('selectionchange', this.readNativeSelection, true);
    this.core.document.removeEventListener('focusin', this.readFocus);
    this.core.document.defaultView?.removeEventListener('resize', this.resizePresentation);
    this.presentation.clear(this.core.document);
    this.core.document.body?.classList.remove('vim-nav');
    this.clearViews();
    this.unsubscribe();
  }
}
