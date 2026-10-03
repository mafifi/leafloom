import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
import { sanitizeHTML } from '../src/codec';
const document = new JSDOM('').window.document;
const open = () =>
  new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [
        { id: 'a', html: '<p>Alpha <i>beta</i> beta.</p>' },
        { id: 'b', html: '<p><b>Beta</b> returns.</p>' },
      ],
      darlings: [],
    },
    null,
    '<p>Beta notes.</p>',
    '<p>Beta outline.</p>',
  );
it('search scopes match the open tab without changing author selection or history', () => {
  const core = open();
  core.select('a', 4);
  const selection = core.state.selection;
  expect(core.search('beta')).toHaveLength(3);
  expect(core.search('beta', 'notes')).toHaveLength(1);
  expect(core.search('beta', 'outline')).toHaveLength(1);
  expect(core.search('beta', 'all')).toHaveLength(5);
  expect(core.state.selection).toBe(selection);
  expect(core.canUndo).toBe(false);
});
it('Replace All is one master history event preserving each matched mark style', () => {
  const core = open();
  core.replaceMatches(core.search('beta'), 'δelta');
  expect(core.html('a')).toBe('<p>Alpha <i>δelta</i> δelta.</p>');
  expect(core.html('b')).toBe('<p><b>δelta</b> returns.</p>');
  expect(core.html('notes')).toBe('<p>Beta notes.</p>');
  core.undo();
  expect(core.html('a')).toBe('<p>Alpha <i>beta</i> beta.</p>');
  expect(core.html('b')).toBe('<p><b>Beta</b> returns.</p>');
  expect(core.canUndo).toBe(false);
  core.redo();
  expect(core.search('δelta')).toHaveLength(3);
});
it('literal regex characters and Unicode case matches retain native offsets', () => {
  const core = open();
  core.select('a', 1);
  core.insert('İ α+β [x] ');
  expect(core.search('[x]')).toHaveLength(1);
  expect(core.search('α+β')).toHaveLength(1);
  const match = core.search('alpha')[0];
  expect(core.passageRows('a')[0].text.slice(match.from, match.to)).toBe('Alpha');
});
it('overlapping replacements are rejected before any document mutation', () => {
  const core = open(),
    match = core.search('beta')[0],
    snapshot = core.checkpoint();
  expect(() => core.replaceMatches([match, match], 'changed')).toThrow('OVERLAPPING_MATCHES');
  expect(core.checkpoint().book).toEqual(snapshot.book);
});
it('rich Darling preview keeps marks while removing active resources and event handlers', () => {
  const preview = sanitizeHTML(
    document,
    '<p onclick="bad()"><i>Kept</i><img src=x><script>bad()</script><a href="javascript:bad()">Link</a></p>',
  );
  expect(preview).toBe('<p><i>Kept</i>Link</p>');
});
it('NEO Find matches each formatted text node independently', () => {
  const core = new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [{ id: 'a', html: '<p>Al<b>pha</b> Alpha.</p>' }],
      darlings: [],
    },
    null,
    '',
    '',
  );
  expect(core.search('Alpha')).toHaveLength(1);
  expect(core.search('Alpha')[0].from).toBe(6);
});
