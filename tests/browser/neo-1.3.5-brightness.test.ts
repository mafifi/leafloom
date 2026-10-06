// @vitest-environment jsdom
import {get} from 'svelte/store';
import {expect,it} from 'vitest';
import {fixture} from './application-fixture';
it('NEO135 brightness command affects current tab group, survives shelf and durable restart',async()=>{
 const f=await fixture();
 try {
  await f.vm.onboard('Writer','plotter'); await f.vm.newBook(get(f.vm.state).library.shelves[0].id); f.vm.createChapter();
  const id=f.vm.editor!.metadata.id;
  await f.vm.preference('uiBright',false);
  expect(document.body.classList.contains('bright')).toBe(false);
  f.vm.setPanel('outline'); expect(document.body.classList.contains('bright')).toBe(true);
  await f.vm.nativeCommand('ui-bright'); expect(document.body.classList.contains('bright')).toBe(false);
  expect(get(f.vm.state).library.uiBright).toBe(false);expect(get(f.vm.state).library.uiBrightAside).toBe(false);
  await f.vm.nativeCommand('ui-bright'); f.vm.setPanel('notes');expect(document.body.classList.contains('bright')).toBe(true);
  f.vm.setPanel('darlings');expect(document.body.classList.contains('bright')).toBe(true);
  f.vm.setPanel('manuscript');expect(document.body.classList.contains('bright')).toBe(false);
  await f.vm.closeBook();expect(document.body.classList.contains('bright')).toBe(false);
  await f.vm.initialize();await f.vm.openBook(id); f.vm.setPanel('outline');expect(document.body.classList.contains('bright')).toBe(true);
 } finally {await f.close();}
});
