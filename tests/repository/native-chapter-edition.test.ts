import { test } from 'vitest';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { BookCore } from '../../packages/editing/prosemirror-editor/src/core';
import { chapterEditionFixture } from '../neo-compat/shared/chapter-edition-io.mjs';
import { inspectChapterEditionSnapshot } from '../../scripts/native-artifact-contracts.mjs';
function snapshot(stage: 'before' | 'after') {
  const ids =
    stage === 'before'
      ? Array.from({ length: 10 }, (_, i) => 'ch-' + (i + 1))
      : ['ch-1', 'ch-2', 'ch-3', 'ch-6', 'ch-5', 'inserted-part', 'ch-7', 'ch-8', 'ch-9', 'ch-10'];
  const core = new BookCore(
    new JSDOM('').window.document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: {
        ...chapterEditionFixture.metadata,
        id: 'edition-fixture',
        restartNumbering: true,
        chapterKinds: {
          ...chapterEditionFixture.metadata.chapterKinds,
          ...(stage === 'after' ? { 'inserted-part': 'part' } : {}),
        },
      },
      chapters: ids.map((id) => ({
        id,
        html:
          id === 'inserted-part'
            ? '<p></p>'
            : chapterEditionFixture.chapters[Number(id.slice(3)) - 1].replace(
                'Alpha ',
                'Edited Alpha ',
              ),
      })),
      darlings:
        stage === 'after'
          ? [
              {
                id: 'deleted-part',
                chapterId: 'ch-4',
                html: chapterEditionFixture.chapters[3],
                date: 1,
              },
            ]
          : [],
    },
    null,
    chapterEditionFixture.notes,
    '',
  );
  const checkpoint = core.checkpoint();
  return {
    'manuscript.json': Buffer.from(JSON.stringify(checkpoint.book)),
    'reviews.json': Buffer.from(JSON.stringify(checkpoint.reviews)),
    'notes.html': Buffer.from(chapterEditionFixture.notes),
    'outline.html': Buffer.from(''),
  };
}
for (const stage of ['before', 'after'] as const)
  test(
    'chapter edition ' + stage + ' independently validates rich persisted roles and identities',
    () => {
      const files = snapshot(stage);
      const result = inspectChapterEditionSnapshot(files, stage, 'edition-fixture');
      assert.equal(result.chapterIds.length, 10);
      for (const mutate of ['notes', 'prose', 'reset', 'role', 'identity']) {
        const changed = { ...files };
        if (mutate === 'notes') changed['notes.html'] = Buffer.from('lost');
        else {
          const book = JSON.parse(changed['manuscript.json'].toString());
          if (mutate === 'prose')
            book.chapters.find((c: { id: string }) => c.id === 'ch-5').html = '<p>lost</p>';
          if (mutate === 'reset') book.metadata.restartNumbering = false;
          if (mutate === 'role') book.metadata.chapterKinds['ch-8'] = 'chapter';
          if (mutate === 'identity')
            book.chapters[1].passages[0].id = book.chapters[0].passages[0].id;
          changed['manuscript.json'] = Buffer.from(JSON.stringify(book));
        }
        assert.throws(() => inspectChapterEditionSnapshot(changed, stage, 'edition-fixture'));
      }
    },
  );

test('chapter edition catalog declares exactly four independently scoped stage/format contracts', async () => {
  const { nativeContracts } = await import('../../scripts/native-artifact-contracts.mjs');
  const variants = nativeContracts.filter((c) => c.parser.fixture === 'chapter-roles');
  assert.equal(variants.length, 4);
  assert.deepEqual(
    variants.map((c) => [c.parser.stage, c.parser.format]),
    [
      ['before', 'html'],
      ['before', 'md'],
      ['after', 'html'],
      ['after', 'md'],
    ],
  );
  for (const c of variants) {
    assert.equal(c.parser.kind, 'edition');
    assert.equal(c.parser.file, `chapter-edition-${c.parser.stage}.${c.parser.format}`);
    assert.equal(c.section, 'documentIO');
    assert.ok(
      c.assertions.includes('Actual durable rich paragraphs, identities, Notes and Outline remain'),
    );
  }
});

test('edition dispatch rejects fixture, stage and format substitutions before accepting bytes', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { createHash } = await import('node:crypto');
  const { nativeContract, inspectNativeArtifacts } =
    await import('../../scripts/native-artifact-contracts.mjs');
  const root = await mkdtemp(path.join(tmpdir(), 'leafloom-edition-dispatch-'));
  const base = path.join(root, '.leafloom/evidence/edition');
  await mkdir(base, { recursive: true });
  try {
    const contract = nativeContract('document:chapter-edition:before:md');
    assert.ok(contract);
    const bytes = Buffer.from('actual bytes');
    await writeFile(path.join(base, contract.parser.file), bytes);
    for (const override of [{ fixture: 'unknown' }, { stage: 'after' }, { format: 'html' }]) {
      const row = {
        id: contract.id,
        title: contract.title,
        artifact: {
          fixture: 'chapter-roles',
          stage: 'before',
          format: 'md',
          sha256: createHash('sha256').update(bytes).digest('hex'),
          ...override,
        },
      };
      await assert.rejects(
        () =>
          inspectNativeArtifacts(
            contract,
            { documentIO: { artifacts: base, evidence: [row] } },
            { root },
          ),
        /differs/,
      );
    }
    const row = {
      id: contract.id,
      title: contract.title,
      artifact: { sha256: createHash('sha256').update(bytes).digest('hex') },
    };
    await assert.rejects(
      () =>
        inspectNativeArtifacts(
          contract,
          { documentIO: { artifacts: base, evidence: [row] } },
          { root },
        ),
      /fixture differs/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Generated Part shells have no authored hard break. Existing rich fixture bytes remain exact.
test('generated empty Part rejects hard breaks, filler elements and erased authored scaffolds', () => {
  const files = snapshot('after');
  for (const html of ['<p><br></p>', '<p><span></span></p>', '<p> </p>', '<p><i></i></p>']) {
    const changed = { ...files };
    const book = JSON.parse(changed['manuscript.json'].toString());
    book.chapters[5].html = html;
    changed['manuscript.json'] = Buffer.from(JSON.stringify(book));
    assert.throws(() => inspectChapterEditionSnapshot(changed, 'after', 'edition-fixture'));
  }
  const changed = { ...files };
  const book = JSON.parse(changed['manuscript.json'].toString());
  book.chapters.find((c: { id: string }) => c.id === 'ch-3').html = '<p></p>';
  changed['manuscript.json'] = Buffer.from(JSON.stringify(book));
  assert.throws(() => inspectChapterEditionSnapshot(changed, 'after', 'edition-fixture'));
});
