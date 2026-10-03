import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
import { textTypography } from '../src/typography';
const document = new JSDOM('').window.document;
function open(language = 'en', html = '<p></p>') {
  const core = new BookCore(
    document,
    {
      formatVersion: 'neo-lifecycle/v1',
      revision: 0,
      metadata: { id: 'book', title: 'Title', author: 'Writer' },
      chapters: [{ id: 'a', html }],
      darlings: [],
    },
    null,
    '<p></p>',
    '<p></p>',
  );
  core.configureTypography({ language });
  core.select('a', 1);
  return core;
}
it.each([
  ['*word*', false, true, 'word'],
  ['**word**', true, false, 'word'],
  ['***word***', true, true, 'word'],
  ['_word_', false, true, 'word'],
  ['__word__', true, false, 'word'],
  ['2 * 3', false, false, '2 * 3'],
  ['snake_case', false, false, 'snake_case'],
] as const)('Markdown %s preserves NEO word boundaries', (text, bold, italic, result) => {
  const core = open();
  core.insert(text);
  expect(core.passageRows('a')[0].text).toBe(result);
  expect(core.html('a').includes('<b>')).toBe(bold);
  expect(core.html('a').includes('<i>')).toBe(italic);
});
it('Markdown immediate undo restores literal delimiters and caret', () => {
  const core = open();
  core.insert('*word*');
  core.undo();
  expect(core.passageRows('a')[0].text).toBe('*word*');
  expect(core.html('a')).not.toContain('<i>');
  expect(core.state.selection.$from.parentOffset).toBe(6);
});
it.each([
  ['fr', '«\u202fHello\u202f»'],
  ['de', '„Hello“'],
  ['es', '«Hello»'],
  ['ro', '„Hello”'],
  ['pt-BR', '“Hello”'],
  ['ru', '«Hello»'],
  ['nl', '“Hello”'],
  ['pt-PT', '«Hello»'],
  ['it', '«Hello»'],
  ['pl', '„Hello”'],
  ['el', '«Hello»'],
])('%s quote glyphs follow writing language', (language, result) => {
  const core = open(language);
  core.insert('"Hello"');
  expect(core.passageRows('a')[0].text).toBe(result);
});
it('English speech, apostrophe, dash, ellipsis and existing German guillemets retain context', () => {
  const core = open();
  core.insert('"Hello" "Wait--" Wait... \'Hello\' don\'t');
  expect(core.passageRows('a')[0].text).toBe('“Hello” “Wait—” Wait… ‘Hello’ don’t');
  const german = open('de', '<p>»Hallo« </p>');
  german.select('a', 9);
  german.insert('"Again"');
  expect(german.passageRows('a')[0].text).toBe('»Hallo« »Again«');
});
it.each([
  ['pt-BR', '- Olá', '— Olá'],
  ['ru', '- Hello', '— Hello'],
  ['es', '- Hola', '—Hola'],
  ['en', 'Alpha - beta', 'Alpha – beta'],
  ['en', 'guarda-chuva -5 pré- e pós-', 'guarda-chuva -5 pré- e pós-'],
])('%s dialogue typography preserves meaningful hyphens', (language, text, result) => {
  const core = open(language);
  core.insert(text);
  expect(core.passageRows('a')[0].text).toBe(result);
});
it('French spacing and Notes list syntax retain their scopes', () => {
  const core = open('fr');
  core.insert('Oui ; non : quoi ! pourquoi ?');
  expect(core.passageRows('a')[0].text).toBe('Oui\u202f; non\u202f: quoi\u202f! pourquoi\u202f?');
  core.configureTypography({ language: 'es' });
  core.select('notes', 1);
  core.insert('- Lista');
  expect(core.passageRows('notes')[0].text).toBe('- Lista');
});
it('dialogue immediate undo restores typed hyphen', () => {
  const core = open('es');
  core.insert('-H');
  expect(core.passageRows('a')[0].text).toBe('—H');
  core.undo();
  expect(core.passageRows('a')[0].text).toBe('-H');
  expect(core.state.selection.$from.parentOffset).toBe(2);
});
it('typing after scene starts a separate history group', () => {
  const core = open();
  core.insert('Alpha.');
  core.enter();
  core.enter();
  core.insert('X');
  core.undo();
  expect(core.passageRows('a').map((p) => p.text)).toEqual(['Alpha.', '***', '']);
});
it.each([
  ['**a *b* c**', '<p><b>a <i>b</i> c</b></p>'],
  ['*a **b** c*', '<p><i>a </i><b><i>b</i></b><i> c</i></p>'],
  ['f***', '<p>f***</p>'],
  ['* padded *', '<p>* padded *</p>'],
])('nested or literal typed Markdown %s matches source emphasis', (text, html) => {
  const core = open();
  core.insert(text);
  expect(core.html('a')).toBe(html);
});
it('literal input-method commit bypasses smart quotes, Markdown and dialogue without losing marks', () => {
  const core = open('en', '<p><i>Alpha</i></p>');
  core.select('a', 6);
  core.insert("' -- **文**", { typography: false });
  expect(core.html('a')).toBe("<p><i>Alpha' -- **文**</i></p>");
  core.undo();
  expect(core.html('a')).toBe('<p><i>Alpha</i></p>');
  core.redo();
  expect(core.passageRows('a')[0].text).toBe("Alpha' -- **文**");
});

