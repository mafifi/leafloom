import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
import { importHTML, exportHTML } from '../src/codec';
import { continuedSpeech, scriptLines, suggestedText } from '../src/screenplay-rules';
const document = new JSDOM('').window.document;
const open = (html: string) =>
  new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'script', title: 'Script', author: 'Writer', format: 'screenplay' },
      chapters: [{ id: 'chapter', html }],
      darlings: [],
    },
    null,
    '<p>Notes.</p>',
    '',
  );
const rows = (c: BookCore) =>
  c.passages('chapter').map((p) => [p.node.attrs.screenplay, p.node.textContent]);
function select(c: BookCore, index: number, offset: number) {
  c.selectPassage(c.passages('chapter')[index].id, offset);
}
for (const soft of [false, true])
  it(`semantic Enter ${soft ? 'with Shift' : 'without Shift'} splits a rich dialogue midline and preserves author Undo`, () => {
    const c = open('<p class="sp-dialogue"><i>Hello world.</i></p>');
    select(c, 0, 6);
    const original = c.html('chapter');
    c.enter(soft);
    expect(rows(c)).toEqual([
      ['dialogue', 'Hello '],
      ['dialogue', 'world.'],
    ]);
    expect(c.html('chapter')).toContain('<i>world.</i>');
    expect(c.html('chapter')).not.toContain('<br');
    c.undo();
    expect(c.html('chapter')).toBe(original);
    c.redo();
    expect(rows(c)).toHaveLength(2);
  });
