import { it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IdentitySession } from './session';
import { inspectHTML, inventory } from './fidelity';
import { legacyFixture } from '../lifecycle-spike/fixture';
import { importNeo, exportNeo } from '../lifecycle-spike/legacy';
import { closeHistory } from 'prosemirror-history';
const document=new JSDOM('').window.document;
const book=(html:string)=>({formatVersion:'neo-lifecycle/v1',revision:0,metadata:{id:'book',title:'Title',author:'Writer'},chapters:[{id:'chapter',html}],darlings:[]});
const supported=[
 '<p>  Before dawn.\u00a0Été 😺</p>',
 '<p class="poetry" style="text-align:right">  Verse<br>  line</p><p class="scene-break" data-sec-brk="s">***</p><p class="ghost" data-sec-id="s">Turning point</p>',
 '<p data-sec-id="opening">The lighthouse was <b>quiet <i>again</i></b>.<span class="ph-mark" data-sid="s-one" contenteditable="false">⚑</span><span class="darling-anchor" data-did="d-one" contenteditable="false"></span></p>',
 '<h2 class="note-heading">Research</h2><ul><li><p>One</p><ol start="3"><li><p>Two</p></li></ol></li></ul><blockquote><p><u>Quote</u> <s>old</s> <a href="https://example.org/reference" title="Source">source</a></p></blockquote><pre><code> x\n  y</code></pre>',
 '<p><strong>Bold</strong> <em>Italic</em> <del>Old</del> <code>code</code> <span style="font-weight:700;font-style:italic">Styled</span></p>',
 '<div class="note-line" data-note="n1">First</div><div>Second</div>',
 '<p><span class="writer-note" data-note="n1">Marked text</span></p>',
 '<p></p><p><br></p>',
 '  Raw\n  note\t text ',
 '\n  <p>  Alpha  beta. </p>\n\t<p>Second</p>\n'
];
it.each(supported)('supports and independently verifies rich content: %s',html=>{
 expect(inspectHTML(document,html).supported).toBe(true);const s=new IdentitySession(document,book(html));expect(s.checkpoint().book.chapters[0].html).toBe(html);
 const e=s.editor('chapter'),p=s.passages().find(p=>p.size>0);if(p){const entry=e.passages.find(e=>e.node.attrs.pid===p.id)!;e.dispatch(closeHistory(e.state.tr).insertText('X',entry.pos+1));const saved=s.checkpoint();expect(saved.book.chapters[0].html).not.toContain('pid');expect(saved.book.chapters[0].html).not.toContain('neo-identity');const re=new IdentitySession(document,JSON.parse(JSON.stringify(saved.book)));expect(re.passages().map(p=>p.id)).toEqual(s.passages().map(p=>p.id));e.undo();expect(s.checkpoint().book.chapters[0].html).toBe(html);expect(inventory(document,s.checkpoint().book.chapters[0].html)).toBe(inventory(document,html));}
});
const unsupported=[
 '<p><img src="cover.png" alt="Portrait">Caption</p>',
 '<table><tr><td>Cell</td></tr></table>',
 '<p style="color:red">Colour matters</p>',
 '<p id="unique">Identity</p>',
 '<p><a href="file:./reference.pdf">Local link</a></p>',
 '<p><span class="outer"><span class="inner">Nested annotation</span></span></p>',
 '<p><b class="special">Custom mark</b></p>',
 '<p><script>Do not execute</script>Keep source</p>',
 '<p><span style="font-style:normal">Normal</span></p>',
 '<p><span class="bad$class">Class matters</span></p>'
];
it.each(unsupported)('preserves unsupported source and refuses edits: %s',html=>{
 const s=new IdentitySession(document,book(html)),e=s.editor('chapter');expect(e.supported).toBe(false);const before=s.checkpoint().book;expect(e.dispatch(e.state.tr.insertText('Lose nothing',1))).toBe(false);expect(s.passages()).toEqual([]);expect(s.checkpoint().book).toEqual(before);expect(before.chapters[0].html).toBe(html);const re=new IdentitySession(document,JSON.parse(JSON.stringify(before)));expect(re.checkpoint().book.chapters[0].html).toBe(html);
});
it('imports actual NEO folder fixtures, edits one chapter, and exports all other source bytes untouched',async()=>{
 const root=await mkdtemp(join(tmpdir(),'neo-identity-fidelity-'));try{const source=join(root,'source'),target=join(root,'target'),out=join(root,'export');const fixture=await legacyFixture(source);const imported=await importNeo(source,target);const s=new IdentitySession(document,imported);expect(s.passages().length).toBe(7);const before=s.checkpoint().book;for(const c of before.chapters)expect(c.html).toBe(fixture.chapters[c.id as keyof typeof fixture.chapters]);
 const e=s.editor('arrival');e.dispatch(closeHistory(e.state.tr).insertText('Again, ',1));const after=s.checkpoint();const reopened=new IdentitySession(document,JSON.parse(JSON.stringify(after.book)),after.reviews);expect(reopened.passages().map(p=>p.id)).toEqual(s.passages().map(p=>p.id));const legacy=reopened.legacyEnvelope();await writeFile(join(target,'manuscript.json'),JSON.stringify(legacy));await exportNeo(target,out);
 for(const id of ['prologue','part-one','epilogue'])expect(await readFile(join(out,'chapters',id+'.html'),'utf8')).toBe(fixture.chapters[id as keyof typeof fixture.chapters]);for(const name of ['notes.html','outline.html','stickies.json','cover.png'])expect(await readFile(join(out,name))).toEqual(await readFile(join(source,name)));expect(JSON.parse(await readFile(join(out,'darlings.json'),'utf8'))).toEqual(fixture.darlings);expect(JSON.parse(await readFile(join(out,'book.json'),'utf8'))).toEqual(fixture.metadata);
 const html=await readFile(join(out,'chapters','arrival.html'),'utf8');expect(html).toContain('data-sec-id="opening"');expect(html).toContain('data-did="d-one"');expect(html).toContain('data-sid="s-one"');expect(html).toContain('text-align: right');expect(html).toContain('class="ghost"');expect(html).not.toMatch(/pid|passage-/);expect(await readFile(join(source,'chapters','arrival.html'),'utf8')).toBe(fixture.chapters.arrival);
 }finally{await rm(root,{recursive:true,force:true});}
});