it.each([
  ['en', 'Word-', '-', 'Word—'],
  ['en', 'Wait..', '.', 'Wait…'],
  ['en', '', '"', '“'],
  ['en', 'Hello', '"', 'Hello”'],
  ['en', '(', '"', '(“'],
  ['en', '“Interrupted—', '"', '“Interrupted—”'],
  ['en', 'Introduction—', '"', 'Introduction—“'],
  ['en', 'writer', "'", 'writer’'],
  ['nl', '', "'", '‘'],
  ['pt', '', "'", '‘'],
  ['fr', '', "'", '’'],
  ['fr', 'Bonjour ', '!', 'Bonjour\u202f!'],
  ['fr', 'Bonjour\u00a0', ':', 'Bonjour\u202f:'],
  ['de', '»Earlier« ', '"', '»Earlier« »'],
  ['de', '«Earlier» ', '"', '«Earlier» «'],
  ['pt-PT', '', '"', '«'],
] as const)(
  'shared typography query equals the existing manuscript %s insertion at %s',
  (language, prefix, character, expected) => {
    const core = open(language, '<p>' + prefix + '</p>');
    core.select('a', prefix.length + 1);
    const queried = textTypography.query({
      character,
      language,
      interfaceLanguage: 'en',
      collapsed: true,
      previousTextNodePrefix: prefix,
      paragraphPrefix: prefix,
      chapterText: prefix,
      bookText: prefix,
    });
    expect(queried).not.toBeNull();
    if (!queried) throw Error('Missing characterized typography replacement');
    expect(prefix.slice(0, prefix.length - queried.replaceBefore) + queried.text).toBe(expected);
    core.insert(character);
    expect(core.passageRows('a')[0].text).toBe(expected);
    core.undo();
    expect(core.passageRows('a')[0].text).toBe(prefix);
  },
);

it('manuscript French punctuation follows the Quebec interface independently of its dictionary language', () => {
  const canadianInterface = open('fr');
  canadianInterface.configureTypography({ language: 'fr', interfaceLanguage: 'fr-CA' });
  canadianInterface.insert('Oui ; non : quoi ! pourquoi ?');
  expect(canadianInterface.passageRows('a')[0].text).toBe('Oui ; non\u202f: quoi ! pourquoi ?');
  const canadianDictionary = open('fr-CA');
  canadianDictionary.configureTypography({ language: 'fr-CA', interfaceLanguage: 'en' });
  canadianDictionary.insert('Oui ; non : quoi ! pourquoi ?');
  expect(canadianDictionary.passageRows('a')[0].text).toBe(
    'Oui\u202f; non\u202f: quoi\u202f! pourquoi\u202f?',
  );
});

it('French NBSP replacement adopts the left rich-run marks after deletion and preserves explicit plain formatting', () => {
  const core = open('fr', '<p><i>Oui</i>\u00a0</p>');
  core.select('a', 5);
  core.insert(';');
  expect(core.html('a')).toBe('<p><i>Oui\u202f;</i></p>');
  core.undo();
  expect(core.passageRows('a')[0].text).toBe('Oui\u00a0');
  expect(core.html('a')).toContain('<i>Oui</i>');
  core.redo();
  expect(core.html('a')).toBe('<p><i>Oui\u202f;</i></p>');
  const explicit = open('fr', '<p><i>Oui</i>\u00a0</p>');
  explicit.select('a', 5);
  explicit.format('italic');
  explicit.format('italic');
  explicit.insert(';');
  expect(explicit.html('a')).toBe('<p><i>Oui</i>\u202f;</p>');
});
it.each([
  ['-', '-', '<p><b>--</b><i>tail</i></p>'],
  ['..', '.', '<p><b>...</b><i>tail</i></p>'],
  ['word', '"', '<p><b>word“</b><i>tail</i></p>'],
])(
  'native new-run prefix after %s preserves source preceding mark affinity',
  (prefix, key, expected) => {
    const original = `<p><b>${prefix}</b><i>tail</i></p>`,
      core = open('en', original);
    core.select('a', prefix.length + 1);
    core.insert(key, { previousTextNodePrefix: '' });
    expect(core.html('a')).toBe(expected);
    core.undo();
    expect(core.html('a')).toBe(original);
    core.redo();
    expect(core.html('a')).toBe(expected);
  },
);
it('programmatic insertion keeps model context while native prefix can contrast at the same offset', () => {
  const core = open('en', '<p><b>-</b><i>tail</i></p>');
  core.select('a', 2);
  core.insert('-');
  expect(core.html('a')).toBe('<p><b>—</b><i>tail</i></p>');
});
