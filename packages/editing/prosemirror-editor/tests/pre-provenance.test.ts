import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { BookCore } from '../src/core';
const document = new JSDOM('').window.document;
function open(html: string) {
  return new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book-pre', title: 'Code provenance', author: 'Writer' },
      chapters: [{ id: 'chapter', html }],
      darlings: [],
    },
    null,
    '',
    '',
  );
}
for (const wrapped of [false, true])
  for (const target of ['code', 'neighbor'] as const)
    it(`retains ${wrapped ? 'nested-code' : 'plain-pre'} source structure while editing ${target}, Undo and durable reopen`, () => {
      const pre = wrapped ? '<pre><code>Code.</code></pre>' : '<pre>Code.</pre>',
        html = pre + '<p><i>Gamma.</i></p>',
        core = open(html),
        rows = core.passageRows('chapter');
      core.selectPassage(rows[target === 'code' ? 0 : 1].id, 6 - Number(target === 'code'));
      core.insert('X');
      const expected =
        target === 'code'
          ? pre.replace('Code.', 'Code.X') + '<p><i>Gamma.</i></p>'
          : pre + '<p><i>Gamma.X</i></p>';
      expect(core.checkpoint().book.chapters[0].html).toBe(expected);
      core.undo();
      expect(core.html('chapter')).toBe(html);
      core.redo();
      expect(core.html('chapter')).toBe(expected);
      const saved = core.checkpoint(),
        reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
      expect(reopened.html('chapter')).toBe(expected);
      expect(reopened.passageRows('chapter').map((row) => row.id)).toEqual(
        rows.map((row) => row.id),
      );
    });
it('keeps an existing code passage identity encoded before wrapper provenance was retained', () => {
  const core = open('<pre>Code.</pre><p><i>Gamma.</i></p>'),
    saved = core.checkpoint();
  const oldSignature = createHash('sha256')
    .update(
      JSON.stringify({
        type: 'code_block',
        attrs: { class: '', align: null, data: {} },
        content: [{ type: 'text', text: 'Code.' }],
      }),
    )
    .digest('hex');
  saved.book.chapters[0].passages[0] = {
    id: 'existing-code-id',
    path: [0],
    signature: oldSignature,
  };
  const reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  expect(reopened.passageRows('chapter')[0].id).toBe('existing-code-id');
  reopened.selectPassage(reopened.passageRows('chapter')[1].id, 6);
  reopened.insert('X');
  expect(reopened.checkpoint().book.chapters[0].html).toBe('<pre>Code.</pre><p><i>Gamma.X</i></p>');
  expect(reopened.passageRows('chapter')[0].id).toBe('existing-code-id');
});
