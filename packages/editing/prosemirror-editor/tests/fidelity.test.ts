import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
import { inspectHTML, inventory } from '../src/fidelity';
const document = new JSDOM('').window.document;
const open = (html: string) =>
  new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [{ id: 'chapter', html }],
      darlings: [],
    },
    null,
    '',
    '',
  );
const supported = [
  '<p>  Before dawn.\u00a0Été 😺</p>',
  '<p class="poetry" style="text-align:right">  Verse<br>  line</p><p class="scene-break" data-sec-brk="s">***</p><p class="ghost" data-sec-id="s">Turning point</p>',
  '<p data-sec-id="opening">The lighthouse was <b>quiet <i>again</i></b>.<span class="ph-mark" data-sid="s-one" contenteditable="false">⚑</span><span class="darling-anchor" data-did="d-one" contenteditable="false"></span></p>',
  '<h2 class="note-heading">Research</h2><ul><li><p>One</p><ol start="3"><li><p>Two</p></li></ol></li></ul><blockquote><p><u>Quote</u> <s>old</s> <a href="https://example.org/reference" title="Source">source</a></p></blockquote><pre><code> x\n  y</code></pre>',
  '<p><strong>Bold</strong> <em>Italic</em> <del>Old</del> <code>code</code> <span style="font-weight:700;font-style:italic">Styled</span></p>',
  '<div class="note-line" data-note="n1">First</div><div>Second</div>',
  '<p><span class="writer-note" data-note="n1">Marked text</span></p>',
  '<p></p><p><br></p>',
  '  Raw\n  note\t text ',
  '\n  <p>  Alpha  beta. </p>\n\t<p>Second</p>\n',
];
const unsupported = [
  '<p><img src="cover.png" alt="Portrait">Caption</p>',
  '<table><tr><td>Cell</td></tr></table>',
  '<p style="color:red">Colour matters</p>',
  '<p id="unique">Identity</p>',
  '<p><a href="file:./reference.pdf">Local link</a></p>',
  '<p><span class="outer"><span class="inner">Nested annotation</span></span></p>',
  '<p><b class="special">Custom mark</b></p>',
  '<p><script>Do not execute</script>Keep source</p>',
  '<p><span style="font-style:normal">Normal</span></p>',
  '<p><span class="bad$class">Class matters</span></p>',
];
it.each(supported)('full rich codec independently preserves: %s', (html) => {
  expect(inspectHTML(document, html).supported).toBe(true);
  const core = open(html);
  expect(core.checkpoint().book.chapters[0].html).toBe(html);
  const passage = core.passageRows('chapter').find((p) => p.size > 0);
  if (passage) {
    core.selectPassage(passage.id, 0);
    core.insert('X');
    const saved = core.checkpoint();
    expect(saved.book.chapters[0].html).not.toContain('pid');
    const reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
    expect(reopened.passageRows('chapter').map((p) => p.id)).toEqual(
      core.passageRows('chapter').map((p) => p.id),
    );
    core.undo();
    expect(core.html('chapter')).toBe(html);
    expect(inventory(document, core.html('chapter'))).toBe(inventory(document, html));
  }
});
it.each(unsupported)('unsupported exact source remains protected: %s', (html) => {
  const core = open(html);
  expect(core.supported('chapter')).toBe(false);
  expect(() => core.insert('Lose nothing')).toThrow('UNSUPPORTED_CONTENT');
  const checkpoint = core.checkpoint();
  expect(checkpoint.book.chapters[0].html).toBe(html);
  expect(checkpoint.book.chapters[0].passages).toEqual([]);
  const reopened = new BookCore(
    document,
    checkpoint.book,
    checkpoint.reviews,
    checkpoint.notes,
    checkpoint.outline,
  );
  expect(reopened.html('chapter')).toBe(html);
});
it.each(['protected', 'contents'])(
  'portable author menu commands preserve %s content and history',
  (kind) => {
    const html = kind === 'protected' ? '<p style="color:red">Alpha.</p>' : '<p>Alpha.</p>';
    const core = open(html);
    if (kind === 'contents') core.setChapterKind('chapter', 'contents');
    core.selectAll('chapter');
    const revision = core.revision,
      version = core.version,
      error = kind === 'protected' ? 'UNSUPPORTED_CONTENT' : 'READ_ONLY_CONTENT';
    core.format('bold');
    core.format('italic');
    core.indent(true);
    expect(core.enter()).toBe(false);
    expect(core.backspace()).toBe(false);
    expect(core.deleteForward()).toBe(false);
    expect(() => core.cutSelection()).toThrow(error);
    expect(() => core.paste({ text: 'Changed' })).toThrow(error);
    expect(() => core.createSticky('Changed')).toThrow(error);
    expect(() => core.insert('Changed')).toThrow(error);
    expect(core.html('chapter')).toBe(html);
    expect(core.revision).toBe(revision);
    expect(core.version).toBe(version);
  },
);
