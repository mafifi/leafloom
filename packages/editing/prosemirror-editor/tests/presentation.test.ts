import { expect, it } from 'vitest';
import { focusSentence, ManuscriptPresentation, typewriterRoom } from '../src/presentation';
it('sentence focus spans mark boundaries and excludes trailing whitespace', () => {
  expect(focusSentence('First sentence. Second sentence! ', 4)).toEqual({ from: 0, to: 15 });
  expect(focusSentence('First sentence. Second sentence! ', 16)).toEqual({ from: 16, to: 32 });
  expect(focusSentence('First sentence. Second sentence! ', 33)).toEqual({ from: 16, to: 32 });
  expect(focusSentence('   ', 0)).toBeNull();
});
it('typewriter follows keyboard caret motion and yields to pointer motion', () => {
  const presentation = new ManuscriptPresentation();
  presentation.configure({ typewriter: true });
  expect(presentation.typewriter).toBe(false);
  presentation.keyboard = true;
  expect(presentation.typewriter).toBe(true);
  presentation.keyboard = false;
  expect(presentation.typewriter).toBe(false);
  presentation.configure({ typewriter: false });
  presentation.keyboard = true;
  expect(presentation.typewriter).toBe(false);
});

it('last-page writing room credits existing blank paper instead of adding a fixed viewport gap', () => {
  expect(typewriterRoom(800, 720, 0, 30)).toBe(390);
  expect(typewriterRoom(800, 720, 500, 30)).toBe(120);
  expect(typewriterRoom(800, 720, 100.4, 30)).toBe(290);
});

it('source drop cap steps aside in the first prose paragraph even when focus highlighting is off or unavailable', async () => {
  const { JSDOM } = await import('jsdom');
  const document = new JSDOM(
    '<div class="chapter-body"><div class="ProseMirror"><p class="poetry">Verse</p><p>Alpha</p><p>Beta</p></div></div><div class="chapter-body"><p>Later</p></div>',
  ).window.document;
  const presentation = new ManuscriptPresentation();
  const bodies = document.querySelectorAll('.chapter-body');
  const paragraphs = document.querySelectorAll('p');
  const select = (paragraph: Element) => {
    const range = document.createRange();
    range.setStart(paragraph.firstChild!, 1);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    presentation.paintDropcap(document);
  };
  select(paragraphs[1]);
  expect(bodies[0].classList.contains('cap-off')).toBe(true);
  select(paragraphs[2]);
  expect(bodies[0].classList.contains('cap-off')).toBe(false);
  select(paragraphs[0]);
  expect(bodies[0].classList.contains('cap-off')).toBe(false);
  select(paragraphs[3]);
  expect(bodies[1].classList.contains('cap-off')).toBe(true);
  expect(bodies[0].classList.contains('cap-off')).toBe(false);
  presentation.clear(document);
  expect(bodies[1].classList.contains('cap-off')).toBe(false);
});
