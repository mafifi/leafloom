import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, ''),
  require = createRequire(join(root, 'package.json')),
  { chromium } = require('@playwright/test');
const { LibraryHost } = await import(
    pathToFileURL(join(root, 'apps/desktop/host/library.ts')).href
  ),
  { renderManuscript } = await import(
    pathToFileURL(join(root, 'apps/desktop/host/manuscript-export.ts')).href
  );
const fixture = await mkdtemp(join(tmpdir(), 'leafloom-print-font-csp-')),
  host = new LibraryHost(fixture);
await writeFile(join(fixture, '.leafloom-fixture'), '');
await host.initialize();
let browser;
try {
  const meta = await host.request('createBook', {
      title: 'Print typography fixture',
      author: 'Fixture',
    }),
    opened = await host.request('openBook', { bookId: meta.id });
  opened.book.chapters = [
    { id: 'section-one', html: '<p>Print typography with selected body fonts.</p>' },
  ];
  const html = (
    await renderManuscript(opened, 'html', { bodyFont: 'Alegreya', dropcap: 'none' })
  ).toString('utf8');
  const config = JSON.parse(
      await readFile(join(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'),
    ),
    fixed = config.app.security.csp,
    previous = fixed.replace("font-src 'self' data:; ", '');
  browser = await chromium.launch({ headless: true });
  const proofs = [];
  for (const [state, csp] of [
    ['before', previous],
    ['after', fixed],
  ]) {
    const page = await browser.newPage();
    const document = html.replace(
      '<head>',
      '<head><meta http-equiv="Content-Security-Policy" content="' +
        csp.replaceAll('"', '&quot;') +
        '">',
    );
    const file = join(fixture, state + '.html');
    await writeFile(file, document, { flag: 'wx', mode: 0o600 });
    await page.goto(pathToFileURL(file).href);
    const font = await page.evaluate(async () => {
      try {
        const faces = await document.fonts.load('13px "Alegreya"', 'Print typography');
        return {
          loaded: faces.length > 0 && faces.every((face) => face.status === 'loaded'),
          faces: faces.map((face) => ({ family: face.family, status: face.status })),
        };
      } catch (error) {
        return { loaded: false, error: error.name };
      }
    });
    proofs.push({ state, csp, font });
    await page.close();
  }
  if (proofs[0].font.loaded || !proofs[1].font.loaded)
    throw Error('Expected blocked-before and loaded-after actual bundled font');
  const paragraph = 'A private manuscript keeps every word. 作者 café 🖋 '.repeat(12);
  const paragraphs = Array.from({ length: 4000 }, () => paragraph);
  paragraphs[3999] += ' LARGE_MANUSCRIPT_END';
  const largeText = paragraphs.join('');
  const privatePolicy =
    "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; frame-src 'none'; base-uri 'none'; form-action 'none'";
  const largeDocument = html
    .replace(
      '<head>',
      '<head><meta http-equiv="Content-Security-Policy" content="' + privatePolicy + '">',
    )
    .replace('</body>', '<section id="large-manuscript">' + paragraphs.map(text => '<p>' + text + '</p>').join('') + '</section></body>');
  const largeFile = join(fixture, 'large-manuscript.html');
  await writeFile(largeFile, largeDocument, { flag: 'wx', mode: 0o600 });
  const largePage = await browser.newPage();
  await largePage.goto(pathToFileURL(largeFile).href);
  const loadedLarge = await largePage.evaluate(async () => {
    void document.body.offsetHeight;
    await document.fonts.ready;
    return {
      ending: document
        .getElementById('large-manuscript')
        .textContent.endsWith(' LARGE_MANUSCRIPT_END'),
      characters: document.getElementById('large-manuscript').textContent.length,
      fontLoaded: [...document.fonts].some(
        (face) => face.family === 'Alegreya' && face.status === 'loaded',
      ),
    };
  });
  await largePage.close();
  if (!loadedLarge.ending || loadedLarge.characters !== largeText.length || !loadedLarge.fontLoaded)
    throw Error('Large private print document failed');
  const largePrint = {
    bytes: Buffer.byteLength(largeDocument),
    ...loadedLarge,
    policy: privatePolicy,
  };
  const result = {
    passed: true,
    largePrint,
    engine: 'headless Chromium with private file documents',
    foreground: false,
    printSheet: false,
    scriptSha256: createHash('sha256')
      .update(await readFile(fileURLToPath(import.meta.url)))
      .digest('hex'),
    hostHtmlSha256: createHash('sha256').update(html).digest('hex'),
    font: 'Alegreya',
    proofs,
    nativeCspInjectionSource: 'tauri2.11.5 src/manager/webview.rs data-URL CSP injection',
  };
  if (process.argv[2])
    await writeFile(process.argv[2], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await host.shutdown();
  await rm(fixture, { recursive: true, force: true });
}
