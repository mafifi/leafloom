import { expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
import { importHTML, exportHTML } from '../src/codec';
const document = new JSDOM('').window.document;
const open = (
  html = '<p class="sp-heading">INT. ROOM - DAY</p><p class="sp-character">KIM</p><p class="sp-dialogue"><i>Hello.</i></p>',
) =>
  new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Script', author: 'Writer', format: 'screenplay' },
      chapters: [{ id: 'chapter', html }],
      darlings: [],
    },
    null,
    '<p>Notes.</p>',
    '<p>Outline.</p>',
  );
it('imports legacy element semantics and persists canonical semantic attributes without losing rich marks', () => {
  const parsed = importHTML(document, '<p class="sp-dialogue"><i>Hello.</i></p>');
  expect(parsed.firstChild?.attrs.screenplay).toBe('dialogue');
  const saved = exportHTML(document, parsed);
  expect(saved).toContain('data-screenplay="dialogue"');
  expect(saved).toContain('<i>Hello.</i>');
  const reopened = importHTML(document, saved);
  expect(reopened.firstChild?.attrs.screenplay).toBe('dialogue');
  expect(reopened.textContent).toBe(parsed.textContent);
  expect(exportHTML(document, reopened)).toBe(saved);
});
it('element changes, typed dialogue and screenplay mode share history and survive checkpoint reopen', () => {
  const c = open();
  c.select('chapter', 1);
  const before = c.checkpoint();
  expect(c.manuscriptMode).toBe('screenplay');
  expect(c.screenplayScenes.map((s) => s.label)).toEqual(['INT. ROOM - DAY']);
  expect(c.setScreenplayElement('action')).toBe(true);
  expect(c.screenplayScenes).toHaveLength(0);
  c.undo();
  expect(c.screenplayScenes).toHaveLength(1);
  c.redo();
  expect(c.screenplayScenes).toHaveLength(0);
  const saved = c.checkpoint();
  expect(saved.book.formatVersion).toBe('leafloom-manuscript/v2');
  const reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  expect(reopened.manuscriptMode).toBe('screenplay');
  expect(reopened.passages('chapter')[0].id).toBe(c.passages('chapter')[0].id);
  expect(before.book.chapters[0].html).toContain('INT. ROOM');
  c.setManuscriptMode('prose');
  expect(c.manuscriptMode).toBe('prose');
  c.undo();
  expect(c.manuscriptMode).toBe('screenplay');
});
it('Enter after a character creates dialogue, Tab trades parenthetical and dialogue, Notes retain ordinary editing', () => {
  const c = open('<p class="sp-character">KIM</p>');
  c.select('chapter', 3);
  c.enter();
  expect(c.passages('chapter').map((p) => p.node.attrs.screenplay)).toEqual([
    'character',
    'dialogue',
  ]);
  c.screenplayTab();
  expect(c.passages('chapter')[1].node.attrs.screenplay).toBe('parenthetical');
  c.screenplayTab();
  expect(c.passages('chapter')[1].node.attrs.screenplay).toBe('dialogue');
  c.select('notes', 2);
  expect(c.setScreenplayElement('shot')).toBe(false);
  c.enter();
  expect(c.passages('notes').every((p) => !p.node.attrs.screenplay)).toBe(true);
});
it('Enter respects an explicitly authored action even when its words resemble a speaker', () => {
  const c = open('<p data-screenplay="action" class="sp-action">STOP</p>');
  c.select('chapter', 4);
  c.enter();
  expect(c.passages('chapter').map((p) => p.node.attrs.screenplay)).toEqual(['action', 'action']);
});
it('unknown or conflicting screenplay semantics remain intact and protected', () => {
  for (const html of [
    '<p data-screenplay="future-role">Keep me.</p>',
    '<p data-screenplay="dialogue" class="sp-character">Keep me.</p>',
  ]) {
    const c = open(html);
    expect(c.supported('chapter')).toBe(false);
    expect(c.checkpoint().book.chapters[0].html).toBe(html);
    c.select('chapter', 1);
    expect(c.setScreenplayElement('action')).toBe(false);
  }
});
it('adopts an authoritative v2 mode even when legacy format metadata is absent', () => {
  const c = open('<p>Walk.</p>');
  c.setManuscriptMode('prose');
  const baseline = c.checkpoint();
  delete baseline.book.metadata.format;
  const local = new BookCore(
    document,
    baseline.book,
    baseline.reviews,
    baseline.notes,
    baseline.outline,
  );
  const remote = structuredClone(baseline);
  if (remote.book.formatVersion !== 'leafloom-manuscript/v2') throw Error('fixture');
  remote.book.mode = 'screenplay';
  remote.book.revision++;
  const result = local.reconcileExternal(baseline, remote, {
    date: '2026-10-05T12:00:00Z',
    conflictSuffix: 'Conflict',
    chapterLabels: {},
  });
  expect(result.changed).toBe(true);
  expect(local.manuscriptMode).toBe('screenplay');
});

