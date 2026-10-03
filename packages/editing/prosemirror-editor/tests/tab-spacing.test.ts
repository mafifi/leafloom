import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';

describe('source079 em-space indentation', () => {
  it.each([0, 1, 2, 3])(
    'dedents at most two of %i preceding em spaces with rich history intact',
    (spaces) => {
      const document = new JSDOM('').window.document;
      const original = `<p><b>Alpha${'\u2003'.repeat(spaces)}</b><i>tail.</i></p>`;
      const core = new BookCore(
        document,
        {
          formatVersion: 'neo-lifecycle/v1',
          revision: 0,
          metadata: { id: 'book', title: 'Indent', author: 'Writer' },
          chapters: [{ id: 'a', html: original }],
          darlings: [],
        },
        null,
        '<p></p>',
        '<p></p>',
      );
      const passage = core.passageRows('a')[0];
      core.selectPassage(passage.id, 5 + spaces);
      const revision = core.revision;
      core.indent(true);
      expect(core.passageRows('a')[0].text).toBe(
        'Alpha' + '\u2003'.repeat(Math.max(0, spaces - 2)) + 'tail.',
      );
      expect(core.html('a')).toContain('<i>tail.</i>');
      expect(core.state.selection.$from.parentOffset).toBe(5 + Math.max(0, spaces - 2));
      if (spaces) {
        core.undo();
        expect(core.html('a')).toBe(original);
        core.redo();
        expect(core.passageRows('a')[0].text).toBe(
          'Alpha' + '\u2003'.repeat(Math.max(0, spaces - 2)) + 'tail.',
        );
      } else expect(core.revision).toBe(revision);
    },
  );
});
