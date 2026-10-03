import { it, expect } from 'vitest';
import { createFixture } from './fixture';
import { ManuscriptSession } from './session';
it('emits typed events and restores an agent edit through shared undo', () => {
 const session = new ManuscriptSession(createFixture()); const events: string[] = []; session.subscribe(e=>events.push(e.type));
 const document = createFixture(); document.chapters[0].blocks[0].runs = [{text:'Changed by author.'}];
 session.nativeChange(document, {chapterId:'chapter-one',blockId:'opening',from:18,to:18},'typing');
 expect(session.document.revision).toBe(1); session.undo();
 expect(session.document.chapters[0].blocks[0].runs[0].text).toBe('The lighthouse was quiet. ');
 expect(events).toEqual(['document.changed','document.changed']);
});
it('redos an undone structural gesture, then discards redo after new writing', () => {
 const session = new ManuscriptSession(createFixture()); session.setSelection({chapterId:'chapter-one',blockId:'opening',from:26,to:26});
 session.enter(1); session.undo(); session.redo(); expect(session.document.chapters[0].blocks).toHaveLength(4);
 session.undo(); const doc=structuredClone(session.document); doc.chapters[1].blocks[0].runs.push({text:' Again.'}); session.nativeChange(doc,null,'typing');
 expect(session.canRedo).toBe(false);
});
