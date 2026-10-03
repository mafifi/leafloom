import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyCandidateEvidence } from '../../scripts/check-neo-parity.mjs';

const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const fp = 'a'.repeat(64);
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'leafloom-native-dispatch-'));
  const files = [
    'scripts/verify-macos-native.mjs',
    'binary',
    'host/main.mjs',
    'host/node',
    'apps/desktop/dist/assets/app.js',
    'apps/desktop/dist/assets/app.css',
    'tests/neo-compat/native/document-io.mjs',
    'tests/neo-compat/shared/document-io.mjs',
    'tests/neo-compat/native/io-cover-edge.mjs',
    'tests/neo-compat/shared/io-cover-edge.mjs',
    'tests/neo-compat/shared/pdf-layout.mjs',
  ];
  const hashes: Record<string, string> = {};
  for (const file of files) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), file);
    hashes[file] = hash(file);
  }
  const book = JSON.parse(
    await readFile('tests/neo-compat/native/acceptance-contracts.json', 'utf8'),
  );
  const contract = book.contracts.find(
    (c: { contractId: string }) => c.contractId === 'document:export:txt',
  );
  const entry = {
    evidenceKind: 'native-v1',
    driver: 'tauri-native-hidden',
    contractId: contract.contractId,
    section: contract.section,
    id: contract.id,
    title: contract.title,
    driverActions: contract.driverActions,
    assertions: contract.assertions,
    requiredCapabilities: ['native-files', 'native-export'],
  };
  const text =
    'An Output & Beyond Élodie Writer Opening Edited Alpha bold italic café 東京. Verse line. Closing Second chapter.';
  const artifacts = path.join(root, '.leafloom/evidence/native-test');
  await mkdir(artifacts, { recursive: true });
  await writeFile(path.join(artifacts, 'author-export.txt'), text);
  const receipt = {
    evidenceSchema: 'leafloom/native-v1',
    appImplementation: 'leafloom-production',
    referenceCommit: 'ed090e9988d446daf1ebbde91bcebc13b599909b',
    driver: 'tauri-native-hidden',
    hiddenWindow: true,
    fixtureKind: 'marked private fixture',
    status: 'passed',
    buildSha256: fp,
    buildSha256Before: fp,
    buildSha256After: fp,
    binary: path.join(root, 'binary'),
    artifactBinding: {
      driverSha256: hashes[files[0]],
      binarySha256: hashes.binary,
      runtimeEntry: path.join(root, 'host/main.mjs'),
      runtimeExecutable: path.join(root, 'host/node'),
      hostMainSha256: hashes['host/main.mjs'],
      nodeSha256: hashes['host/node'],
      webAssets: [
        { path: '/assets/app.js', sha256: hashes['apps/desktop/dist/assets/app.js'] },
        { path: '/assets/app.css', sha256: hashes['apps/desktop/dist/assets/app.css'] },
      ],
    },
    documentIO: {
      driver: 'tauri-native-hidden',
      pickerQualification: 'debug; physical picker unproved',
      artifacts,
      callbackSha256: hashes[files[6]],
      sharedSha256: hashes[files[7]],
      edgeModuleHashes: Object.fromEntries(
        files.slice(8).map((f) => [f.replace('tests/neo-compat/', ''), hashes[f]]),
      ),
      evidence: [
        {
          id: contract.id,
          title: contract.title,
          driverActions: contract.driverActions,
          assertions: contract.assertions,
          artifact: { sha256: hash(text) },
        },
      ],
    },
  };
  return {
    root,
    entry,
    receipt,
    text,
    artifacts,
    options: { root, buildSha256: fp, scenarioId: contract.id, environment: 'electron-files' },
  };
}

