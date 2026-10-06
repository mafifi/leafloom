import {it,expect} from 'vitest';
import {readFile,readdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {create as font} from 'fontkit';
import {fontChoices} from '../src/lib/font-choices.ts';
import {LocaleProvider} from './locales.ts';
import {LibraryHost} from './library.ts';
import type {Opened} from '@leafloom/editor-contracts';
import {translate} from '@leafloom/language-contracts';
import {renderManuscript} from './manuscript-export.ts';
const oracle=new URL('../../../tests/reference/neo-1.3.5/',import.meta.url);
const json=async(url:URL)=>JSON.parse(await readFile(url,'utf8'));
it('[NEO135-003 fonts] every platform offers Quattro and preserves previously selected reading families',()=>{
 for(const platform of ['macos','windows','linux'] as const){const choices=fontChoices(platform);expect(choices.body).toContain('iA Writer Quattro');for(const family of ['Libron','Readerly','Newsreader'])expect(choices.body).toContain(family);expect(choices.bodyStacks['iA Writer Quattro']).toBe('"iA Writer Quattro", "Helvetica Neue", Arial, sans-serif');}
});
it('[NEO135-003 fonts] exact unmodified source Quattro faces and licence embed in real HTML and styled searchable PDF',async()=>{
 const faces=await json(new URL('./fontfaces.json',import.meta.url));const chosen=faces.filter((f:{family:string})=>f.family==='iA Writer Quattro');expect(chosen).toHaveLength(4);
 for(const [weight,style,source]of [[400,'normal','Regular'],[400,'italic','Italic'],[700,'normal','Bold'],[700,'italic','BoldItalic']] as const){const face=chosen.find((f:{weight:number;style:string})=>f.weight===weight&&f.style===style);expect(face).toBeDefined();const bytes=await readFile(new URL('../public/fonts/'+face.file,import.meta.url));expect(bytes.equals(await readFile(new URL('fonts/iAWriterQuattroS-'+source+'.woff2',oracle)))).toBe(true);}
 const receipt=await json(new URL('../public/fonts/provenance-quattro.json',import.meta.url));expect(receipt.pdfFonts.revision).toBe('c6588670c71e9ac628acc27b72cde4bf12726b7f');for(const [file,record]of Object.entries(receipt.pdfFonts.files)){const bytes=await readFile(new URL('../public/fonts/'+file,import.meta.url));expect(createHash('sha256').update(bytes).digest('hex')).toBe((record as {sha256:string}).sha256);}
 for(const face of chosen){const web=font(await readFile(new URL('../public/fonts/'+face.file,import.meta.url))),pdf=font(await readFile(new URL('../public/fonts/'+face.pdfFile,import.meta.url)));expect('fonts' in web).toBe(false);expect('fonts' in pdf).toBe(false);if('fonts' in web||'fonts' in pdf)throw Error('Unexpected font collection');expect(pdf.postscriptName).toBe(web.postscriptName);expect(pdf.characterSet).toEqual(web.characterSet);expect(pdf.layout('Quattro Writing').advanceWidth).toBe(web.layout('Quattro Writing').advanceWidth);}
 expect(await readFile(new URL('../public/fonts/LICENSE-ia-writer-quattro.txt',import.meta.url),'utf8')).toBe(await readFile(new URL('fonts/LICENSE-ia-writer-quattro.txt',oracle),'utf8'));
 const root=await mkdtemp(join(tmpdir(),'leafloom-quattro-'));await writeFile(join(root,'.leafloom-fixture'),'');const host=new LibraryHost(root);try{await host.initialize();const meta=await host.request('createBook',{title:'Quattro edition',author:'Writer'}) as {id:string};const opened=await host.request('openBook',{bookId:meta.id}) as Opened;opened.book.chapters=[{id:'story',html:'<p>Regular <em>Italic</em> <b>Bold</b> <b><em>Both</em></b> words.</p>'}];
 const html=(await renderManuscript(opened,'html',{bodyFont:'iA Writer Quattro',dropcap:'none'})).toString();for(const face of chosen)expect(html).toContain((await readFile(new URL('../public/fonts/'+face.file,import.meta.url))).toString('base64'));
 const pdf=await renderManuscript(opened,'pdf',{bodyFont:'iA Writer Quattro',dropcap:'none'});const source=pdf.toString('latin1');for(const style of ['Regular','Italic','Bold','BoldItalic'])expect(source).toContain('iAWriterQuattroS-'+style);const text=spawnSync('pdftotext',['-','-'],{input:pdf,encoding:'utf8'});expect(text.status).toBe(0);expect(text.stdout.replace(/\s+/g,' ')).toContain('Regular Italic Bold Both words.');
 }finally{await host.shutdown();await rm(root,{recursive:true,force:true});}
});
it('[NEO135-025 catalogs] all shipped languages contain exact source additions and regional overrides resolve through the real provider',async()=>{
 const provider=new LocaleProvider();const files=(await readdir(new URL('locales/',oracle))).filter(f=>f.endsWith('.json')&&!f.startsWith('_'));const languages=await provider.languages();expect(languages.map(l=>l.code).sort()).toEqual(files.map(f=>f.slice(0,-5)).sort());
 const sourceModule={exports:{} as {setLocale:(locale:string,dict:unknown,base:unknown)=>void;t:(key:string,args:Record<string,string|number>)=>string}};runInNewContext(await readFile(new URL('i18n.js',oracle),'utf8'),{module:sourceModule});const english=await json(new URL('locales/en.json',oracle));
 for(const file of files){const locale=file.slice(0,-5),regional=locale.includes('-');const source=await json(new URL('locales/'+file,oracle));const base=regional?await json(new URL('locales/'+locale.split('-')[0]+'.json',oracle)):{};const merged={...base,...source};delete merged._meta;const catalog=await provider.get(locale);expect(catalog.dict).toEqual(merged);sourceModule.exports.setLocale(locale,merged,english);for(const key of ['Flush Paragraph','Underline','Strikethrough','Save cover as image…','Read aloud from the cursor','Continue','Try Again','page {p} of {total}','{n} pages']){const args={p:2,total:12,n:2};expect(translate(catalog,key,args)).toBe(sourceModule.exports.t(key,args).replaceAll('NEO','Leafloom'));}}
 expect((await provider.get('fr_CA')).locale).toBe('fr-CA');expect((await provider.get('pt-PT')).dict['Flush Paragraph']).toBe('Parágrafo sem recuo');expect((await provider.get('fr-BE')).locale).toBe('fr');expect((await provider.get('zz-ZZ')).locale).toBe('en');
});
