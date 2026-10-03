import { expect, it } from 'vitest';
import { fontChoices } from '../../apps/desktop/src/lib/font-choices';
it('offers the source operating-system lists and additional bundled reading families and resolves old Linux aliases without offering them', () => {
  expect(fontChoices('macos').body).toEqual([
    'Georgia',
    'Palatino',
    'Baskerville',
    'Hoefler Text',
    'Iowan Old Style',
    'Jost',
    'Libron',
    'Readerly',
    'Newsreader',
  ]);
  expect(fontChoices('windows').body).toEqual([
    'Georgia',
    'Palatino',
    'Baskerville',
    'Cambria',
    'Constantia',
    'Jost',
    'Libron',
    'Readerly',
    'Newsreader',
  ]);
  const linux = fontChoices('linux');
  expect(linux.body).toEqual([
    'Gelasio',
    'TeX Gyre Pagella',
    'Libre Baskerville',
    'Alegreya',
    'Source Serif Pro',
    'Jost',
    'Libron',
    'Readerly',
    'Newsreader',
  ]);
  expect(linux.defaultBody).toBe('Gelasio');
  expect(linux.body).not.toContain('Georgia');
  expect(linux.bodyStacks.Georgia).toBe(linux.bodyStacks.Gelasio);
  expect(linux.dropcaps.literary).toContain('Libre Bodoni');
  expect(linux.dropcaps.fantasy).toContain('TeX Gyre Chorus');
  expect(linux.dropcaps.scifi).toContain('Jost');
});
