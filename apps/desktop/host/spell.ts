import { loadModule, type HunspellFactory, type HunspellInstance } from '@farscrl/hunspell-wasm';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { LifecycleError } from '@leafloom/editor-contracts';
const require = createRequire(import.meta.url);
export const SpellLanguages = {
  'en-US': 'dictionary-en-us',
  'en-GB': 'dictionary-en-gb',
  'en-AU': 'dictionary-en-au',
  'en-CA': 'dictionary-en-ca',
  fr: 'dictionary-fr',
  de: 'dictionary-de',
  es: 'dictionary-es',
  el: 'dictionary-el',
  nl: 'dictionary-nl',
  pl: 'dictionary-pl',
  pt: 'dictionary-pt',
  ro: 'dictionary-ro',
  ru: 'dictionary-ru',
} as const;
export class SpellProvider {
  private factory: HunspellFactory | null = null;
  private current: { language: string; spell: HunspellInstance; files: string[] } | null = null;
  private learned: () => Promise<Record<string, string[]>>;
  constructor(learned: () => Promise<Record<string, string[]>>) {
    this.learned = learned;
  }
  private language(raw: string) {
    const normalized=raw.replace('_', '-'),code=normalized==='pt-BR'?'pt':normalized;
    if (!Object.hasOwn(SpellLanguages, code)) throw new LifecycleError('INVALID');
    return code as keyof typeof SpellLanguages;
  }
  private normalize(word: string, language: string) {
    return language === 'ro'
      ? word
          .normalize('NFC')
          .replace(/[şţŞŢ]/g, (c) => ({ ş: 'ș', ţ: 'ț', Ş: 'Ș', Ţ: 'Ț' })[c] ?? c)
      : word;
  }
  async load(raw: string) {
    const language = this.language(raw);
    if (this.current?.language === language) return this.current;
    const factory = (this.factory ??= await loadModule()),
      directory = dirname(require.resolve(SpellLanguages[language]));
    const files = [
      factory.mountBuffer(
        await readFile(join(directory, 'index.aff')),
        'leafloom-' + language + '.aff',
      ),
      factory.mountBuffer(
        await readFile(join(directory, 'index.dic')),
        'leafloom-' + language + '.dic',
      ),
    ];
    let spell: HunspellInstance;
    try {
      spell = factory.create(files[0], files[1]);
      for (const word of new Set(Object.values(await this.learned()).flat()))
        spell.addWord(this.normalize(word, language));
    } catch (e) {
      for (const file of files) factory.unmount(file);
      throw e;
    }
    if (this.current) {
      this.current.spell.dispose();
      for (const file of this.current.files) factory.unmount(file);
    }
    this.current = { language, spell, files };
    return this.current;
  }
  async check(words: string[], language: string) {
    const current = await this.load(language);
    return Object.fromEntries(
      words.map((word) => [
        word,
        !word || current.spell.spell(this.normalize(word, current.language)),
      ]),
    );
  }
  async suggest(word: string, language: string) {
    const current = await this.load(language);
    return current.spell.suggest(this.normalize(word, current.language)).slice(0, 6);
  }
  async learn(word: string, language: string) {
    const current = await this.load(language);
    current.spell.addWord(this.normalize(word, current.language));
    return current.language;
  }
}
