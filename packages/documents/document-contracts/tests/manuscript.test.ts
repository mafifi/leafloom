import { expect, it } from 'vitest';
import { Manuscript, SourceBook, migrateManuscript, legacyBook, ScreenplayElement, screenplayElementFromLegacyClass } from '../src/index';
const version = '11111111-1111-4111-8111-111111111111';
const prose = { formatVersion: 'neo-composed/v1', revision: 7, version, metadata: {id:'book',title:'Book',author:'Writer',custom:{retained:true}}, chapters:[{id:'chapter',version,html:'<p>A <i>word</i>.</p>',passages:[{id:'passage',path:[0],signature:'a'.repeat(64)}]}],darlings:[{custom:'keep'}] };
it('migrates identity-bearing prose without changing authored content or version', () => {
 const before = structuredClone(prose), migrated = migrateManuscript(prose);
 expect(migrated).toEqual({...prose,formatVersion:'leafloom-manuscript/v2',mode:'prose'});
 expect(prose).toEqual(before); expect(migrateManuscript(migrated)).toEqual(migrated);
 expect(Manuscript.parse(migrated)).toEqual(migrated); expect(SourceBook.parse(prose)).toEqual(prose);
});
it('recognises legacy screenplays and retains unsupported author markup', () => {
 const original={...prose,metadata:{...prose.metadata,format:'screenplay'},chapters:[{...prose.chapters[0],html:'<p class="sp-heading">INT. ROOM - DAY</p><div data-future="preserve">Unknown</div>'}]};
 const migrated=migrateManuscript(original);expect(migrated.mode).toBe('screenplay');expect(migrated.chapters).toEqual(original.chapters);
 expect(legacyBook(migrated).metadata.format).toBe('screenplay');
 expect(Manuscript.safeParse({...migrated,mode:'prose'}).success).toBe(false);
});
it('validates the seven upstream element types and rejects ambiguous legacy cues', () => {
 expect(ScreenplayElement.options).toEqual(['scene-heading','action','character','parenthetical','dialogue','transition','shot']);
 expect(screenplayElementFromLegacyClass('custom sp-heading')).toBe('scene-heading');
 expect(screenplayElementFromLegacyClass('sp-paren')).toBe('parenthetical');
 expect(screenplayElementFromLegacyClass('sp-character sp-dialogue')).toBe(null);
 expect(ScreenplayElement.safeParse('camera-position').success).toBe(false);
});
it('rejects unknown versions and duplicate identity after migration', () => {
 expect(()=>migrateManuscript({...prose,formatVersion:'future/v99'})).toThrow();
 expect(()=>migrateManuscript({...prose,chapters:[prose.chapters[0],prose.chapters[0]]})).toThrow();
});
