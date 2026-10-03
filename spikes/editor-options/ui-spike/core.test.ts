import { describe, it, expect } from 'vitest';
import { EditorCore } from './core';
import { createFixture } from '../src/fixture';
import { ManuscriptSchema } from '../src/contracts';
const selection={chapterId:'chapter-one',blockId:'opening',from:0,to:0};
describe('editor contract',()=>{
 it('typing keeps IDs and formatting without taking a whole-book snapshot',()=>{
  const core=new EditorCore(createFixture());core.select(selection);const count=core.snapshots;
  for(let i=0;i<30;i++)core.insert('x');expect(core.snapshots).toBe(count);
  const doc=core.snapshot();expect(doc.chapters[0].blocks[0].runs[0].text).toContain('x'.repeat(30));expect(doc.chapters[0].blocks[0].id).toBe('opening');expect(doc.chapters[0].blocks[0].runs.at(-1)?.italic).toBe(true);ManuscriptSchema.parse(doc);
 });
 it('Darlings removal and metadata share native undo and redo',()=>{
  const original=createFixture(),core=new EditorCore(original);core.select({...selection,from:26,to:36});core.archive();
  expect(core.snapshot().darlings[0].runs).toEqual([{text:'Too quiet.',italic:true}]);
  core.undo();expect(core.snapshot().chapters).toEqual(original.chapters);expect(core.snapshot().darlings).toEqual([]);
  core.redo();const id=core.snapshot().darlings[0].id;core.restore(id);expect(core.snapshot().chapters).toEqual(original.chapters);expect(core.snapshot().darlings).toEqual([]);
  core.undo();expect(core.snapshot().darlings).toHaveLength(1);core.redo();expect(core.snapshot().darlings).toHaveLength(0);
 });
 it('paragraph, scene, chapter gestures and their undo preserve identities',()=>{
  const original=createFixture(),core=new EditorCore(original);core.select({...selection,from:35,to:35});core.enter();core.enter();core.enter();
  expect(core.snapshot().chapters).toHaveLength(3);ManuscriptSchema.parse(core.snapshot());core.undo();core.undo();core.undo();expect(core.snapshot().chapters).toEqual(original.chapters);
 });
 it('formatting is undoable and schema rejects duplicate IDs',()=>{
  const core=new EditorCore(createFixture());core.select({...selection,to:3});core.format('bold');expect(core.snapshot().chapters[0].blocks[0].runs[0]).toEqual({text:'The',bold:true});core.undo();expect(core.snapshot().chapters).toEqual(createFixture().chapters);
  const bad=createFixture();bad.chapters[1].id=bad.chapters[0].id;expect(()=>new EditorCore(bad)).toThrow();
 });
});
it('merging across chapter boundary is one undoable edit and keeps word count correct',()=>{
 const original=createFixture(),core=new EditorCore(original);core.select({chapterId:'chapter-two',blockId:'return',from:0,to:0});core.backspace();expect(core.snapshot().chapters).toHaveLength(1);core.undo();expect(core.snapshot().chapters).toEqual(original.chapters);expect(core.words).toBe(original.chapters.flatMap(c=>c.blocks).map(b=>b.runs.map(r=>r.text).join('')).join(' ').trim().split(/\s+/).length);
});

it('Backspace at the beginning of the book creates no dirty revision or undo item',()=>{const core=new EditorCore(createFixture());core.select(selection);core.backspace();expect(core.revision).toBe(0);expect(core.canUndo).toBe(false);});
