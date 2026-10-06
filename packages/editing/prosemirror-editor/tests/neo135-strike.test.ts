import { expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { BookCore } from '../src/core';
import { clipboardHTML } from '../src/clipboard';
import { markdownHTML, markdownMatch } from '../src/typography';
const document = new JSDOM('').window.document;
it('NEO135 typed strike recognizes source boundaries and excludes escaped or spaced delimiters', () => {
  expect(markdownMatch('a~~word~~')).toMatchObject({from:1,to:9,open:2,strike:true,bold:false,italic:false});
  for (const text of ['\\~~word~~','~~~word~~','~~ word~~','~~word ~~','~~word\\~~']) expect(markdownMatch(text)).toBeNull();
});
it('NEO135 typed strike preserves nested author marks, immediate delimiter Undo and plain continuation', () => {
 const core = new BookCore(document,{formatVersion:'neo-lifecycle/v1',revision:0,metadata:{id:'strike',title:'Strike',author:'Writer'},chapters:[{id:'a',html:'<p><b>Start </b></p>'}],darlings:[]},null,'<p></p>','<p></p>');
 core.select('a',7); core.insert('~~word~~');
 expect(core.html('a')).toContain('<s>'); expect(core.passageRows('a')[0].text).toBe('Start word');
 core.undo(); expect(core.passageRows('a')[0].text).toBe('Start ~~word~~');
 core.redo(); core.insert(' plain'); expect(core.html('a')).not.toContain('word plain</s>');
});
it('NEO135 pasted strike nests existing emphasis and rich clipboard preserves all four inline marks', () => {
 expect(markdownHTML('~~**word**~~')).toBe('<s><b>word</b></s>');
 expect(markdownHTML('\\~~word~~')).toBeNull();
 const parsed = clipboardHTML(document,'<p><b><i><u><s>word</s></u></i></b></p>');
 expect(parsed.firstChild!.firstChild!.marks.map(mark=>mark.type.name).sort()).toEqual(['bold','italic','strike','underline']);
});
it('NEO135 Format Flush and Poetry are mutually exclusive and share one rich author Undo',()=>{
 const core=new BookCore(document,{formatVersion:'neo-lifecycle/v1',revision:0,metadata:{id:'formats',title:'Formats',author:'Writer'},chapters:[{id:'a',html:'<p><b>First.</b></p><p><u>Second.</u></p>'}],darlings:[]},null,'<p></p>','<p></p>');
 core.select('a',1,15);core.toggleFlush();expect(core.html('a')).toBe('<p class="flush"><b>First.</b></p><p class="flush"><u>Second.</u></p>');
 core.undo();expect(core.html('a')).toBe('<p><b>First.</b></p><p><u>Second.</u></p>');core.redo();core.select('a',1);core.togglePoetry();
 expect(core.html('a')).toContain('class="poetry"');expect(core.html('a')).not.toContain('class="flush poetry"');
 core.toggleFlush();expect(core.html('a')).not.toContain('<i>');expect(core.html('a')).toContain('<b>First.</b>');
 core.setManuscriptMode('screenplay');const before=core.html('a');core.toggleFlush();core.togglePoetry();expect(core.html('a')).toBe(before);
});
