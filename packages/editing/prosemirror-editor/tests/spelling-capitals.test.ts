import {expect,it} from 'vitest';
import {JSDOM} from 'jsdom';
import {BookCore} from '../src/core';
function open() {return new BookCore(new JSDOM('').window.document,{formatVersion:'neo-lifecycle/v1',revision:0,metadata:{id:'caps',title:'Caps',author:'Writer'},chapters:[{id:'a',html:'<p><b>hello.</b> after Dr. smith. i said … lower! okay</p><p class="poetry">lower poetry</p><p class="ghost">lower plan</p><p>J. r. r. and (i) and i.e. but i\u2019m here.</p>'}],darlings:[]},null,'<p>lower notes</p>','<p>lower outline</p>');}
it('NEO135 capital spell corrections use sentence and English pronoun rules, preserving author exclusions',()=>{
 const core=open(), paragraphs=core.passageRows('a');
 const rows=core.capitalizationRanges('a','en-US');
 expect(rows.filter(r=>r.passageId===paragraphs[0].id).map(r=>[r.from,r.to,r.correction])).toEqual([[0,1,'H'],[7,8,'A'],[24,25,'I']]);
 expect(rows.some(r=>[paragraphs[1].id,paragraphs[2].id].includes(r.passageId))).toBe(false);
 expect(rows.filter(r=>r.passageId===paragraphs[3].id).map(r=>r.from)).toEqual([30]);
 expect(core.capitalizationRanges('notes','en-US')).toEqual([]);
 const nonEnglish=core.capitalizationRanges('a','fr');expect(nonEnglish.some(r=>r.passageId===paragraphs[3].id)).toBe(false);
});
it('NEO135 accepting a capital correction preserves rich marks and one Undo without changing the dictionary',()=>{
 const core=open(), row=core.capitalizationRanges('a','en-US')[0], before=core.checkpoint();
 core.replacePassageText(row.passageId,row.from,row.to,row.correction);
 expect(core.html('a')).toContain('<b>Hello.</b>');core.undo();expect(core.checkpoint().book.chapters).toEqual(before.book.chapters);
});