it('Enter at the beginning inserts an empty speech above while preserving the original passage identity', () => {
  const c = open('<p class="sp-dialogue">Hello.</p>');
  const id = c.passages('chapter')[0].id;
  select(c, 0, 0);
  c.enter();
  expect(rows(c)).toEqual([
    ['dialogue', ''],
    ['dialogue', 'Hello.'],
  ]);
  expect(c.passages('chapter')[1].id).toBe(id);
});
it('Enter infers a speaker at the actual end and Backspace reverses its provisional dialogue', () => {
  const c = open('<p class="sp-action"><b>KIM</b></p>');
  select(c, 0, 3);
  c.enter();
  expect(rows(c)).toEqual([
    ['character', 'KIM'],
    ['dialogue', ''],
  ]);
  c.backspace();
  expect(rows(c)).toEqual([['action', 'KIM']]);
  expect(c.html('chapter')).toContain('<b>KIM</b>');
  c.undo();
  expect(rows(c)).toEqual([
    ['character', 'KIM'],
    ['dialogue', ''],
  ]);
});
it('parenthetical conversion preserves rich inner marks and positions the caret before its closing parenthesis', () => {
  const c = open('<p class="sp-dialogue"><i>quietly</i></p>');
  select(c, 0, 2);
  c.setScreenplayElement('parenthetical');
  expect(rows(c)).toEqual([['parenthetical', '(quietly)']]);
  expect(c.state.selection.$head.parentOffset).toBe(8);
  c.enter();
  expect(rows(c)).toEqual([
    ['parenthetical', '(quietly)'],
    ['dialogue', ''],
  ]);
  expect(c.passages('chapter')[0].node.firstChild?.marks.map((mark) => mark.type.name)).toContain(
    'italic',
  );
  expect(c.passages('chapter')[0].node.textContent).toBe('(quietly)');
});
it('character completion is projection until accepted, dismissal does not add history, and editing renews the hint', () => {
  const c = open(
    '<p class="sp-character">KIM</p><p class="sp-dialogue">Hello.</p><p class="sp-character"><b>K</b></p>',
  );
  select(c, 2, 1);
  const saved = c.html('chapter'),
    version = c.historyVersion;
  expect(c.screenplayCompletion).toBe('IM');
  c.dismissScreenplayCompletion();
  expect(c.screenplayCompletion).toBe('');
  expect(c.historyVersion).toBe(version);
  expect(c.html('chapter')).toBe(saved);
  c.insert('I');
  expect(c.screenplayCompletion).toBe('M');
  c.acceptScreenplayCompletion();
  expect(rows(c)[2]).toEqual(['character', 'KIM']);
  c.undo();
  expect(rows(c)[2]).toEqual(['character', 'K']);
  c.redo();
  expect(rows(c)[2]).toEqual(['character', 'KIM']);
});
it('heading Tab expands prefix, location suffix, dash separator and standard time with single-owner history', () => {
  const c = open('<p class="sp-heading">INT. KITCHEN - NIGHT</p><p class="sp-action">INT</p>');
  select(c, 1, 3);
  c.screenplayTab();
  expect(rows(c)[1]).toEqual(['scene-heading', 'INT. ']);
  c.insert('KIT');
  expect(c.screenplayCompletion).toBe('CHEN');
  c.screenplayTab();
  expect(rows(c)[1][1]).toBe('INT. KITCHEN');
  c.screenplayTab();
  expect(rows(c)[1][1]).toBe('INT. KITCHEN - ');
  c.insert('N');
  expect(c.screenplayCompletion).toBe('IGHT');
  c.enter();
  expect(rows(c).slice(1)).toEqual([
    ['scene-heading', 'INT. KITCHEN - NIGHT'],
    ['action', ''],
  ]);
});
it('CONT D requires intervening action and same preceding voice, excluding headings transitions dialogue and explicit extensions', () => {
  for (const [middle, name, want] of [
    ['<p class="sp-action">Walk.</p>', 'KIM', true],
    ['<p class="sp-shot">CLOSE ON.</p>', 'KIM', true],
    ['<p class="sp-dialogue">Again.</p>', 'KIM', false],
    ['<p class="sp-transition">CUT TO:</p>', 'KIM', false],
    ['<p class="sp-heading">INT. ROOM</p>', 'KIM', false],
    ['<p class="sp-action">Walk.</p>', 'KIM (V.O.)', false],
    ['<p class="sp-character">JO</p><p class="sp-action">Walk.</p>', 'KIM', false],
  ] as const) {
    const c = open(
        `<p class="sp-character">KIM</p><p class="sp-dialogue">Hello.</p>${middle}<p class="sp-character">${name}</p>`,
      ),
      lines = scriptLines(c.state.doc);
    expect(continuedSpeech(lines, lines.length - 1)).toBe(want);
    expect(c.html('chapter')).not.toContain('data-contd');
  }
});
it('exact speaker matches suppress longer-name completion and blank speakers suggest the conversational partner', () => {
  const c = open(
      '<p class="sp-character">KIMBERLY</p><p class="sp-character">KIM</p><p class="sp-character">KIM</p><p class="sp-character">JO</p><p class="sp-character"></p>',
    ),
    lines = scriptLines(c.state.doc);
  expect(suggestedText(lines, 1)).toBe('');
  expect(suggestedText(lines, 4)).toBe('KIM');
});
it('runtime screenplay geometry and hints never become canonical saved attributes', () => {
  const parsed = importHTML(
    document,
    '<p class="sp-character" data-contd="" data-ghost="IM" data-ghost-empty="" data-pg="2" data-fill="4" data-scene-id="scene"><b>K</b></p>',
  );
  const html = exportHTML(document, parsed);
  expect(html).toContain('data-scene-id="scene"');
  for (const attribute of ['data-contd', 'data-ghost', 'data-pg', 'data-fill'])
    expect(html).not.toContain(attribute);
  expect(html).toContain('<b>K</b>');
});
it('script uppercase elements preserve literal heading hyphens while action retains prose dialogue punctuation', () => {
  for (const [role, protectedDash] of [
    ['heading', true],
    ['character', true],
    ['transition', true],
    ['shot', true],
    ['action', false],
  ] as const) {
    const c = open(`<p class="sp-${role}">ROOM - </p>`);
    select(c, 0, 7);
    c.insert('DAY');
    expect(c.passages('chapter')[0].text).toBe(protectedDash ? 'ROOM - DAY' : 'ROOM – DAY');
  }
});
it('empty screenplay elements follow the source transition table and empty parentheses disappear', () => {
  for (const [role, next] of [
    ['heading', 'action'],
    ['action', 'character'],
    ['character', 'action'],
    ['paren', 'dialogue'],
    ['dialogue', 'action'],
    ['transition', 'action'],
    ['shot', 'action'],
  ] as const) {
    const c = open(`<p class="sp-${role}">${role === 'paren' ? '()' : ''}</p>`);
    select(c, 0, role === 'paren' ? 1 : 0);
    c.enter(true);
    expect(rows(c)).toEqual([[next, '']]);
  }
});
it('midline element transitions retain both rich text halves with the source role table', () => {
  for (const [role, next] of [
    ['heading', 'action'],
    ['action', 'action'],
    ['character', 'dialogue'],
    ['paren', 'dialogue'],
    ['dialogue', 'dialogue'],
    ['transition', 'scene-heading'],
    ['shot', 'action'],
  ] as const) {
    const c = open(`<p class="sp-${role}"><b>First second</b></p>`);
    select(c, 0, 6);
    c.enter();
    expect(rows(c)).toEqual([
      [role === 'heading' ? 'scene-heading' : role === 'paren' ? 'parenthetical' : role, 'First '],
      [next, 'second'],
    ]);
    expect(
      c
        .passages('chapter')
        .every((p) => p.node.firstChild?.marks.some((m) => m.type.name === 'bold')),
    ).toBe(true);
  }
});
it('recognized screenplay HTML pasted onto a blank script preserves all element roles, rich marks and literal heading hyphens with one Undo', () => {
  const c = open('<p></p>');
  select(c, 0, 0);
  const before = c.html('chapter');
  c.paste({
    html: '<div class="script-body"><p class="sp-heading" data-scene-id="foreign-scene">INT. ROOM - DAY</p><p class="sp-action"><i>First action.</i></p><p class="sp-character">KIM</p><p class="sp-paren">(quietly)</p><p class="sp-dialogue"><b>Hello.</b></p><p class="sp-transition">CUT TO:</p><p class="sp-shot">CLOSE ON THE DOOR</p></div>',
    text: '',
  });
  expect(rows(c).map((row) => row[0])).toEqual([
    'scene-heading',
    'action',
    'character',
    'parenthetical',
    'dialogue',
    'transition',
    'shot',
  ]);
  expect(c.passages('chapter')[0].text).toBe('INT. ROOM - DAY');
  expect(c.html('chapter')).toContain('<i>First action.</i>');
  expect(c.html('chapter')).toContain('<b>Hello.</b>');
  expect(c.html('chapter')).not.toContain('foreign-scene');
  c.undo();
  expect(c.html('chapter')).toBe(before);
  c.redo();
  expect(c.screenplayScenes).toHaveLength(1);
});
it('multiline Fountain clipboard shares the portable file reader, retains cues and rich marks, and contributes one author Undo', () => {
  const c = open('<p></p>');
  select(c, 0, 0);
  const before = c.html('chapter');
  c.paste({
    text: 'Title: Clipboard script\nAuthor: Other writer\n\nINT. ROOM - DAY\n\nShe waits - or listens.\n\nKIM\n(quietly)\n**Hello.**\n\nCUT TO:\n\nEXT. ROAD - NIGHT',
  });
  expect(rows(c)).toEqual([
    ['scene-heading', 'INT. ROOM - DAY'],
    ['action', 'She waits - or listens.'],
    ['character', 'KIM'],
    ['parenthetical', '(quietly)'],
    ['dialogue', 'Hello.'],
    ['transition', 'CUT TO:'],
    ['scene-heading', 'EXT. ROAD - NIGHT'],
  ]);
  expect(c.html('chapter')).toContain('<b>Hello.</b>');
  expect(c.metadata.title).toBe('Script');
  expect(c.metadata.author).toBe('Writer');
  c.undo();
  expect(c.html('chapter')).toBe(before);
  c.redo();
  expect(c.screenplayScenes).toHaveLength(2);
  const saved = c.checkpoint();
  const reopened = new BookCore(document, saved.book, saved.reviews, saved.notes, saved.outline);
  expect(rows(reopened)).toEqual(rows(c));
  expect(reopened.passages('chapter').map((p) => p.id)).toEqual(
    c.passages('chapter').map((p) => p.id),
  );
});
it('script HTML clipboard follows source paraRuns whitespace and inline-break flattening while retaining empty element lines',()=>{
 const c=open('<p></p>');select(c,0,0);c.paste({text:'',html:'<p class="sp-dialogue">  <i>Hello</i><br><b>again</b>&nbsp;</p><p class="sp-character"></p>'});expect(rows(c)).toEqual([['dialogue','  Helloagain '],['character','']]);expect(c.html('chapter')).toContain('<i>Hello</i><b>again</b>');c.undo();expect(rows(c)).toEqual([[null,'']]);
});
it('source large-script paste keeps rich words before and after the caret as their own lines and restores the whole author operation on Undo',()=>{
 const c=open('<p class="sp-action"><i>Alpha Omega</i></p>');select(c,0,6);const before=c.html('chapter'),original=c.passages('chapter')[0].id;const lines=Array.from({length:64},(_,index)=>`<p class="sp-action">Incoming ${index+1}.</p>`);c.paste({text:'',html:lines.join('')});expect(c.passages('chapter')).toHaveLength(66);expect(c.passages('chapter')[0]).toMatchObject({id:original,text:'Alpha '});expect(c.passages('chapter').at(-1)?.text).toBe('Omega');expect(c.passages('chapter')[64].text).toBe('Incoming 64.');expect(c.state.selection.$head.parent.textContent).toBe('Incoming 64.');expect(c.html('chapter')).toContain('<i>Alpha </i>');expect(c.html('chapter')).toContain('<i>Omega</i>');expect(new Set(c.passages('chapter').map(p=>p.id)).size).toBe(66);c.undo();expect(c.html('chapter')).toBe(before);c.redo();expect(c.passages('chapter')).toHaveLength(66);
});
it('copying real Notes retains author blank lines for Fountain paste without giving auxiliary paragraphs script roles', () => {
  const notes = '<p>INT. ROOM - DAY</p><p></p><p>She waits - or listens.</p><p></p><p>KIM</p><p>(quietly)</p><p>**Hello.**</p>';
  const c = new BookCore(document, {
    formatVersion: 'neo-lifecycle/v1', revision: 0,
    metadata: {id: 'script', title: 'Script', author: 'Writer', format: 'screenplay'},
    chapters: [{id: 'chapter', html: '<p></p>'}], darlings: [],
  }, null, notes, '');
  c.selectAll('notes');
  const copied = c.copySelection();
  expect(copied.text).toBe('INT. ROOM - DAY\n\nShe waits - or listens.\n\nKIM\n(quietly)\n**Hello.**');
  expect(copied.html).not.toMatch(/data-screenplay|class="sp-/);
  select(c, 0, 0);
  c.paste(copied);
  expect(rows(c)).toEqual([
    ['scene-heading', 'INT. ROOM - DAY'], ['action', 'She waits - or listens.'],
    ['character', 'KIM'], ['parenthetical', '(quietly)'], ['dialogue', 'Hello.'],
  ]);
  expect(c.html('chapter')).toContain('<b>Hello.</b>');
  c.undo();
  expect(rows(c)).toEqual([[null, '']]);
  c.redo();
  expect(c.html('chapter')).toContain('<b>Hello.</b>');
  expect(c.html('notes')).toBe(notes);
});