it('refuses a persisted prose mode that contradicts its screenplay metadata', () => {
  const source = open().checkpoint();
  if (source.book.formatVersion !== 'leafloom-manuscript/v2') throw Error('fixture');
  source.book.mode = 'prose';
  expect(() => new BookCore(document, source.book, source.reviews, source.notes, source.outline))
    .toThrow('Screenplay metadata and manuscript mode must agree');
});

it('refuses contradictory external mode metadata without changing the live manuscript or history', () => {
  const local = open();
  local.select('chapter', 1);
  local.setScreenplayElement('action');
  const baseline = local.checkpoint();
  const incoming = structuredClone(baseline);
  if (incoming.book.formatVersion !== 'leafloom-manuscript/v2') throw Error('fixture');
  incoming.book.mode = 'prose';
  incoming.book.revision++;
  expect(() => local.reconcileExternal(baseline, incoming, {
    date: '2026-10-06T12:00:00Z', conflictSuffix: 'Conflict', chapterLabels: {},
  })).toThrow('Screenplay metadata and manuscript mode must agree');
  expect(local.checkpoint()).toEqual(baseline);
  expect(local.manuscriptMode).toBe('screenplay');
  expect(local.undo()).toBe(true);
  expect(local.screenplayScenes.map((scene) => scene.label)).toEqual(['INT. ROOM - DAY']);
});
it('opens historical screenplay attributes with their valid prior passage identities', async () => {
  const { createHash } = await import('node:crypto');
  const { importHTML } = await import('../src/codec');
  const { signature } = await import('../src/identity');
  for (const html of [
    '<p data-screenplay="action">Walk.</p>',
    '<p class="sp-action">Walk.</p>',
    '<p data-screenplay="camera-position">Walk.</p>',
  ]) {
    const parsed = importHTML(document, html).firstChild!;
    const old = parsed.toJSON();
    delete old.attrs.screenplay;
    // Reconstruct the previous codec's generic data-* representation.
    if (html.includes('data-screenplay="action"')) old.attrs.data['data-screenplay'] = 'action';
    const savedSignature = createHash('sha256').update(JSON.stringify(old)).digest('hex');
    const version = crypto.randomUUID();
    const book = {
      formatVersion: 'neo-composed/v1',
      revision: 1,
      version,
      metadata: { id: 'old', title: 'Old', author: 'Writer', format: 'screenplay' },
      chapters: [
        {
          id: 'chapter',
          version,
          html,
          passages: [{ id: 'saved-passage', path: [0], signature: savedSignature }],
        },
      ],
      darlings: [],
    };
    const c = new BookCore(document, book, null, '', '');
    const checkpoint = c.checkpoint();
    expect(checkpoint.book.chapters[0].passages[0].id).toBe('saved-passage');
    expect(checkpoint.book.chapters[0].html).toBe(html);
    const reopened = new BookCore(document, checkpoint.book, checkpoint.reviews, '', '');
    expect(reopened.checkpoint().book.chapters[0].passages[0].id).toBe('saved-passage');
  }
});
it('adopts an externally edited legacy script without rejecting its historical passage hash', async () => {
  const { createHash } = await import('node:crypto');
  const { importHTML } = await import('../src/codec');
  const version = crypto.randomUUID();
  function chapter(text: string) {
    const html = `<p class="sp-action">${text}</p>`,
      old = importHTML(document, html).firstChild!.toJSON();
    delete old.attrs.screenplay;
    return {
      id: 'chapter',
      version,
      html,
      passages: [
        {
          id: 'legacy-passage',
          path: [0],
          signature: createHash('sha256').update(JSON.stringify(old)).digest('hex'),
        },
      ],
    };
  }
  const book = {
    formatVersion: 'neo-composed/v1' as const,
    revision: 1,
    version,
    metadata: { id: 'legacy', title: 'Legacy', author: 'Writer', format: 'screenplay' },
    chapters: [chapter('Walk.')],
    darlings: [],
  };
  const c = new BookCore(document, book, null, '', ''),
    baseline = c.checkpoint();
  const remote = { ...baseline, book: { ...book, revision: 2, chapters: [chapter('Run.')] } };
  expect(
    c.reconcileExternal(baseline, remote, {
      date: '2026-10-05T12:00:00Z',
      conflictSuffix: 'Conflict',
      chapterLabels: {},
    }).changed,
  ).toBe(true);
  expect(c.passages('chapter')[0].id).toBe('legacy-passage');
  expect(c.html('chapter')).toBe('<p class="sp-action">Run.</p>');
});