test('native-v1 dispatch parses retained bytes and never invents Playwright outcomes', async () => {
  const f = await fixture();
  try {
    const result = await verifyCandidateEvidence(f.receipt, f.entry, f.options);
    assert.equal(result.passed, true, JSON.stringify(result));
    assert.equal(result.kind, 'native-v1');
    assert.ok(result.parsed);
    assert.equal((await verifyCandidateEvidence({ suites: [] }, f.entry, f.options)).passed, false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test('native dispatch rejects semantic corruption even when its receipt hash is updated', async () => {
  const f = await fixture();
  try {
    await writeFile(
      path.join(f.artifacts, 'author-export.txt'),
      'Completely different manuscript with no expected Unicode prose.',
    );
    f.receipt.documentIO.evidence[0].artifact.sha256 = hash(
      'Completely different manuscript with no expected Unicode prose.',
    );
    assert.equal((await verifyCandidateEvidence(f.receipt, f.entry, f.options)).passed, false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test('native dispatch rejects unsafe artifacts, unexecuted rows, wrong contracts and insufficient capabilities', async () => {
  const f = await fixture();
  try {
    for (const entry of [
      { ...f.entry, contractId: 'unreviewed' },
      { ...f.entry, section: 'collectionIO' },
      { ...f.entry, requiredCapabilities: ['physical-picker'] },
      { ...f.entry, requiredCapabilities: [] },
      { ...f.entry, requiredCapabilities: ['native-files'] },
      { ...f.entry, driver: 'browser' },
    ])
      assert.equal((await verifyCandidateEvidence(f.receipt, entry, f.options)).passed, false);
    for (const options of [
      { ...f.options, environment: 'Real native foreground physical keyboard' },
      { ...f.options, scenarioId: 'NEO-001-A' },
    ])
      assert.equal((await verifyCandidateEvidence(f.receipt, f.entry, options)).passed, false);
    assert.equal(
      (await verifyCandidateEvidence({ ...f.receipt, status: 'failed' }, f.entry, f.options))
        .passed,
      false,
    );
    assert.equal(
      (
        await verifyCandidateEvidence(
          { ...f.receipt, buildSha256After: 'b'.repeat(64) },
          f.entry,
          f.options,
        )
      ).passed,
      false,
    );
    assert.equal(
      (
        await verifyCandidateEvidence(
          {
            ...f.receipt,
            documentIO: {
              ...f.receipt.documentIO,
              evidence: [...f.receipt.documentIO.evidence, ...f.receipt.documentIO.evidence],
            },
          },
          f.entry,
          f.options,
        )
      ).passed,
      false,
    );
    assert.equal(
      (
        await verifyCandidateEvidence(
          {
            ...f.receipt,
            documentIO: { ...f.receipt.documentIO, unexecutedClauses: [f.entry.title] },
          },
          f.entry,
          f.options,
        )
      ).passed,
      false,
    );
    const outside = await mkdtemp(path.join(tmpdir(), 'leafloom-outside-'));
    try {
      await writeFile(path.join(outside, 'author-export.txt'), f.text);
      await rm(path.join(f.artifacts, 'author-export.txt'));
      await symlink(
        path.join(outside, 'author-export.txt'),
        path.join(f.artifacts, 'author-export.txt'),
      );
      assert.equal((await verifyCandidateEvidence(f.receipt, f.entry, f.options)).passed, false);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('native driver cannot masquerade as a browser case and failed finite rows stay failed', async () => {
  const f = await fixture();
  try {
    const browser = {
      config: {
        metadata: {
          evidenceSchema: 'leafloom/parity-v1',
          appImplementation: 'leafloom-production',
          referenceCommit: f.receipt.referenceCommit,
          buildSha256: fp,
          driver: 'browser',
        },
      },
      suites: [
        {
          specs: [
            {
              title: f.entry.title,
              tests: [{ expectedStatus: 'passed', results: [{ status: 'passed' }] }],
            },
          ],
        },
      ],
    };
    assert.equal(
      (await verifyCandidateEvidence(browser, { ...f.entry, evidenceKind: undefined }, f.options))
        .passed,
      false,
    );
    assert.equal(
      (
        await verifyCandidateEvidence(
          {
            ...f.receipt,
            documentIO: {
              ...f.receipt.documentIO,
              evidence: [{ ...f.receipt.documentIO.evidence[0], status: 'failed' }],
            },
          },
          f.entry,
          f.options,
        )
      ).passed,
      false,
    );
    assert.equal(
      (
        await verifyCandidateEvidence(
          { ...f.receipt, frontendErrors: ['uncaught fixture failure'] },
          f.entry,
          f.options,
        )
      ).passed,
      false,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('collection receipts use their own schema section and actual DOCX order parser', async () => {
  const f = await fixture();
  try {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const contract = JSON.parse(
      await readFile('tests/neo-compat/native/acceptance-contracts.json', 'utf8'),
    ).contracts.find((c: { contractId: string }) => c.contractId === 'collection:anthology:docx');
    const paragraphs = [
      'Collected é東京',
      'First opening.',
      'First ending.',
      'Second opening.',
      'Second ending.',
    ];
    const create = async (lines: string[]) => {
      zip.file(
        'word/document.xml',
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
          lines.map((p) => '<w:p><w:r><w:t>' + p + '</w:t></w:r></w:p>').join('') +
          '</w:body></w:document>',
      );
      return zip.generateAsync({ type: 'nodebuffer' });
    };
    const module = 'tests/neo-compat/native/collection-output.mjs';
    await mkdir(path.dirname(path.join(f.root, module)), { recursive: true });
    await writeFile(path.join(f.root, module), module);
    const bytes = await create(paragraphs);
    await writeFile(path.join(f.artifacts, 'anthology.docx'), bytes);
    const entry = {
      ...f.entry,
      contractId: contract.contractId,
      section: contract.section,
      id: contract.id,
      title: contract.title,
      driverActions: contract.driverActions,
      assertions: contract.assertions,
    };
    const receipt = {
      ...f.receipt,
      collectionIO: {
        driver: 'tauri-native-hidden',
        callbackSha256: hash(module),
        artifacts: f.artifacts,
        evidence: [
          { ...contract, artifactFile: 'anthology.docx', artifact: { sha256: hash(bytes) } },
        ],
      },
    };
    const options = { ...f.options, scenarioId: contract.id };
    assert.equal((await verifyCandidateEvidence(receipt, entry, options)).passed, true);
    const changed = await create([
      paragraphs[0],
      paragraphs[3],
      paragraphs[4],
      paragraphs[1],
      paragraphs[2],
    ]);
    await writeFile(path.join(f.artifacts, 'anthology.docx'), changed);
    receipt.collectionIO.evidence[0].artifact.sha256 = hash(changed);
    assert.equal((await verifyCandidateEvidence(receipt, entry, options)).passed, false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('unsupported import/menu rows are rejected instead of trusting callback self-claims', async () => {
  const f = await fixture();
  try {
    for (const contractId of ['document:import', 'document:cover-menu'])
      assert.equal(
        (await verifyCandidateEvidence(f.receipt, { ...f.entry, contractId }, f.options)).passed,
        false,
      );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('folder parser rejects lost review/title companions even with self-consistent updated hashes', async () => {
  const f = await fixture();
  try {
    const contract = JSON.parse(
      await readFile('tests/neo-compat/native/acceptance-contracts.json', 'utf8'),
    ).contracts.find((c: { contractId: string }) => c.contractId === 'folder:replacement');
    const module = 'tests/neo-compat/native/folder-replacement.mjs';
    await mkdir(path.dirname(path.join(f.root, module)), { recursive: true });
    await writeFile(path.join(f.root, module), module);
    const before = {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: {
        id: 'private-book',
        title: 'Private fixture',
        author: 'Writer',
        chapterTitles: { chapter: 'Opening' },
      },
      chapters: [{ id: 'chapter', html: '<p><b>Baseline.</b></p>' }],
      darlings: [],
    };
    const after = {
      ...before,
      revision: 1,
      chapters: [
        {
          id: 'chapter',
          html:
            before.chapters[0].html +
            '<p><b>Remote incoming. X</b></p><p><i>Later remote. Y</i></p>',
        },
      ],
    };
    const reviews = {
      formatVersion: 'neo-composed-reviews/v1',
      bookId: 'private-book',
      version: '00000000-0000-4000-8000-000000000000',
      references: [],
      items: [],
    };
    const maps: Record<string, Record<string, string>> = {};
    for (const [name, book] of [
      ['original-aside', before],
      ['incoming-final', after],
    ] as const) {
      const values = {
        'manuscript.json': JSON.stringify(book),
        'notes.html': '<p>Retained notes.</p>',
        'outline.html': '<p>Retained plan.</p>',
        'reviews.json': JSON.stringify(reviews),
      };
      maps[name] = {};
      await mkdir(path.join(f.artifacts, name), { recursive: true });
      for (const [file, bytes] of Object.entries(values)) {
        await writeFile(path.join(f.artifacts, name, file), bytes);
        maps[name][file] = hash(bytes);
      }
    }
    await writeFile(
      path.join(f.artifacts, 'protected-original-hashes.json'),
      JSON.stringify(maps['original-aside']),
    );
    await writeFile(path.join(f.artifacts, 'fixture-parser.mjs'), 'validated fixture parser');
    const receipt = {
      ...f.receipt,
      folderReplacement: {
        driver: 'tauri-native-hidden',
        artifacts: f.artifacts,
        callbackSha256: hash(module),
        fixtureParserSha256: hash('validated fixture parser'),
        protectedOriginalHashes: maps['original-aside'],
        finalFileHashes: maps['incoming-final'],
        evidence: [contract],
      },
    };
    const entry = {
      ...f.entry,
      contractId: contract.contractId,
      section: contract.section,
      id: contract.id,
      title: contract.title,
      driverActions: contract.driverActions,
      assertions: contract.assertions,
      requiredCapabilities: ['native-files', 'native-watcher'],
    };
    const options = { ...f.options, scenarioId: contract.id };
    const checked = await verifyCandidateEvidence(receipt, entry, options);
    assert.equal(checked.passed, true, JSON.stringify(checked));
    const changed = JSON.stringify({
      ...after,
      metadata: { ...after.metadata, title: 'Wrong title' },
    });
    await writeFile(path.join(f.artifacts, 'incoming-final/manuscript.json'), changed);
    receipt.folderReplacement.finalFileHashes['manuscript.json'] = hash(changed);
    assert.equal((await verifyCandidateEvidence(receipt, entry, options)).passed, false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
