// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { BookCore, ProseMirrorSurfaces } from '../../packages/editing/prosemirror-editor/src/index';
import { BrowserReadAloud } from '../../apps/desktop/src/lib/browser-read-aloud';
import type { LocalSpeechPort } from '../../apps/desktop/src/lib/read-aloud';
for (const separator of ['<br>', '<span class="darling-anchor" data-did="retained"></span>'])
  it(
    'intentional speech return reconciles Notes native/model caret after ' + separator,
    async () => {
      document.body.innerHTML =
        '<main><div class="chapter-body" data-chid="a"></div></main><aside id="aux-editor"></aside>';
      const core = new BookCore(
        document,
        {
          formatVersion: 'neo-lifecycle/v1',
          revision: 0,
          metadata: { id: 'book', title: 'Book', author: 'Writer' },
          chapters: [{ id: 'a', html: '<p>Manuscript.</p>' }],
          darlings: [],
        },
        null,
        '<p>First sentence.' + separator + ' Second sentence.</p>',
        '',
      );
      const surfaces = new ProseMirrorSurfaces(core, {
        undo: () => core.undo(),
        redo: () => core.redo(),
        save: () => {},
        format: (mark) => core.format(mark),
        archive: () => core.archive(),
      });
      surfaces.renderBook(
        document.querySelector('main')!,
        document.querySelector('aside')!,
        'notes',
        true,
      );
      const passage = core.passageRows('notes')[0]!;
      core.selectPassage(passage.id, 0);
      surfaces.focus();
      const events: { start(): void; end(): void; error(): void }[] = [],
        said: string[] = [];
      const speech: LocalSpeechPort = {
        ready: async () => true,
        voices: () => [{ id: 'local', language: 'en', local: true, default: true }],
        cancel: vi.fn(),
        speak: (text, _voice, event) => {
          said.push(text);
          events.push(event);
          event.start();
        },
      };
      const reader = new BrowserReadAloud(
        { active: () => true, language: () => 'en', hint: vi.fn(), t: (key) => key },
        speech,
      );
      const before = core.html('notes'),
        manuscript = core.html('a');
      try {
        await reader.toggle();
        expect(said[0]).toBe('First sentence.');
        events[0]!.end();
        expect(said[1]).toBe('Second sentence.');
        document.activeElement!.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
            cancelable: true,
          }),
        );
        expect(window.getSelection()!.anchorNode!.textContent).toBe(' Second sentence.');
        expect(window.getSelection()!.anchorOffset).toBe(1);
        // Inline hard_break/atom occupies one model position but no DOM text character.
        expect(core.selection).toMatchObject({
          chapterId: 'notes',
          passageId: passage.id,
          from: 17,
          to: 17,
        });
        expect(core.html('a')).toBe(manuscript);
        expect(core.html('notes')).toBe(before);
      } finally {
        reader.dispose();
        surfaces.destroy();
        document.body.innerHTML = '';
      }
    },
  );
