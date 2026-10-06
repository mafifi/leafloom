import {expect,it} from 'vitest';
import {JSDOM} from 'jsdom';
import {BookCore} from '../src/core';
it('screenplay measurement updates remain outside authored typing Undo and durable metadata',()=>{
 const core=new BookCore(new JSDOM('').window.document,{formatVersion:'neo-lifecycle/v1',revision:0,metadata:{id:'layout',title:'Script',author:'Writer',format:'screenplay'},chapters:[{id:'a',html:'<p class="sp-dialogue"></p>'}],darlings:[]},null,'','');
 const passage=core.passageRows('a')[0];core.selectPassage(passage.id,0);core.insert('one');
 const before=core.checkpoint();core.setOutlineSceneMeasurements([{passageId:passage.id,lines:1,before:0,page:2,fill:1}]);
 expect(core.checkpoint()).toEqual(before);core.insert(' two');core.undo();expect(core.passageRows('a')[0].text).toBe('');
});
for (const field of ['credit','draft'] as const) it(`screenplay ${field} native field commits one author Undo with rich manuscript untouched`,()=>{
 const core=new BookCore(new JSDOM('').window.document,{formatVersion:'neo-lifecycle/v1',revision:0,metadata:{id:'title-fields',title:'Script',author:'Writer',format:'screenplay'},chapters:[{id:'a',html:'<p class="sp-dialogue"><i>Author words.</i></p>'}],darlings:[]},null,'','');
 const before=core.checkpoint();core.editMetadataField(field,'First');core.editMetadataField(field,'First\nSecond');core.finishMetadataField(field);
 expect(core.metadata[field]).toBe('First\nSecond');core.undo();expect(core.metadata[field]).toBeUndefined();expect(core.checkpoint().book.chapters).toEqual(before.book.chapters);
 core.redo();expect(core.metadata[field]).toBe('First\nSecond');
});
