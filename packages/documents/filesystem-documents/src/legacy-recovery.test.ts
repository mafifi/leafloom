import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importNeo } from './legacy';
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-legacy-recovery-')),
    source = join(root, 'book-original'),
    destination = join(root, 'imported');
  await mkdir(join(source, 'chapters'), { recursive: true });
  return { root, source, destination, close: () => rm(root, { recursive: true, force: true }) };
}
it('complete legacy temporary metadata wins over older backup and corrupt original remains recoverable', async () => {
  const f = await fixture();
  try {
    const original = '{unfinished title',
      meta = {
        id: 'old',
        title: 'Latest title',
        author: 'Writer',
        chapterOrder: ['two'],
        customField: { keep: true },
      };
    await writeFile(join(f.source, 'book.json'), original);
    await writeFile(join(f.source, 'book.json.tmp'), JSON.stringify(meta));
    await writeFile(
      join(f.source, 'book.json.bak'),
      JSON.stringify({ ...meta, title: 'Old title' }),
    );
    await writeFile(join(f.source, 'chapters/two.html'), '<p><u>Exact latest words.</u></p>');
    const imported = await importNeo(f.source, f.destination, 'new-id');
    expect(imported.metadata).toMatchObject({
      id: 'new-id',
      title: 'Latest title',
      customField: { keep: true },
    });
    expect(imported.chapters[0]!.html).toBe('<p><u>Exact latest words.</u></p>');
    const artifact = (await readdir(f.destination)).find((name) =>
      name.startsWith('neo-recovered-book.json-'),
    );
    expect(artifact).toBeDefined();
    expect(await readFile(join(f.destination, artifact!), 'utf8')).toBe(original);
    expect(await readFile(join(f.source, 'book.json'), 'utf8')).toBe(original);
  } finally {
    await f.close();
  }
});
it('missing legacy metadata falls back to complete backup', async () => {
  const f = await fixture();
  try {
    await writeFile(
      join(f.source, 'book.json.bak'),
      JSON.stringify({ id: 'old', title: 'Backup title', author: 'Writer', chapterOrder: ['one'] }),
    );
    await writeFile(join(f.source, 'chapters/one.html'), '<p>Saved.</p>');
    expect((await importNeo(f.source, f.destination)).metadata.title).toBe('Backup title');
  } finally {
    await f.close();
  }
});
it('lost metadata reconstructs only existing independent chapter HTML in lexical order and retains sidecars', async () => {
  const f = await fixture();
  try {
    for (const [id, html] of [
      ['z', '<p><b>Last.</b></p>'],
      ['a', '<p>First.</p>'],
    ])
      await writeFile(join(f.source, 'chapters', id + '.html'), html);
    await writeFile(join(f.source, 'notes.html'), '<p>Preserved notes.</p>');
    const imported = await importNeo(f.source, f.destination);
    expect(imported.metadata).toMatchObject({
      id: 'book-original',
      title: 'Untitled',
      author: 'Anonymous',
    });
    expect(imported.chapters.map((ch) => ch.id)).toEqual(['a', 'z']);
    expect(imported.chapters[1]!.html).toBe('<p><b>Last.</b></p>');
    expect(await readFile(join(f.destination, 'notes.html'), 'utf8')).toBe(
      '<p>Preserved notes.</p>',
    );
    await expect(readFile(join(f.source, 'book.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await f.close();
  }
});
it('valid metadata never rebuilds away missing references or orphan writing, and absent words are not fabricated', async () => {
  for (const kind of ['missing', 'orphan', 'empty'] as const) {
    const f = await fixture();
    try {
      if (kind !== 'empty')
        await writeFile(
          join(f.source, 'book.json'),
          JSON.stringify({
            id: 'old',
            title: 'Known',
            author: 'Writer',
            chapterOrder: kind === 'missing' ? ['absent'] : [],
          }),
        );
      if (kind === 'orphan')
        await writeFile(join(f.source, 'chapters/one.html'), '<p>Unreferenced words.</p>');
      await expect(importNeo(f.source, f.destination)).rejects.toThrow();
      await expect(readFile(join(f.destination, 'manuscript.json'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await f.close();
    }
  }
});
