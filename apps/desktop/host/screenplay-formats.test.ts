import { expect, it } from 'vitest';
import {
  readScreenplay,
  writeScreenplay,
  screenplayFromHTML,
  screenplayHTML,
} from './screenplay-formats.ts';
const script = {
  title: { title: 'Harbor', author: 'Writer' },
  lines: [
    { element: 'scene-heading', runs: [{ text: 'INT. ROOM - DAY', marks: [] }] },
    { element: 'action', runs: [{ text: 'Rain falls.', marks: [] }] },
    { element: 'character', runs: [{ text: 'KIM', marks: [] }] },
    { element: 'parenthetical', runs: [{ text: '(quietly)', marks: [] }] },
    {
      element: 'dialogue',
      runs: [
        { text: 'Hello ', marks: [] },
        { text: 'there.', marks: ['italic', 'bold', 'underline'] },
      ],
    },
    { element: 'transition', runs: [{ text: 'CUT TO:', marks: [] }] },
    { element: 'shot', runs: [{ text: 'CLOSE ON THE DOOR', marks: [] }] },
  ],
};
it('FDX retains seven elements, exact text and supported rich marks', () => {
  const xml = writeScreenplay(script, 'fdx');
  const parsed = readScreenplay(xml, 'fdx');
  expect(parsed.lines).toEqual(script.lines);
  expect(parsed.title.title).toBe('Harbor');
  expect(parsed.title.author).toBe('Writer');
  const html = screenplayHTML(parsed.lines);
  expect(screenplayFromHTML([html], script.title).lines).toEqual(script.lines);
});
it('Fountain retains screenplay structure, speakers, parentheticals and emphasis', () => {
  const fountain = { ...script, lines: script.lines.filter((line) => line.element !== 'shot') };
  const text = writeScreenplay(fountain, 'fountain');
  const parsed = readScreenplay(text, 'fountain');
  expect(parsed.lines).toEqual(fountain.lines);
  expect(parsed.title.title).toBe('Harbor');
});
it('rejects unsupported authored structures and malformed input rather than discarding them', () => {
  expect(() => readScreenplay('<FinalDraft><Content>', 'fdx')).toThrow();
  expect(() => readScreenplay('INT. ROOM\n\n[[Private comment]]', 'fountain')).toThrow(
    'UNSUPPORTED_SCREENPLAY',
  );
  expect(() =>
    screenplayFromHTML(
      ['<p class="sp-dialogue"><a href="https://example.com">Link</a></p>'],
      script.title,
    ),
  ).toThrow('UNSUPPORTED_SCREENPLAY');
  expect(() =>
    writeScreenplay(
      { ...script, lines: [{ element: 'dialogue', runs: [{ text: 'Cut', marks: ['strike'] }] }] },
      'fountain',
    ),
  ).toThrow('UNSUPPORTED_SCREENPLAY');
});

it('imports, saves and exports screenplay files through the real library provider', async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { LibraryHost } = await import('./library.ts');
  const root = await mkdtemp(join(tmpdir(), 'leafloom-script-files-'));
  const host = new LibraryHost(root);
  await host.initialize();
  try {
    const source = join(root, 'script.fdx'),
      target = join(root, 'export.fdx');
    const value = {
      ...script,
      title: {
        ...script.title,
        credit: 'Written by',
        draft: 'Draft one',
        contact: 'writer@example.com',
      },
    };
    await writeFile(source, writeScreenplay(value, 'fdx'));
    const metadata = (await host.request('importManuscript', { source })) as {
      id: string;
      format: string;
    };
    expect(metadata.format).toBe('screenplay');
    const opened = (await host.request('openBook', { bookId: metadata.id })) as {
      lease: string;
      book: { chapters: { html: string }[] };
    };
    expect(opened.book.chapters).toHaveLength(1);
    expect(opened.book.chapters[0].html).toContain('data-screenplay="dialogue"');
    await host.request('exportBook', {
      bookId: metadata.id,
      format: 'fdx',
      destination: target,
      language: 'en',
    });
    const exported = readScreenplay(await readFile(target, 'utf8'), 'fdx');
    expect(exported.lines).toEqual(script.lines);
    expect(exported.title).toEqual(value.title);
    await host.request('closeBook', { bookId: metadata.id, lease: opened.lease });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('roundtrips literal action prefixes and rejects Fountain shapes it cannot preserve', () => {
  for (const text of ['!Bang', '.Literal heading', '@Literal speaker', '>Literal transition']) {
    const value = {
      title: script.title,
      lines: [{ element: 'action', runs: [{ text, marks: [] }] }],
    };
    expect(readScreenplay(writeScreenplay(value, 'fountain'), 'fountain').lines).toEqual(
      value.lines,
    );
  }
  for (const lines of [
    [{ element: 'dialogue', runs: [{ text: 'Orphan speech', marks: [] }] }],
    [
      { element: 'character', runs: [{ text: 'KIM', marks: [] }] },
      { element: 'dialogue', runs: [{ text: 'Hello\nworld', marks: [] }] },
    ],
  ])
    expect(() => writeScreenplay({ title: script.title, lines }, 'fountain')).toThrow(
      'UNSUPPORTED_SCREENPLAY',
    );
});
it('retains screenplay title credit, contact and draft through both exchange formats', () => {
  const title = {
    ...script.title,
    credit: 'Written by',
    draft: 'First draft',
    contact: 'writer@example.com',
  };
  for (const format of ['fdx', 'fountain'] as const) {
    const value = { title, lines: script.lines.filter((l) => l.element !== 'shot') };
    expect(readScreenplay(writeScreenplay(value, format), format).title).toEqual(title);
  }
});
it('rejects remaining ambiguous Fountain speech without losing their source', () => {
  for (const line of [
    { element: 'dialogue', runs: [{ text: '(Hello)', marks: [] }] },
    { element: 'parenthetical', runs: [{ text: 'quietly', marks: [] }] },
  ]) {
    const value = { title: script.title, lines: [script.lines[2], line] };
    const before = structuredClone(value);
    expect(() => writeScreenplay(value, 'fountain')).toThrow('UNSUPPORTED_SCREENPLAY');
    expect(value).toEqual(before);
  }
});
it('reports unsupported exchange as a safe capability error instead of a disk failure',async()=>{
 const {hostErrorCode}=await import('./error-code.ts');const {ScreenplayCodecError}=await import('./screenplay-formats.ts');expect(hostErrorCode(new ScreenplayCodecError())).toBe('UNSUPPORTED_SCREENPLAY');
});

it('retains forced-looking dialogue inside a speech block',()=>{const value={title:script.title,lines:[script.lines[2],{element:'dialogue',runs:[{text:'@home',marks:[]}]}]};expect(readScreenplay(writeScreenplay(value,'fountain'),'fountain').lines).toEqual(value.lines);});

it('projects neutral empty action for interchange without mutating authored lines',()=>{const value={title:script.title,lines:[{element:'action',runs:[]},script.lines[1],{element:'action',runs:[{text:' \n',marks:[]}]}]};const before=structuredClone(value);for(const format of ['fountain','fdx'] as const)expect(readScreenplay(writeScreenplay(value,format),format).lines).toEqual([script.lines[1]]);expect(value).toEqual(before);});
