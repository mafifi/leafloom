import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {readFountainScreenplay,readFountainDocument} from '@leafloom/document-contracts';
const source=readFileSync('tests/reference/neo-1.3.5/app.js','utf8');
const context=vm.createContext({});
const head=source.slice(source.indexOf('const SP_HEAD_RE ='),source.indexOf('function spParseHeading'));
const parser=source.slice(source.indexOf('const spDropContd ='),source.indexOf('// Fountain\'s title page:'));
const runs=source.slice(source.indexOf('function spRunsFromFountain'),source.indexOf('// Final Draft\'s .fdx'));
vm.runInContext(head+'\nconst SP_TITLE_KEY=/^(title|credit|author|authors|source|draft date|date|contact|copyright|notes|revision)\\s*:/i;\n'+parser+'\n'+runs,context);
const samples=[
 ['annotations and PDF noise','/* omitted */\n[[note]]\n# Section\n= Synopsis\n===\n\nINT. ROOM - DAY #7#\n\nA long action\ncontinued here.\n\nKIM (CONT\'D) ^\nHello\n~again.\n(MORE)\n12.\nCONTINUED:\n(quietly)\nYes.'],
 ['escaped and unmatched emphasis','!A \\*literal\\* and unmatched * mark.\n\n@Kim\n**Strong** _under_ ***both*** and \\_literal\\_.'],
 ['contextual blocks and forced roles','ALL CAPS WITHOUT SPEECH\n\nCut to:\n\n>centered<\n\n~Lyric\n\n..ellipsis\ncontinues\n\n@KIM\n@literal dialogue\n\n.INT. FORCED #2#'],
] as const;
for(const [name,text] of samples)it('matches executed pinned Fountain reader: '+name,()=>{
 const expected=vm.runInContext('spFromFountain('+JSON.stringify(text)+').map(l=>({element:({heading:"scene-heading",paren:"parenthetical"}[l.type]||l.type),runs:spRunsFromFountain(l.text).map(r=>({text:r.text,marks:[r.i&&"italic",r.b&&"bold",r.u&&"underline"].filter(Boolean)}))}))',context);
 expect(readFountainScreenplay(text,{projection:'paste'}).lines).toEqual(JSON.parse(JSON.stringify(expected)));
});
it('file import retains explicit annotation refusal',()=>expect(()=>readFountainScreenplay('[[private note]]')).toThrow('UNSUPPORTED_SCREENPLAY'));
it('imports standard annotations into existing notes while retaining source narrative',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');const {join}=await import('node:path');const {tmpdir}=await import('node:os');const {LibraryHost}=await import('./library.ts');
 const root=await mkdtemp(join(tmpdir(),'leafloom-annotated-fountain-'));const host=new LibraryHost(root);await host.initialize();
 const text='Title: Annotated\n\n# Opening\n= Synopsis <script>safe</script>\n\nINT. ROOM - DAY\n\nA step. [[private <b>note</b>]]\n/* retired\nwords & details */\n\nKIM\nHello\nagain.\n\n===\n';
 try{const file=join(root,'input.fountain');await writeFile(file,text);const meta=await host.request('importManuscript',{source:file}) as {id:string};const opened=await host.request('openBook',{bookId:meta.id}) as {book:{chapters:{html:string}[]};notes:string;lease:string};expect(opened.book.chapters[0]!.html).toContain('Hello again.');expect(opened.book.chapters[0]!.html).toContain('data-screenplay="scene-heading"');expect(opened.notes).toContain('&lt;script&gt;safe&lt;/script&gt;');expect(opened.notes).toContain('[[private &lt;b&gt;note&lt;/b&gt;]]');expect(opened.notes).toContain('/* retired\nwords &amp; details */');expect(opened.notes).toContain('# Opening');expect(opened.notes).toContain('===');expect(opened.notes).toBe(await readFile(join(root,meta.id,'notes.html'),'utf8'));await host.request('closeBook',{bookId:meta.id,lease:opened.lease});const reopened=await host.request('openBook',{bookId:meta.id}) as {notes:string};expect(reopened.notes).toBe(opened.notes);}
 finally{await host.shutdown();await rm(root,{recursive:true,force:true});}
});

it('preserves exact annotation text/order and refuses unmatched delimiters',()=>{
 const annotation='/* one\r\ntwo */';const note='[[a\nb]]';const section='  # section';
 expect(readFountainDocument(annotation+'\n'+note+'\n'+section+'\n\n!Words.').annotations).toEqual([annotation,note,section]);
 for(const text of ['[[unclosed','unopened]]','/*unclosed','unopened*/'])expect(()=>readFountainDocument(text)).toThrow('UNSUPPORTED_SCREENPLAY');
});
it('preserves source-only title metadata in notes and reads standard title aliases',()=>{
 const source='Title: Harbor\nAuthors: Ada Writer\nDate: October\nSource: Adapted from a book\n    by Hugh\nCopyright: 2026\nNotes: Keep <literal> text\nRevision: Blue\n\n!Rain falls.\n';
 const result=readFountainDocument(source);expect(result.script.title).toMatchObject({title:'Harbor',author:'Ada Writer',draft:'October'});expect(result.annotations).toEqual(['Source: Adapted from a book\n    by Hugh','Copyright: 2026','Notes: Keep <literal> text','Revision: Blue']);expect(result.script.lines[0]!.runs[0]!.text).toBe('Rain falls.');expect(()=>readFountainDocument('Title: Harbor\nUnknown field: retained?\n\n!Rain.')).toThrow('UNSUPPORTED_SCREENPLAY');
});
