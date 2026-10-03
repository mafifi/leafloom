import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { sha256 } from './document-io.mjs';

export const chapterEditionFixture = {
  chapters: [
    '<p>Copyright rights.</p>',
    '<p>For our readers.</p>',
    '<p><br></p>',
    '<p>Movement One</p><p>First part quotation.</p>',
    '<p>Alpha <b>bold</b> and <i>italic</i> café.</p><p class="scene-break">***</p><p class="poetry"><i>Verse line.</i></p><p class="ghost">SECRET_GHOST</p>',
    '<p>Movement Two</p><p>Second part quotation.</p>',
    '<p><b>Closing story.</b></p>',
    '<p><i>Interlude prose.</i></p>',
    '<p>Unnamed prose.</p>',
    '<p>Author biography.</p>',
  ],
  metadata: {
    title: 'A [Book] *Beyond*',
    subtitle: 'A [Small] *Edition*',
    author: 'Élodie Writer',
    chapterKinds: {
      'ch-1': 'copyright',
      'ch-2': 'dedication',
      'ch-3': 'contents',
      'ch-4': 'part',
      'ch-6': 'part',
      'ch-8': 'unnumbered',
      'ch-9': 'unnumbered',
      'ch-10': 'about',
    },
    chapterTitles: { 'ch-5': 'Opening', 'ch-7': 'Closing', 'ch-8': 'Interlude', 'ch-9': '' },
  },
  notes: '<p>Private <b>Notes</b>.</p>',
  library: { hintShown: true, fonts: { body: 'Georgia', dropcap: 'none' } },
};
export const chapterEditionStages = {
  before: {
    headings: [
      'Part I: Movement One',
      'Chapter 1 — Opening',
      'Part II: Movement Two',
      'Chapter 1 — Closing',
      'Interlude',
      'About the Author',
    ],
    toc: [
      'Part I: Movement One',
      'Chapter 1 — Opening',
      'Part II: Movement Two',
      'Chapter 1 — Closing',
      'Interlude',
      chapterEditionFixture.metadata.title,
      'About the Author',
    ],
    prose: [
      'Copyright rights.',
      'For our readers.',
      'First part quotation.',
      'Edited Alpha',
      'Verse line.',
      'Second part quotation.',
      'Closing story.',
      'Interlude prose.',
      'Unnamed prose.',
      'Author biography.',
    ],
  },
  after: {
    headings: [
      'Part I: Movement Two',
      'Chapter 1 — Opening',
      'Part II',
      'Chapter 1 — Closing',
      'Interlude',
      'About the Author',
    ],
    toc: [
      'Part I: Movement Two',
      'Chapter 1 — Opening',
      'Part II',
      'Chapter 1 — Closing',
      'Interlude',
      chapterEditionFixture.metadata.title,
      'About the Author',
    ],
    prose: [
      'Copyright rights.',
      'For our readers.',
      'Second part quotation.',
      'Edited Alpha',
      'Verse line.',
      'Closing story.',
      'Interlude prose.',
      'Unnamed prose.',
      'Author biography.',
    ],
  },
};
const text = (value) => value.replace(/\s+/g, ' ').trim();
function heading(element) {
  const part = element.querySelector('.pl,.part-label');
  const title = element.querySelector('.pt,.part-title');
  return part
    ? text(part.textContent) + (title ? ': ' + text(title.textContent) : '')
    : text(element.textContent);
}

/** Parse retained output bytes independently from the serializer and receipt. */
export function inspectChapterEdition(format, bytes, stage) {
  const expected = chapterEditionStages[stage];
  assert.ok(expected, 'Known author-edition stage');
  assert.ok(bytes.length > 100, 'Actual exported edition bytes');
  let body, headings, toc;
  if (format === 'html') {
    const document = new JSDOM(bytes.toString('utf8')).window.document;
    assert.equal(document.title, chapterEditionFixture.metadata.title);
    assert.equal(document.querySelectorAll('script').length, 0);
    const contents = document.querySelector('.contents');
    assert.ok(contents, 'Actual printed Contents');
    toc = [...contents.querySelectorAll('a')].map((link) => {
      const destination = link.getAttribute('href');
      assert.ok(destination?.startsWith('#'), 'Contents internal destination');
      const target = document.getElementById(destination.slice(1));
      assert.ok(
        target && !contents.contains(target),
        'Contents points at an actual exported section',
      );
      return text((link.querySelector('.toc-t') ?? link).textContent);
    });
    assert.deepEqual(
      toc,
      expected.toc,
      'Source Contents includes named and blank unnumbered stories',
    );
    const sections = [...document.body.querySelectorAll(':scope > section')].filter(
      (section) => !section.matches('.title-page,.titlepage,.cover-page,.coverpage,.contents'),
    );
    headings = sections.flatMap((section) => {
      const element = section.querySelector(':scope > h1,:scope > h2,:scope > h3');
      return element ? [heading(element)] : [];
    });
    const named = sections.find((section) => section.textContent.includes('Interlude prose.'));
    const unnamed = sections.find((section) => section.textContent.includes('Unnamed prose.'));
    assert.ok(named && unnamed, 'Both actual unnumbered body sections');
    assert.deepEqual(
      [...named.querySelectorAll(':scope > h1,:scope > h2,:scope > h3')].map(heading),
      ['Interlude'],
    );
    assert.equal(
      unnamed.querySelectorAll(':scope > h1,:scope > h2,:scope > h3').length,
      0,
      'Blank unnumbered exports no fallback heading',
    );
    assert.equal(text(document.querySelector('.poetry')?.textContent ?? ''), 'Verse line.');
    assert.ok(
      [...document.querySelectorAll('b,strong')].some((element) => element.textContent === 'bold'),
    );
    assert.ok(
      [...document.querySelectorAll('i,em')].some((element) => element.textContent === 'italic'),
    );
    body = sections.map((section) => section.textContent).join('\n');
  } else {
    assert.equal(format, 'md');
    const markdown = bytes.toString('utf8');
    assert.ok(markdown.includes('# A \\[Book\\] \\*Beyond\\*'));
    assert.ok(markdown.includes('*A \\[Small\\] \\*Edition\\**'));
    assert.ok(markdown.includes('**by Élodie Writer**'));
    headings = markdown
      .split(/\r?\n/)
      .filter((line) => /^## /.test(line))
      .map((line) => line.slice(3));
    assert.ok(!headings.includes('Contents'), 'Source Markdown edition omits the printed Contents');
    assert.ok(!headings.includes('Untitled'), 'No invented blank unnumbered heading');
    assert.ok(markdown.includes('**bold**') && markdown.includes('*italic*'));
    assert.ok(markdown.includes('> *Verse line.*'));
    assert.ok(/^\*\*\*$/m.test(markdown), 'Actual scene delimiter');
    body = markdown;
  }
  assert.deepEqual(
    headings,
    expected.headings,
    'Each Part/story heading occurs once in actual edition order',
  );
  assert.ok(!body.includes('SECRET_GHOST'), 'Ghost omitted from author export');
  let prior = -1;
  for (const phrase of expected.prose) {
    const current = body.indexOf(phrase);
    assert.ok(current > prior, 'Front/story/back actual output order: ' + phrase);
    prior = current;
  }
  if (stage === 'after') assert.ok(!body.includes('Movement One'), 'Deleted Part is not exported');
  return {
    fixture: 'chapter-roles',
    format,
    stage,
    sha256: sha256(bytes),
    bytes: bytes.length,
    headings,
    ...(toc ? { toc } : {}),
  };
}
