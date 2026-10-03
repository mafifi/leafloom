import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { LanguageCatalog } from '@leafloom/language-contracts';
const moduleURL = import.meta.url;
export type TranslationValue = string | Record<string, string>;
export type Language = { code: string; name: string };
export class LocaleProvider {
  constructor(readonly directory = fileURLToPath(new URL('./locales/', moduleURL))) {}
  private async dictionary(code: string) {
    if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(code)) throw Error('INVALID');
    const raw = z
      .record(z.string(), z.json())
      .parse(JSON.parse(await readFile(join(this.directory, code + '.json'), 'utf8')));
    const dict: Record<string, TranslationValue> = {};
    for (const [key, value] of Object.entries(raw))
      if (key !== '_meta')
        dict[key] = z.union([z.string(), z.record(z.string(), z.string())]).parse(value);
    const meta = z.object({ name: z.string() }).passthrough().parse(raw._meta);
    return { dict, name: meta.name };
  }
  async languages(): Promise<Language[]> {
    const result: Language[] = [];
    let files:string[];
    try{files=await readdir(this.directory);}catch{return [{code:'en',name:'English'}];}
    for (const file of files) {
      if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*\.json$/.test(file)) continue;
      const code = file.slice(0, -5);
      try{const value=await this.dictionary(code);result.push({ code, name: value.name });}catch{/* An unavailable translation cannot prevent writing. */}
    }
    if(!result.some(language=>language.code==='en'))result.push({code:'en',name:'English'});
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }
  async resolve(wanted: string) {
    const languages = await this.languages(),
      code = wanted.replace(/_/g, '-');
    for (const value of [code, code.split('-')[0]]) {
      const hit = languages.find((language) => language.code.toLowerCase() === value.toLowerCase());
      if (hit) return hit.code;
    }
    return null;
  }
  async get(wanted: string) {
    const locale = (await this.resolve(wanted)) ?? 'en',
      base = (await this.dictionary('en').catch(()=>({dict:{}}))).dict,
      language = locale.split('-')[0],
      dict = {
        ...(language !== locale ? (await this.dictionary(language).catch(()=>({dict:{}}))).dict : {}),
        ...(await this.dictionary(locale).catch(()=>({dict:{}}))).dict,
      };
    return LanguageCatalog.parse({ locale, dict, base });
  }
}
