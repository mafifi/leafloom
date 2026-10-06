/** Platform font choices follow the source's installed/bundled face lists. */
export type FontPlatform = 'macos' | 'windows' | 'linux';
export type FontChoicesValue = {
  body: readonly string[];
  bodyStacks: Readonly<Record<string, string>>;
  dropcaps: Readonly<Record<string, string>>;
  defaultBody: string;
};
const reading = {
  Libron: '"Libron", Georgia, serif',
  Readerly: '"Readerly", Georgia, serif',
  Newsreader: '"Newsreader", Georgia, serif',
};
const common = {
  ...reading,
  Georgia: 'Georgia, "Times New Roman", serif',
  Palatino: '"Palatino", "Palatino Linotype", serif',
  Baskerville: 'Baskerville, "Baskerville Old Face", Georgia, serif',
  'Hoefler Text': '"Hoefler Text", Georgia, serif',
  'Iowan Old Style': '"Iowan Old Style", Georgia, serif',
  Cambria: 'Cambria, Georgia, serif',
  Constantia: 'Constantia, Georgia, serif',
  'iA Writer Quattro': '"iA Writer Quattro", "Helvetica Neue", Arial, sans-serif',
  Jost: '"Jost", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
};
const linux = {
  Gelasio: '"Gelasio", Georgia, "Times New Roman", serif',
  'TeX Gyre Pagella': '"TeX Gyre Pagella", Palatino, "Palatino Linotype", serif',
  'Libre Baskerville': '"Libre Baskerville", Baskerville, Georgia, serif',
  Alegreya: '"Alegreya", "Hoefler Text", Georgia, serif',
  'Source Serif Pro': '"Source Serif Pro", "Iowan Old Style", Georgia, serif',
  Jost: common.Jost,
  'iA Writer Quattro': common['iA Writer Quattro'],
};
export function fontChoices(platform: FontPlatform): FontChoicesValue {
  const body =
    platform === 'linux'
      ? Object.keys(linux)
      : platform === 'macos'
        ? ['Georgia', 'Palatino', 'Baskerville', 'Hoefler Text', 'Iowan Old Style', 'Jost', 'iA Writer Quattro']
        : ['Georgia', 'Palatino', 'Baskerville', 'Cambria', 'Constantia', 'Jost', 'iA Writer Quattro'];
  return {
    body: [...body, ...Object.keys(reading)],
    defaultBody: platform === 'linux' ? 'Gelasio' : 'Georgia',
    bodyStacks:
      platform === 'linux'
        ? {
            ...linux,
            ...reading,
            Georgia: linux.Gelasio,
            Palatino: linux['TeX Gyre Pagella'],
            Baskerville: linux['Libre Baskerville'],
            'Hoefler Text': linux.Alegreya,
            'Iowan Old Style': linux['Source Serif Pro'],
            Cambria: linux['Source Serif Pro'],
            Constantia: linux['Libre Baskerville'],
          }
        : common,
    dropcaps:
      platform === 'linux'
        ? {
            literary: '"Libre Bodoni", "Didot", "Bodoni 72", Georgia, serif',
            fantasy: '"TeX Gyre Chorus", "Apple Chancery", "Snell Roundhand", cursive',
            scifi: '"Jost", Futura, "Avenir Next", "Helvetica Neue", sans-serif',
            none: 'Georgia, serif',
          }
        : {
            literary: '"Didot", "Bodoni 72", Georgia, serif',
            fantasy: '"Apple Chancery", "Snell Roundhand", cursive',
            scifi: 'Futura, "Avenir Next", "Helvetica Neue", sans-serif',
            none: 'Georgia, serif',
          },
  };
}
