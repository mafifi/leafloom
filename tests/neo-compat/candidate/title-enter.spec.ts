import { test, expect } from './author-fixture';
import { existingBook } from './book-fixture';
import { persistedBook } from './storage-probe';

for (const field of ['title', 'subtitle'] as const) {
  for (const hasStory of [true, false]) {
    test(`[NEO-049-A] Leafloom: ${field} Enter ${hasStory ? 'skips front matter to existing first story end' : 'creates first story before back matter'} without changing publication prose`, async ({
      page,
    }) => {
      const chapters = hasStory
        ? [
            '<p><b>Rights.</b></p>',
            '<p><i>For friends.</i></p>',
            '<p><i>Movement One.</i></p>',
            '<p>First story.</p>',
            '<p>About writer.</p>',
          ]
        : ['<p><b>Rights.</b></p>', '<p><i>For friends.</i></p>', '<p><i>Movement One.</i></p>', '<p>About writer.</p>'];
      const kinds = hasStory
        ? { 'ch-1': 'copyright', 'ch-2': 'dedication', 'ch-3': 'part', 'ch-4': 'prologue', 'ch-5': 'about' }
        : { 'ch-1': 'copyright', 'ch-2': 'dedication', 'ch-3': 'part', 'ch-4': 'about' };
      const c = await existingBook(page, {
        chapters,
        metadata: { subtitle: 'A subtitle', chapterKinds: kinds },
      });
      await c.driver.expectParagraphs(
        hasStory
          ? [['Rights.'], ['For friends.'], ['Movement One.'], ['First story.'], ['About writer.']]
          : [['Rights.'], ['For friends.'], ['Movement One.'], ['About writer.']],
      );
      const target = page.locator(field === 'title' ? '#tp-title' : '#tp-subtitle');
      await target.click();
      await target.press('Enter');
      await c.driver.expectParagraphs(
        hasStory
          ? [['Rights.'], ['For friends.'], ['Movement One.'], ['First story.'], ['About writer.']]
          : [['Rights.'], ['For friends.'], ['Movement One.'], [''], ['About writer.']],
      );
      await expect
        .poll(() => c.driver.caret())
        .toMatchObject({ chapter: 3, paragraph: 0, offset: hasStory ? 12 : 0, collapsed: true });
      await expect(page.locator('#tp-title')).toHaveText(c.title);
      await expect(page.locator('#tp-subtitle')).toHaveText('A subtitle');
      await c.driver.shelf();
      const saved = await persistedBook(page, c.title, c.id);
      expect(saved.metadata.subtitle).toBe('A subtitle');
      expect(saved.chapters.map((chapter: { id: string }) => chapter.id).slice(0, 3)).toEqual([
        'ch-1',
        'ch-2',
        'ch-3',
      ]);
      expect(saved.chapters.at(-1).id).toBe(hasStory ? 'ch-5' : 'ch-4');
      expect(saved.chapters).toHaveLength(5);
      expect(saved.chapters[0].html).toMatch(/<(?:b|strong)>Rights\.<\/(?:b|strong)>/);
      expect(saved.chapters[1].html).toMatch(/<(?:i|em)>For friends\.<\/(?:i|em)>/);
      expect(saved.chapters.at(-1).html).toContain('About writer.');
      expect(saved.chapters[2].html).toMatch(/<(?:i|em)>Movement One\.<\/(?:i|em)>/);
      expect(saved.metadata.chapterKinds['ch-3']).toBe('part');
      if (hasStory) {
        expect(saved.chapters[3].id).toBe('ch-4');
        expect(saved.metadata.chapterKinds['ch-4']).toBe('prologue');
      } else {
        expect(saved.chapters[3].id).not.toBe('ch-4');
        expect(saved.metadata.chapterKinds[saved.chapters[3].id] ?? 'chapter').toBe('chapter');
      }
      await c.driver.selectBook(c.title);
      await c.driver.expectParagraphs(
        hasStory
          ? [['Rights.'], ['For friends.'], ['Movement One.'], ['First story.'], ['About writer.']]
          : [['Rights.'], ['For friends.'], ['Movement One.'], [''], ['About writer.']],
      );
    });
  }
}
