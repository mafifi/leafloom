import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { readFile, mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createReferenceDirectory, launchReference, removeReferenceDirectory } from '../reference/harness';
import { openEditingFixture, nativeChord, selectText, caretState, assertTexts } from './editing-helpers';
type Engine = 'original' | 'prosemirror';
const engines: Engine[] = process.env.NEO_PRESENTATION_ENGINE ? [process.env.NEO_PRESENTATION_ENGINE as Engine] : ['original', 'prosemirror'];
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
async function menu(app: ElectronApplication, labels: string[]) {
    await app.evaluate(({ Menu, BrowserWindow }, labels) => {
        let items = Menu.getApplicationMenu()?.items;
        let selected: Electron.MenuItem | undefined;
        for (const label of labels) {
            selected = items?.find(item => item.label.replace(/&/g, '') === label);
            if (!selected)
                throw Error(labels.join('/'));
            items = selected.submenu?.items;
        }
        selected!.click(selected!, BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0], {} as Electron.KeyboardEvent);
    }, labels);
}
async function menuChecked(app: ElectronApplication, labels: string[]) { return app.evaluate(({ Menu }, labels) => { let items = Menu.getApplicationMenu()?.items; let item: Electron.MenuItem | undefined; for (const label of labels) {
    item = items?.find(candidate => candidate.label.replace(/&/g, '') === label);
    if (!item)
        throw Error(labels.join('/'));
    items = item.submenu?.items;
} return item!.checked; }, labels); }
async function fresh(page: Page) { await page.locator('#fr-name').fill('Presentation Writer'); await page.locator('.fr-choice[data-style="pantser"]').click(); await page.locator('#fr-done').click(); await page.locator('.new-book').first().click(); await page.locator('#tp-title').click(); await page.keyboard.type('Presentation book'); await page.keyboard.press('Enter'); await page.locator('.chapter-body').first().click(); }
async function library(directory: string) { return JSON.parse(await readFile(path.join(directory, 'Documents', 'NEO Library', 'library.json'), 'utf8')); }
async function meta(directory: string) {
    const lib = await library(directory);
    const id = lib.shelves.flatMap((s: {
        bookIds: string[];
    }) => s.bookIds)[0];
    return JSON.parse(await readFile(path.join(directory, 'Documents', 'NEO Library', id, 'book.json'), 'utf8'));
}
async function css(page: Page, name: string) { return page.evaluate(name => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), name); }
async function settlePaperScroll(page:Page){
    await page.evaluate(async()=>{
        const sc=document.querySelector('#paper-scroll')!;let previous=sc.scrollTop,stable=0;
        const deadline=performance.now()+4000;
        while(stable<10){await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));const current=sc.scrollTop;stable=Math.abs(current-previous)<.1?stable+1:0;previous=current;if(performance.now()>deadline)throw new Error('Paper scrolling did not settle');}
    });
}
async function spyHalfPageHitTests(page:Page){
    await page.evaluate(()=>{
        const original=document.caretRangeFromPoint.bind(document);
        const position=(node:Node|null,offset:number)=>{const element=node instanceof Element?node:node?.parentElement,editor=element?.closest('.chapter-body,#aux-editor');if(!node||!editor)return null;const prefix=document.createRange();prefix.selectNodeContents(editor);prefix.setEnd(node,offset);return{chapter:Array.from(document.querySelectorAll('.chapter-body')).indexOf(editor),offset:prefix.toString().length};};
        const proof={original,hits:[] as {x:number;y:number;before:ReturnType<typeof position>;hit:ReturnType<typeof position>}[]};
        (window as any).__neoHalfPageHitProof=proof;
        document.caretRangeFromPoint=(x,y)=>{const selection=getSelection(),before=position(selection?.focusNode??null,selection?.focusOffset??0),range=original(x,y),box=document.querySelector('#paper-scroll')!.getBoundingClientRect();if(Math.abs(x-(box.left+box.width/2))<.1&&Math.abs(y-(box.top+box.height/2))<.1)proof.hits.push({x,y,before,hit:range?position(range.startContainer,range.startOffset):null,scrollTop:document.querySelector('#paper-scroll')!.scrollTop,hitText:range?.startContainer.textContent,hitRect:range?.getBoundingClientRect().toJSON()} as any);return range;};
    });
}
async function restoreHalfPageHitTests(page:Page){await page.evaluate(()=>{const proof=(window as any).__neoHalfPageHitProof;if(proof){document.caretRangeFromPoint=proof.original;delete(window as any).__neoHalfPageHitProof;}});}
async function halfPageProof(page:Page){return page.evaluate(()=>{const s=getSelection(),n=s?.focusNode,element=n instanceof Element?n:n?.parentElement,editor=element?.closest('.chapter-body,#aux-editor');let current=null;if(n&&editor){const prefix=document.createRange();prefix.selectNodeContents(editor);prefix.setEnd(n,s!.focusOffset);current={chapter:Array.from(document.querySelectorAll('.chapter-body')).indexOf(editor),offset:prefix.toString().length};}return{hits:(window as any).__neoHalfPageHitProof.hits,current};}) as Promise<{hits:{x:number;y:number;before:{chapter:number;offset:number}|null;hit:{chapter:number;offset:number}|null}[];current:{chapter:number;offset:number}|null}>;}
async function spyNativeViewportWrites(page:Page){await page.evaluate(()=>{
 const host=window as unknown as {revealCaret:()=>void;__neoViewportProof?:any};const selection=getSelection()!;
 const snapshot=()=>{const range=selection.rangeCount?selection.getRangeAt(0):null;return{scrollTop:document.querySelector('#paper-scroll')!.scrollTop,focus:selection.focusNode?.textContent,offset:selection.focusOffset,rect:range?.getBoundingClientRect().toJSON()};};
 const proof:any={events:[],restore:[]};host.__neoViewportProof=proof;
 const originalReveal=host.revealCaret;host.revealCaret=function(){const before=snapshot();const result=originalReveal();proof.events.push({action:'source revealCaret',before,after:snapshot()});return result;};proof.restore.push(()=>{host.revealCaret=originalReveal;});
 for(const method of ['setBaseAndExtent','collapse','extend','removeAllRanges','addRange','modify']as const){const original=selection[method].bind(selection);(selection as any)[method]=(...args:any[])=>{const before=snapshot();const result=(original as any)(...args);proof.events.push({action:method,before,after:snapshot(),stack:new Error().stack});return result;};proof.restore.push(()=>{(selection as any)[method]=original;});}
 });}
async function finishNativeViewportWrites(page:Page){return page.evaluate(()=>{const host=window as unknown as {__neoViewportProof:any};const proof=host.__neoViewportProof;for(const restore of proof.restore)restore();delete host.__neoViewportProof;return proof.events;});}
async function halfPageSnapshot(page:Page){return page.evaluate(()=>{const s=getSelection(),r=s?.rangeCount?s.getRangeAt(0):null,sc=document.querySelector('#paper-scroll')!;return{scrollTop:sc.scrollTop,focus:s?.focusNode?.textContent,offset:s?.focusOffset,rect:r?.getBoundingClientRect().toJSON(),active:document.activeElement?.className};});}
async function fixture(engine: Engine, fn: (app: ElectronApplication, page: Page, directory: string) => Promise<void>) {
    const directory = await createReferenceDirectory();
    let app: ElectronApplication | undefined;
    try {
        app = await launchReference(directory, engine === 'prosemirror' ? 'prosemirror' : undefined);
        const page = await app.firstWindow();
        await fresh(page);
        await fn(app, page, directory);
    }
    finally {
        await app?.close();
        await removeReferenceDirectory(directory);
    }
}
async function caret(page: Page) {
    return page.evaluate(() => {
        const s = window.getSelection();
        if (!s?.focusNode)
            return null;
        let el = s.focusNode.nodeType === Node.TEXT_NODE ? s.focusNode.parentElement : s.focusNode as HTMLElement;
        const body = el?.closest('.chapter-body,#aux-editor');
        if (!body)
            return null;
        const r = document.createRange();
        r.selectNodeContents(body);
        r.setEnd(s.focusNode, s.focusOffset);
        return { before: r.toString(), selected: s.toString(), text: body.textContent };
    });
}
async function start(page: Page) { await page.locator('.chapter-body').first().click(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Control+Home'); expect((await caret(page))?.before).toBe(''); }
const nativeFonts = process.platform === 'darwin' ? ['Georgia', 'Palatino', 'Baskerville', 'Hoefler Text', 'Iowan Old Style', 'Jost'] : process.platform === 'win32' ? ['Georgia', 'Palatino', 'Baskerville', 'Cambria', 'Constantia', 'Jost'] : ['Gelasio', 'TeX Gyre Pagella', 'Libre Baskerville', 'Alegreya', 'Source Serif Pro', 'Jost'];

for (const engine of engines) test.describe(engine, () => {
test('[NEO-188-C][NEO-195-B] cover goal sets clamped progress and blank removes goal through actual dialogs', async () => fixture(engine, async (_app, page, directory) => {
            await page.keyboard.type('Alpha beta gamma.');
            await page.locator('#back-to-shelf').click();
            const cover = page.locator('.book').first();
            await cover.click({ button: 'right' });
            await page.getByText('Set word goal…', { exact: true }).click();
            await page.locator('.modal-backdrop:visible input').fill('2');
            await page.locator('.modal-backdrop:visible .m-ok').click();
            await expect.poll(async () => (await meta(directory)).wordGoal).toBe(2);
            await expect(cover.locator('.b-progress')).toBeVisible();
            expect(await cover.locator('.b-progress > *').evaluate(el => (el as HTMLElement).style.width)).toBe('100%');
            await cover.click();
            await page.locator('#goal-counter').click();
            await expect(page.locator('.stats-nums .big').nth(2)).toHaveText('100%');
            await page.locator('#st-book').fill('4');
            await page.locator('.modal-backdrop:visible').click({ position: { x: 5, y: 5 } });
            await expect(page.locator('#st-book')).toHaveCount(0);
            await expect.poll(async () => (await meta(directory)).wordGoal).toBe(4);
            await page.locator('#back-to-shelf').click();
            await cover.click({ button: 'right' });
            await page.getByText('Set word goal…', { exact: true }).click();
            await page.locator('.modal-backdrop:visible input').fill('');
            await page.locator('.modal-backdrop:visible .m-ok').click();
            await expect.poll(async () => (await meta(directory)).wordGoal).toBe(0);
            await expect(cover.locator('.b-progress')).toBeHidden();
        }));
test('[NEO-189-B][NEO-195-B] Goals without open book saves daily target and cutoff by backdrop then actual typing meets goal', async () => fixture(engine, async (app, page, directory) => {
            await page.locator('#back-to-shelf').click();
            await menu(app, ['File', 'Goals…']);
            await expect(page.locator('#st-book')).toHaveCount(0);
            await expect(page.locator('#st-sprint')).toHaveCount(0);
            await page.locator('#st-daily').fill('2');
            await page.locator('#st-dayends').selectOption('4');
            await page.locator('.modal-backdrop:visible').click({ position: { x: 5, y: 5 } });
            await expect.poll(async () => (await library(directory)).dailyGoal).toBe(2);
            await expect.poll(async () => (await library(directory)).dayEndsAt).toBe(4);
            await page.locator('.book').first().click();
            await expect(page.locator('#goal-counter')).toHaveText('0 / 2 today');await expect(page.locator('.chapter-body')).toBeFocused();await expect.poll(async()=>(await caret(page))?.before).toBe('');
            await page.keyboard.type('Alpha beta ');
            await expect(page.locator('#goal-counter')).toHaveText('2 / 2 today');
            await expect(page.locator('#goal-counter')).toHaveClass(/goal-met/);
            await page.locator('#back-to-shelf').click();
            await page.locator('.book').first().click();
            await expect(page.locator('#goal-counter')).toHaveText('2 / 2 today');
        }));
test('[NEO-191-B] seeded 30-day chart clamps negative deltas and empty days without mutating saved counts', async () => {
            const date = new Date(), key = (delta: number) => { const d = new Date(date); d.setDate(d.getDate() + delta); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
            const dailyCounts = { [key(-2)]: { start: 10, end: 20 }, [key(-1)]: { start: 20, end: 15 } };
            const ctx = await openEditingFixture(engine, { chapters: ['<p>Author words.</p>'], library: { dailyGoal: 10, dayEndsAt: 0 }, metadata: { dailyCounts, wordGoal: 30 } });
            try {
                await ctx.page.locator('#goal-counter').click();
                await expect(ctx.page.locator('#stats-chart rect')).toHaveCount(30);
                await expect(ctx.page.locator('#stats-chart line')).toHaveCount(1);
                const heights = await ctx.page.locator('#stats-chart rect').evaluateAll(els => els.map(el => Number(el.getAttribute('height'))));
                expect(heights.at(-3)).toBe(90);
                expect(heights.at(-2)).toBe(0);
                expect(heights.at(-1)).toBe(0);
                expect(heights.slice(0, -3).every(n => n === 0)).toBe(true);
                expect(await ctx.page.locator('#stats-chart path').getAttribute('d')).toContain('L');
                await ctx.page.keyboard.press('Escape');
                await ctx.page.locator('#back-to-shelf').click();
                const saved = (await meta(ctx.directory)).dailyCounts;
                for (const [day, value] of Object.entries(dailyCounts))
                    expect(saved[day]).toEqual(value);
            }
            finally {
                await ctx.close();
            }
        });
test('[NEO-193-B][NEO-194-A] completed sprint cannot complete again on deletion/retyping and a new sprint resets baseline', async () => fixture(engine, async (_app, page) => {
            await page.locator('#goal-counter').click();
            await page.locator('#st-sprint').fill('2');
            await page.locator('#st-sprint-btn').click();
            await page.locator('.chapter-body').click();
            await page.keyboard.type('Alpha beta ');
            await expect(page.locator('#hint')).toContainText('Sprint complete');
            await page.locator('#goal-counter').click();
            await page.keyboard.press('Escape');
            await page.locator('.chapter-body').click();
            await page.keyboard.press(`${mod}+a`);
            await page.keyboard.press('Backspace');
            await page.keyboard.type('Gamma delta ');
            await expect(page.locator('#goal-counter')).not.toContainText('⚡');
            await page.locator('#goal-counter').click();
            await page.locator('#st-sprint').fill('3');
            await page.locator('#st-sprint-btn').click();
            await expect(page.locator('#goal-counter')).toHaveText('⚡ 0 / 3');
            await page.locator('.chapter-body').click();
            await page.keyboard.type('epsilon ');
            await expect(page.locator('#goal-counter')).toHaveText('⚡ 1 / 3');
        }));
test('[NEO-297-B] unavailable saved local font renders actual Georgia fallback glyph metrics', async () => {
            const ctx = await openEditingFixture(engine, { chapters: ['<p>AaBb școală сердце Ω.</p>'], library: { fonts: { body: 'NeoMissingLocalFont-99487', dropcap: 'none' } } });
            try {
                await expect.poll(() => css(ctx.page, '--body-font')).toContain('Georgia');
                const widths = await ctx.page.locator('.chapter-body p').evaluate(p => { const context = document.createElement('canvas').getContext('2d')!; const style = getComputedStyle(p); context.font = `${style.fontSize} ${style.fontFamily}`; const actual = context.measureText(p.textContent!).width; context.font = `${style.fontSize} Georgia`; return { actual, georgia: context.measureText(p.textContent!).width }; });
                expect(widths.actual).toBeCloseTo(widths.georgia, 3);
                await expect(ctx.page.locator('.chapter-body')).toHaveText('AaBb școală сердце Ω.');
            }
            finally {
                await ctx.close();
            }
        });
for(const state of ['current','unavailable','release'] as const)test(`[NEO-271-B][NEO-272-B] actual source manual update ${state} response owns one native dialog and preserves pending draft`,async()=>{
          const directory=await createReferenceDirectory();let app:ElectronApplication|undefined;try{const release='https://github.com/hughhowey/neo/releases/tag/v999.9.9';await writeFile(path.join(directory,'.neo-parity-host.json'),JSON.stringify({httpResponses:[{match:'api.github.com',status:state==='unavailable'?503:200,body:{tag_name:state==='current'?'v0.0.0':'v999.9.9',html_url:release}}]}));app=await launchReference(directory,engine==='prosemirror'?'prosemirror':undefined);const page=await app.firstWindow();await fresh(page);await page.keyboard.type('A pending update draft.');await menu(app,['Help','Check for Update…']);const dialog=page.locator('.modal-backdrop:visible .modal');await expect(dialog).toHaveCount(1);await expect(dialog).toHaveAttribute('role','dialog');await expect(dialog).toHaveAttribute('aria-modal','true');if(state==='current'){await expect(dialog.locator('h2')).toHaveText('NEO is up to date');const version=await app.evaluate(({app})=>app.getVersion());await expect(dialog.locator('.up-text')).toHaveText(`You have ${version}.`);}else if(state==='unavailable')await expect(dialog.locator('h2')).toHaveText('Couldn’t check for updates — try again later');else{await expect(dialog.locator('h2')).toHaveText('NEO 999.9.9 is available');await expect(dialog.locator('.m-ok')).toHaveText('View Release');await expect(dialog.locator('.up-bar')).toBeHidden();}await menu(app,['Help','Check for Update…']);await expect(dialog).toHaveCount(1);if(state==='release'){await dialog.locator('.m-ok').click();await expect.poll(async()=>JSON.parse(await readFile(path.join(directory,'intercepted-effects.json'),'utf8')).some((e:{type:string;payload:string})=>e.type==='external-url'&&e.payload===release)).toBe(true);}else await page.keyboard.press('Enter');await expect(page.locator('.modal-backdrop:visible')).toHaveCount(0);await expect(page.locator('.chapter-body')).toHaveText('A pending update draft.');await page.locator('#back-to-shelf').click();const book=(await meta(directory)).id;expect(await readFile(path.join(directory,'Documents','NEO Library',book,'chapters',(await meta(directory)).chapterOrder[0]+'.html'),'utf8')).toContain('A pending update draft.');}finally{await app?.close();await removeReferenceDirectory(directory);}
        });
test('[NEO-197-B] native window blur closes unpinned notes pane while newly edited real sticky persists',async()=>{
          const ctx=await openEditingFixture(engine,{chapters:['<p>Author <span class="ph-mark" data-sid="flag" contenteditable="false">⚑</span> prose.</p>'],stickies:[{id:'flag',chapterId:'ch-1',text:'Existing note.',resolved:false}]});try{const {app,page}=ctx;const nativeFocus=await page.context().newCDPSession(page);await nativeFocus.send('Emulation.setFocusEmulationEnabled',{enabled:false});await page.mouse.move(await page.evaluate(()=>innerWidth-1),400);await expect(page.locator('#side-pane')).toHaveClass(/open/);await page.locator('#sticky-list textarea').fill('New note retained through blur.');await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0].focus();});await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused())).toBe(true);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].blur());await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused())).toBe(false);await expect.poll(()=>page.evaluate(()=>document.hasFocus())).toBe(false);await expect(page.locator('#side-pane')).not.toHaveClass(/open/);await expect.poll(async()=>JSON.parse(await readFile(path.join(ctx.bookdir,'stickies.json'),'utf8'))[0].text).toBe('New note retained through blur.');await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0].focus();});await page.mouse.move(await page.evaluate(()=>innerWidth-1),400);await expect(page.locator('#side-pane')).toHaveClass(/open/);await expect(page.locator('#sticky-list textarea')).toHaveValue('New note retained through blur.');await expect(page.locator('.chapter-body')).toHaveText('Author ⚑ prose.');}finally{await ctx.close();}
        });
test('[NEO-184-B][NEO-185-A] story/nonstory roles, scene/ghost/flag counts and named-entry counter', async () => {
            const ctx = await openEditingFixture(engine, { chapters: ['<p>Copyright excluded words.</p>', '<p>Dedication excluded words.</p>', '<p>Prologue opening words.</p>', '<p>Part excluded words.</p>', '<p>Alpha beta. </p><p class="scene-break" data-sec-brk="note">***</p><p class="ghost" data-sec-id="note">Ghost hidden words.</p><p>Gamma<span class="ph-mark" data-sid="flag" contenteditable="false">⚑</span> delta.</p>', '<p>Unnumbered story words.</p>', '<p>Epilogue final words.</p>', '<p>Thanks excluded words.</p>', '<p>About excluded words.</p>'], kinds: { 'ch-1': 'copyright', 'ch-2': 'dedication', 'ch-3': 'prologue', 'ch-4': 'part', 'ch-6': 'unnumbered', 'ch-7': 'epilogue', 'ch-8': 'acknowledgments', 'ch-9': 'about' }, metadata: { sectionNotes: { 'ch-5': { note: 'Ghost hidden words.' } } }, stickies: [{ id: 'flag', chapterId: 'ch-5', text: 'Sticky hidden words.' }] });
            try {
                await expect(ctx.page.locator('#word-counter')).toHaveText('13 words');
                await ctx.page.locator('.chapter-body').first().click();
                await ctx.page.locator('#word-counter').click();
                await expect(ctx.page.locator('#word-counter')).toHaveText('Copyright: 3 words');
                await ctx.page.locator('.chapter-body').nth(4).click();
                await expect(ctx.page.locator('#word-counter')).toHaveText('ch. 1: 4 words');
                await ctx.page.locator('#word-counter').click();
                await expect(ctx.page.locator('#word-counter')).toHaveText('13 words');
                await expect(ctx.page.locator('.chapter-body p.ghost')).toContainText('Ghost hidden words.');
                await expect(ctx.page.locator('.chapter-body .ph-mark')).toHaveText('⚑');
            }
            finally {
                await ctx.close();
            }
        });
for (const [language,text] of [['th','ภาษาไทยดีมาก'],['lo','ພາສາລາວດີຫຼາຍ'],['my','မြန်မာဘာသာစကား'],['km','ភាសាខ្មែរល្អណាស់']])test(`[NEO-184-B] actual ${language} nonspace author input counts native segmented words`,async()=>fixture(engine,async(_app,page)=>{const count=Array.from(new Intl.Segmenter(language,{granularity:'word'}).segment(text)).filter(part=>part.isWordLike).length;expect(count).toBeGreaterThan(1);await page.keyboard.insertText(text);await expect(page.locator('#word-counter')).toHaveText(`${count} words`);await expect(page.locator('.chapter-body')).toHaveText(text);}));
for(const [language,text]of [['zh','你好世界你好世界'],['ja','これは日本語の文章です']])test(`[NEO-184-B] actual ${language} preserves shipped whitespace word policy for unsegmented scripts`,async()=>fixture(engine,async(_app,page)=>{await page.keyboard.insertText(text);await expect(page.locator('#word-counter')).toHaveText('1 word');await expect(page.locator('.chapter-body')).toHaveText(text);}));
test('[NEO-204-B] trusted logical plus/equal/minus/numpad chords step once and clamp text14..22', async () => fixture(engine, async (app, page) => {
            await page.keyboard.type('Shortcut typography.');
            const modifiers = process.platform === 'darwin' ? ['meta'] : ['control'];
            for (const [key, size] of [['+', 18], ['=', 19], ['Add', 20], ['-', 19], ['Subtract', 18]] as const) {
                if(key==='Add'||key==='Subtract'){const session=await page.context().newCDPSession(page);const params={key:key==='Add'?'+':'-',code:key==='Add'?'NumpadAdd':'NumpadSubtract',windowsVirtualKeyCode:key==='Add'?107:109,isKeypad:true,modifiers:process.platform==='darwin'?4:2};await session.send('Input.dispatchKeyEvent',{type:'rawKeyDown',...params});await session.send('Input.dispatchKeyEvent',{type:'keyUp',...params});await session.detach();}else await nativeChord(app,key,modifiers);
                await expect.poll(() => css(page, '--editor-size')).toBe(`${size}px`);
            }
            for (let i = 0; i < 8; i++) {
                await nativeChord(app, '+', modifiers);
                await expect.poll(() => css(page, '--editor-size')).toBe(`${Math.min(22, 19 + i)}px`);
            }
            for (let i = 0; i < 12; i++) {
                await nativeChord(app, '-', modifiers);
                await expect.poll(() => css(page, '--editor-size')).toBe(`${Math.max(14, 21 - i)}px`);
            }
            await expect(page.locator('.chapter-body')).toHaveText('Shortcut typography.');
        }));
test('[NEO-296-B] actual private missing French translations use English UI/plurals and French numeric formatting', async () => fixture(engine, async (app, page, directory) => {
            const local = path.join(directory, 'source', 'locales');
            await unlink(local);
            await mkdir(local);
            for (const name of await readdir(path.resolve('../../locales'))) {
                if (name.endsWith('.json'))
                    await writeFile(path.join(local, name), await readFile(path.resolve('../../locales', name)));
            }
            const file = path.join(local, 'fr.json');
            const french = JSON.parse(await readFile(file, 'utf8'));
            for (const key of ['View', 'Notes', '{n} words'])
                delete french[key];
            await writeFile(file, JSON.stringify(french));
            await menu(app, ['View', 'Language', 'Français']);
            await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
            await page.locator('.book').first().click();
            await expect(page.locator('.chapter-body')).toBeFocused();
            await expect(page.locator('.tab[data-tab="notes"]')).toHaveText('Notes');
            expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.some(item => item.label === 'View'))).toBe(true);
            await expect(page.locator('#word-counter')).toHaveText('0 words');
            await page.keyboard.type('one');
            await expect(page.locator('#word-counter')).toHaveText('1 word');
            await page.keyboard.type(' two');
            await expect(page.locator('#word-counter')).toHaveText('2 words');
            await page.keyboard.type(' three four five six seven eight nine ten eleven twelve');
            await expect(page.locator('#word-counter')).toHaveText('12 words');
            await page.locator('#goal-counter').click();
            await page.locator('#st-daily').fill('12345');
            await page.locator('.modal-backdrop:visible .m-ok').click();
            await expect(page.locator('#goal-counter')).toContainText(new Intl.NumberFormat('fr').format(12345));
            await expect(page.locator('.chapter-body')).toHaveText('one two three four five six seven eight nine ten eleven twelve');
        }));
for (const locale of ['en', 'fr', 'fr-CA', 'es', 'de', 'it', 'nl', 'pl', 'pt', 'pt-PT', 'ro', 'ru', 'el', 'tr'])
            test(`[NEO-275-A][NEO-296-A] ${locale} native menus, document language, plural word counters and author Unicode`, async () => {
                const directory = await createReferenceDirectory();
                let app: ElectronApplication | undefined;
                try {
                    await mkdir(path.join(directory, 'userData'));
                    await writeFile(path.join(directory, 'userData', 'settings.json'), JSON.stringify({ uiLanguage: locale, libraryDir: path.join(directory, 'Documents', 'NEO Library') }));
                    app = await launchReference(directory, engine === 'prosemirror' ? 'prosemirror' : undefined);
                    const page = await app.firstWindow();
                    await fresh(page);
                    await expect(page.locator('html')).toHaveAttribute('lang', locale);
                    const english = JSON.parse(await readFile(path.resolve('../../locales/en.json'), 'utf8'));
                    const base = JSON.parse(await readFile(path.resolve(`../../locales/${locale.split('-')[0]}.json`), 'utf8'));
                    const regional = JSON.parse(await readFile(path.resolve(`../../locales/${locale}.json`), 'utf8'));
                    const dict = { ...base, ...regional };
                    const fileLabel = dict.File || 'File';
                    expect(await app.evaluate(({ Menu }, label) => Menu.getApplicationMenu()?.items.some(item => item.label.replace(/&/g, '') === label.replace(/&/g, '')), fileLabel)).toBe(true);
                    const expected = (n: number) => {
                        let entry = dict['{n} words'];
                        if (!entry)
                            entry = english['{n} words'];
                        const text = typeof entry === 'string' ? entry : entry[new Intl.PluralRules(locale).select(n)] || entry.other;
                        return text.replace('{n}', new Intl.NumberFormat(locale).format(n));
                    };
                    await page.keyboard.insertText('școală');
                    await expect(page.locator('#word-counter')).toHaveText(expected(1));
                    await page.keyboard.insertText(' сердце');
                    await expect(page.locator('#word-counter')).toHaveText(expected(2));
                    await expect(page.locator('.chapter-body').first()).toHaveText('școală сердце');
                    await page.keyboard.insertText(' three four five six seven eight nine ten eleven twelve');
                    await expect(page.locator('#word-counter')).toHaveText(expected(12));
                    const prose = 'școală сердце three four five six seven eight nine ten eleven twelve';
                    await page.locator('.tab[data-tab="notes"]').click();
                    await expect(page.locator('.tab[data-tab="notes"]')).toHaveText(dict.Notes || 'Notes');
                    await page.locator('#aux-editor').click();
                    await page.keyboard.insertText('Ένα βιβλίο.');
                    await expect(page.locator('#aux-editor')).toHaveText('Ένα βιβλίο.');
                    await page.locator('.tab[data-tab="manuscript"]').click();
                    await expect(page.locator('.chapter-body').first()).toHaveText(prose);
                    const activateLocale = async (code: string) => app!.evaluate(({ Menu, BrowserWindow }, code) => { const labels: Record<string, string> = { en: 'English', fr: 'Français', 'fr-CA': 'Français (Canada)', es: 'Español', de: 'Deutsch', it: 'Italiano', nl: 'Nederlands', pl: 'Polski', pt: 'Português (Brasil)', 'pt-PT': 'Português (Portugal)', ro: 'Română', ru: 'Русский', el: 'Ελληνικά', tr: 'Türkçe' }; let selected: Electron.MenuItem | undefined; const visit = (items: Electron.MenuItem[]) => { for (const item of items) {
                        if (item.submenu)
                            visit(item.submenu.items);
                        if (item.label === labels[code])
                            selected = item;
                    } }; visit(Menu.getApplicationMenu()!.items); if (!selected)
                        throw Error(`Locale menu ${code}`); selected.click(selected, BrowserWindow.getAllWindows()[0], {} as Electron.KeyboardEvent); }, code);
                    await activateLocale('en');
                    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
                    await expect(page.locator('#bookshelf-view')).toBeVisible();
                    await page.locator('.book').first().click();
                    await expect(page.locator('.chapter-body')).toBeFocused();
                    await page.keyboard.type(' pending');
                    await activateLocale(locale);
                    await expect(page.locator('html')).toHaveAttribute('lang', locale);
                    await expect(page.locator('#bookshelf-view')).toBeVisible();
                    await page.locator('.book').first().click();
                    await expect(page.locator('.chapter-body')).toBeFocused();
                    await expect(page.locator('.chapter-body')).toHaveText(prose + ' pending');
                    await page.locator('.tab[data-tab="notes"]').click();
                    await expect(page.locator('#aux-editor')).toHaveText('Ένα βιβλίο.');
                }
                finally {
                    await app?.close();
                    await removeReferenceDirectory(directory);
                }
            });
for (const [saved, resolved] of [['fr_CA', 'fr-CA'], ['fr-BE', 'fr'], ['fr-CH', 'fr'], ['FR_ca', 'fr-CA'], ['zz-ZZ', 'en']])
            test(`[NEO-302-A] regional ${saved} resolves ${resolved} before actual editor and menus initialize`, async () => {
                const directory = await createReferenceDirectory();
                let app: ElectronApplication | undefined;
                try {
                    await mkdir(path.join(directory, 'userData'));
                    await writeFile(path.join(directory, 'userData', 'settings.json'), JSON.stringify({ uiLanguage: saved, libraryDir: path.join(directory, 'Documents', 'NEO Library') }));
                    app = await launchReference(directory, engine === 'prosemirror' ? 'prosemirror' : undefined);
                    const page = await app.firstWindow();
                    await fresh(page);
                    await expect(page.locator('html')).toHaveAttribute('lang', resolved);
                    await page.keyboard.type('A regional manuscript.');
                    await expect(page.locator('.chapter-body').first()).toHaveText('A regional manuscript.');
                    expect(await page.evaluate(() => (window as any).neo.i18n.locale)).toBe(resolved);
                }
                finally {
                    await app?.close();
                    await removeReferenceDirectory(directory);
                }
            });
test('[NEO-273-A][NEO-276-A] real host window bounds and offline local manuscript survive close/relaunch', async () => {
            const directory = await createReferenceDirectory();
            let app: ElectronApplication | undefined;
            try {
                app = await launchReference(directory, engine === 'prosemirror' ? 'prosemirror' : undefined);
                let page = await app.firstWindow();
                await fresh(page);
                await page.context().setOffline(true);
                await page.keyboard.type('An offline manuscript remains local.');
                await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 1050, height: 740 }));
                await expect.poll(() => app!.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.getAllWindows()[0].getBounds(); return { width: b.width, height: b.height }; })).toEqual({ width: 1050, height: 740 });
                await page.locator('#back-to-shelf').click();
                const id = (await meta(directory)).id;
                await app.close();
                app = undefined;
                const settings = JSON.parse(await readFile(path.join(directory, 'userData', 'settings.json'), 'utf8'));
                expect(settings.window.width).toBe(1050);
                expect(settings.window.height).toBe(740);
                app = await launchReference(directory, engine === 'prosemirror' ? 'prosemirror' : undefined);
                page = await app.firstWindow();
                await page.context().setOffline(true);
                await expect.poll(() => app!.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.getAllWindows()[0].getBounds(); return { width: b.width, height: b.height }; })).toEqual({ width: 1050, height: 740 });
                await page.locator('.book').first().click();
                await expect(page.locator('.chapter-body').first()).toHaveText('An offline manuscript remains local.');
                expect((await meta(directory)).id).toBe(id);
                await expect(page.locator('.chapter-body').first()).toBeFocused();
                await expect.poll(async () => (await caret(page))?.before).toBe('An offline manuscript remains local.');
                await page.keyboard.type(' Continued offline.');
                await expect(page.locator('.chapter-body').first()).toContainText('Continued offline.');
            }
            finally {
                await app?.close();
                await removeReferenceDirectory(directory);
            }
        });
test('[NEO-271-A][NEO-272-A][NEO-295-A] actual packaged updater events drive progress, ready persistence and save before install', async () => {
            const directory = await createReferenceDirectory();
            let app: ElectronApplication | undefined;
            try {
                await writeFile(path.join(directory, '.neo-parity-host.json'), JSON.stringify({ updater: { packaged: true, checkResult: { updateInfo: { version: '999.9.9' } } }, httpResponses: [{ match: 'api.github.com', body: { tag_name: 'v999.9.9', html_url: 'https://github.com/hughhowey/neo/releases/tag/v999.9.9' } }] }));
                app = await launchReference(directory, engine === 'prosemirror' ? 'prosemirror' : undefined);
                const page = await app.firstWindow();
                await fresh(page);
                await page.keyboard.type('Saved before the updater restarts.');
                await app.evaluate(() => { const h = (globalThis as any).__neoParityHost; h.fireScheduled(8000); });
                await expect.poll(() => app!.evaluate(() => (globalThis as any).__neoParityHost.updaterCalls().length)).toBe(1);
                await app.evaluate(() => (globalThis as any).__neoParityHost.emitUpdater('update-available', { version: '999.9.9' }));
                await menu(app, ['Help', 'Check for Update…']);
                await expect(page.locator('.up-bar')).toBeVisible();
                await expect(page.locator('.modal-backdrop:visible .m-ok')).toBeHidden();
                await app.evaluate(() => (globalThis as any).__neoParityHost.emitUpdater('download-progress', { percent: 110, transferred: 0, total: 0 }));
                await expect.poll(() => page.locator('.up-fill').evaluate(el => (el as HTMLElement).style.width)).toBe('100%');
                await expect(page.locator('.up-text')).toHaveText('Downloading…');
                await app.evaluate(() => (globalThis as any).__neoParityHost.emitUpdater('download-progress', { percent: -5, transferred: 0, total: 0 }));
                await expect.poll(() => page.locator('.up-fill').evaluate(el => (el as HTMLElement).style.width)).toBe('0%');
                await app.evaluate(() => (globalThis as any).__neoParityHost.emitUpdater('download-progress', { percent: 45, transferred: 45 * 1048576, total: 100 * 1048576 }));
                await expect(page.locator('.up-text')).toHaveText('Downloading… 45 of 100 MB');
                await expect.poll(() => page.locator('.up-fill').evaluate(el => (el as HTMLElement).style.width)).toBe('45%');
                await menu(app, ['Help', 'Check for Update…']);
                await expect(page.locator('.up-bar')).toHaveCount(1);
                await app.evaluate(() => (globalThis as any).__neoParityHost.emitUpdater('update-downloaded', { version: '999.9.9' }));
                await expect(page.locator('.modal-backdrop:visible .m-ok')).toHaveText('Restart to update');
                await app.evaluate(() => (globalThis as any).__neoParityHost.emitUpdater('error', { message: 'later network error' }));
                await expect(page.locator('.modal-backdrop:visible .m-ok')).toHaveText('Restart to update');
                await page.keyboard.press('Escape');
                await menu(app, ['Help', 'Check for Update…']);
                await expect(page.locator('.modal-backdrop:visible .m-ok')).toHaveText('Restart to update');
                await page.locator('.modal-backdrop:visible .m-ok').click();
                await expect.poll(() => app!.evaluate(() => (globalThis as any).__neoParityHost.updaterCalls().filter((x: any) => x.method === 'quitAndInstall'))).toEqual([{ method: 'quitAndInstall', args: [false, true] }]);
                const metadata = await meta(directory);
                const text = await readFile(path.join(directory, 'Documents', 'NEO Library', metadata.id, 'chapters', metadata.chapterOrder[0] + '.html'), 'utf8');
                expect(text).toContain('Saved before the updater restarts.');
            }
            finally {
                await app?.close();
                await removeReferenceDirectory(directory);
            }
        });
test('[NEO-294-A][NEO-295-A] actual startup/hour/resume schedules deduplicate in-flight checks and stop while downloading/ready', async () => {
            const directory = await createReferenceDirectory();
            let app: ElectronApplication | undefined;
            try {
                await writeFile(path.join(directory, '.neo-parity-host.json'), JSON.stringify({ updater: { packaged: true, checkDelayMs: 400, checkResult: { updateInfo: { version: '0.0.0' } } } }));
                app = await launchReference(directory, engine === 'prosemirror' ? 'prosemirror' : undefined);
                const page = await app.firstWindow();
                await fresh(page);
                expect(await app.evaluate(() => (globalThis as any).__neoParityHost.scheduled())).toEqual(expect.arrayContaining([{ delay: 8000, repeat: false }, { delay: 3600000, repeat: true }]));
                await app.evaluate(({ powerMonitor }) => { const h = (globalThis as any).__neoParityHost; h.fireScheduled(8000); h.fireScheduled(3600000); powerMonitor.emit('resume'); h.fireScheduled(15000); });
                expect(await app.evaluate(() => (globalThis as any).__neoParityHost.updaterCalls().filter((x: any) => x.method === 'checkForUpdates').length)).toBe(1);
                await page.evaluate(async () => await (window as any).neo.checkForUpdate());
                expect(await app.evaluate(() => (globalThis as any).__neoParityHost.updaterCalls().filter((x: any) => x.method === 'checkForUpdates').length)).toBe(1);
                await app.evaluate(() => (globalThis as any).__neoParityHost.fireScheduled(3600000));
                await expect.poll(() => app!.evaluate(() => (globalThis as any).__neoParityHost.updaterCalls().filter((x: any) => x.method === 'checkForUpdates').length)).toBe(2);
                await app.evaluate(() => { const h = (globalThis as any).__neoParityHost; h.emitUpdater('update-available', { version: '999.9.9' }); h.fireScheduled(3600000); });
                expect(await app.evaluate(() => (globalThis as any).__neoParityHost.updaterCalls().filter((x: any) => x.method === 'checkForUpdates').length)).toBe(2);
                await app.evaluate(() => { const h = (globalThis as any).__neoParityHost; h.emitUpdater('update-downloaded', { version: '999.9.9' }); h.fireScheduled(3600000); });
                expect(await app.evaluate(() => (globalThis as any).__neoParityHost.updaterCalls().filter((x: any) => x.method === 'checkForUpdates').length)).toBe(2);
                await expect(page.locator('#editor-view')).toBeVisible();
            }
            finally {
                await app?.close();
                await removeReferenceDirectory(directory);
            }
        });
test('[NEO-295-A] updater error replaces progress with actual release fallback and cannot install before ready', async () => {
            const directory = await createReferenceDirectory();
            let app: ElectronApplication | undefined;
            try {
                await writeFile(path.join(directory, '.neo-parity-host.json'), JSON.stringify({ updater: { packaged: true, checkResult: { updateInfo: { version: '999.9.9' } } }, httpResponses: [{ match: 'api.github.com', body: { tag_name: 'v999.9.9', html_url: 'https://github.com/hughhowey/neo/releases/tag/v999.9.9' } }] }));
                app = await launchReference(directory, engine === 'prosemirror' ? 'prosemirror' : undefined);
                const page = await app.firstWindow();
                await fresh(page);
                await page.keyboard.type('The draft survives update errors.');
                await menu(app, ['Help', 'Check for Update…']);
                await expect(page.locator('.up-bar')).toBeVisible();
                await app.evaluate(() => (globalThis as any).__neoParityHost.emitUpdater('error', { message: 'signature unavailable' }));
                await expect(page.locator('.up-text')).toContainText('signature unavailable');
                await expect(page.locator('.modal-backdrop:visible .m-ok')).toHaveText('View Release');
                expect(await page.evaluate(async () => (window as any).neo.installUpdate())).toBe(false);
                expect(await app.evaluate(() => (globalThis as any).__neoParityHost.updaterCalls().filter((x: any) => x.method === 'quitAndInstall'))).toEqual([]);
                await page.locator('.modal-backdrop:visible .m-ok').click();
                await expect(page.locator('.up-bar')).toHaveCount(0);
                await expect(page.locator('.chapter-body').first()).toHaveText('The draft survives update errors.');
                const events = JSON.parse(await readFile(path.join(directory, 'intercepted-effects.json'), 'utf8'));
                expect(events.some((event: any) => event.type === 'external-url' && event.payload === 'https://github.com/hughhowey/neo/releases/tag/v999.9.9')).toBe(true);
            }
            finally {
                await app?.close();
                await removeReferenceDirectory(directory);
            }
        });
for (const [theme, label] of [['night', 'Night'], ['paper', 'Paper'], ['light', 'Light']])
            test(`[NEO-200-A][NEO-274-A] ${label} page and room menu state persists`, async () => fixture(engine, async (app, page, directory) => {
                await page.keyboard.type('Paper appearance');
                await menu(app, ['View', 'Page', label]);
                await expect.poll(async () => (await library(directory)).pageTheme).toBe(theme);
                await expect.poll(() => menuChecked(app, ['View', 'Page', label])).toBe(true);
                expect(await page.locator('body').evaluate(body => body.classList.contains('night'))).toBe(theme === 'night');
                expect(await page.locator('body').evaluate(body => body.classList.contains('light'))).toBe(theme === 'light');
                const colors = await page.locator('.sheet').first().evaluate(el => ({ paper: getComputedStyle(el).backgroundColor, room: getComputedStyle(document.body).backgroundColor }));
                expect(colors.paper).not.toBe(colors.room);
                await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor().toLowerCase().slice(-6))).toBe(theme === 'light' ? 'efede8' : '191919');
                await page.locator('#back-to-shelf').click();
                await page.locator('.book').first().click();
                expect(await page.locator('body').evaluate(body => body.classList.contains('night'))).toBe(theme === 'night');
                expect(await page.locator('body').evaluate(body => body.classList.contains('light'))).toBe(theme === 'light');
                await expect(page.locator('.chapter-body').first()).toHaveText('Paper appearance');
            }));
for (const font of nativeFonts)
            test(`[NEO-201-A] host platform font ${font} sets actual manuscript style and persists`, async () => fixture(engine, async (app, page, directory) => {
                await page.keyboard.type('Author typography');
                await menu(app, ['Format', 'Body Font', font]);
                await expect.poll(async () => (await library(directory)).fonts.body).toBe(font);
                expect(await css(page, '--body-font')).toContain(font);
                expect(await page.locator('.chapter-body').first().evaluate(el => getComputedStyle(el).fontFamily)).toContain(font);
            }));
for (const [kind, label] of [['literary', 'Literary'], ['fantasy', 'Fantasy'], ['scifi', 'Sci-Fi'], ['none', 'Off']])
            test(`[NEO-203-A] ${label} drop cap setting and prose glyph`, async () => fixture(engine, async (app, page, directory) => {
                await page.keyboard.type('Mara opens the book.');
                await menu(app, ['Format', 'Drop Cap Style', label]);
                await expect.poll(async () => (await library(directory)).fonts.dropcap).toBe(kind);
                expect(await page.locator('body').evaluate(el => el.classList.contains('no-dropcap'))).toBe(kind === 'none');
                const glyph = await page.locator('.chapter-body p').first().evaluate(el => getComputedStyle(el, '::first-letter').fontSize);
                expect(parseFloat(glyph)).toBe(17);
                await page.keyboard.press('Enter');
                await page.keyboard.type('The second paragraph gives the opening room.');
                await expect.poll(() => page.locator('.chapter-body p').first().evaluate(el => parseFloat(getComputedStyle(el, '::first-letter').fontSize))).toBeCloseTo(kind === 'none' ? 17 : 17 * 3.4, 1);
                await expect(page.locator('.chapter-body').first()).toContainText('Mara opens the book.');
            }));
for (const [zoom, label] of [[1, 'Normal'], [1.25, '125%'], [1.5, '150%'], [2, '200%'], [2.5, '250%'], [3, '300%']] as const)
            test(`[NEO-207-A][NEO-274-A] interface ${label} remains independent of page zoom`, async () => fixture(engine, async (app, page, directory) => {
                await menu(app, ['View', 'Interface Size', label]);
                await expect.poll(() => css(page, '--ui-zoom')).toBe(String(zoom));
                expect(await css(page, '--page-zoom')).toBe('1');
                await expect.poll(async () => (await library(directory)).uiZoom).toBe(zoom);
                await expect.poll(() => menuChecked(app, ['View', 'Interface Size', label])).toBe(true);
            }));
test('[NEO-204-A][NEO-205-A][NEO-206-A] text size bounds and actual page zoom buttons, wheel, clamps and reset', async () => fixture(engine, async (app, page, directory) => {
            await page.keyboard.type('The reading place stays visible.');
            for (let i = 0; i < 12; i++) {
                await menu(app, ['Format', 'Larger Text']);
                await expect.poll(() => css(page, '--editor-size')).toBe(`${Math.min(22, 18 + i)}px`);
            }
            expect(await css(page, '--editor-size')).toBe('22px');
            for (let i = 0; i < 12; i++) {
                await menu(app, ['Format', 'Smaller Text']);
                await expect.poll(() => css(page, '--editor-size')).toBe(`${Math.max(14, 21 - i)}px`);
            }
            expect(await css(page, '--editor-size')).toBe('14px');
            await page.locator('#zoom-in').click();
            await expect(page.locator('#zoom-level')).toHaveText('110%');
            await page.locator('#zoom-out').click();
            await expect(page.locator('#zoom-level')).toHaveText('100%');
            await page.locator('#zoom-control').hover();
            await page.mouse.wheel(0, -2000);
            await expect(page.locator('#zoom-level')).toHaveText('300%');
            await page.mouse.wheel(0, 2000);
            await expect(page.locator('#zoom-level')).toHaveText('75%');
            await page.locator('#zoom-level').click();
            await expect(page.locator('#zoom-level')).toHaveText('100%');
            await page.locator('#zoom-in').click();
            await menu(app, ['Format', 'Reset Text Size']);
            expect(await css(page, '--editor-size')).toBe('17px');
            expect(await css(page, '--page-zoom')).toBe('1');
            await expect.poll(async () => (await library(directory)).editorFontSize).toBe(17);
        }));
test('[NEO-196-A][NEO-197-A][NEO-198-A][NEO-299-A] edge-hover panels hide, pin without changing prose, and persist per book', async () => fixture(engine, async (_app, page) => {
            await page.keyboard.type('Panel prose.');
            const size = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
            await page.mouse.move(2, size.h / 2);
            await expect(page.locator('#nav-pane')).toHaveClass(/open/);await page.locator('#nav-head').hover();await expect(page.locator('#nav-pane')).toHaveClass(/open/);
            await page.mouse.move(size.w / 2, size.h / 2);
            await expect(page.locator('#nav-pane')).not.toHaveClass(/open/);
            await page.mouse.move(size.w - 2, size.h / 2);
            await expect(page.locator('#side-pane')).toHaveClass(/open/);
            await page.locator('#side-pin').click();
            await expect(page.locator('#side-pin')).toHaveAttribute('aria-pressed', 'true');
            await page.mouse.move(size.w / 2, size.h / 2);
            await expect(page.locator('#side-pane')).toHaveClass(/open/);
            await page.locator('#back-to-shelf').click();
            await page.locator('.book').first().click();
            await expect(page.locator('#side-pin')).toHaveAttribute('aria-pressed', 'true');
            await expect(page.locator('.chapter-body').first()).toHaveText('Panel prose.');
        }));
test('[NEO-199-A][NEO-218-A] increased contrast/reduced motion and explicit brighter interface preference', async () => fixture(engine, async (app, page, directory) => {
            await page.emulateMedia({ contrast: 'more', reducedMotion: 'reduce' });
            await expect(page.locator('body')).toHaveClass(/bright/);
            const transition = await page.locator('#nav-pane').evaluate(el => getComputedStyle(el).transitionDuration);
            expect(parseFloat(transition)).toBeLessThanOrEqual(0.01);
            await menu(app, ['View', 'Brighter Interface']);
            await expect(page.locator('body')).not.toHaveClass(/bright/);
            await expect.poll(async () => (await library(directory)).uiBright).toBe(false);
            await page.emulateMedia({ contrast: 'no-preference' });
            await page.emulateMedia({ contrast: 'more' });
            await expect(page.locator('body')).not.toHaveClass(/bright/);
        }));
test('[NEO-209-A][NEO-274-A] typewriter preference/menu state and real writing remain active', async () => fixture(engine, async (app, page, directory) => {
            await menu(app, ['Format', 'Typewriter Scrolling']);
            await expect(page.locator('body')).toHaveClass(/typewriter/);
            await page.keyboard.type('Typewriter writing remains uninterrupted.');
            await expect(page.locator('.chapter-body').first()).toContainText('Typewriter writing');
            await expect.poll(async () => (await library(directory)).typewriter).toBe(true);
            await expect.poll(() => menuChecked(app, ['Format', 'Typewriter Scrolling'])).toBe(true);
            await menu(app, ['Format', 'Typewriter Scrolling']);
            await expect(page.locator('body')).not.toHaveClass(/typewriter/);
            await expect.poll(() => menuChecked(app, ['Format', 'Typewriter Scrolling'])).toBe(false);
        }));
test('[NEO-188-A][NEO-189-A][NEO-191-A][NEO-195-A] goals fields, 30-day chart, escape persistence and no modal stacking', async () => fixture(engine, async (app, page, directory) => {
            await page.keyboard.type('Alpha beta gamma');
            await page.locator('#goal-counter').click();
            await expect(page.locator('#stats-chart rect')).toHaveCount(30);
            await expect(page.locator('.modal-backdrop:visible .modal')).toHaveAttribute('role', 'dialog');
            await page.locator('#st-daily').fill('2');
            await page.locator('#st-book').fill('10');
            await page.locator('#st-dayends').selectOption('4');
            await menu(app, ['File', 'Goals…']);
            await expect(page.locator('.modal-backdrop:not([hidden])')).toHaveCount(1);
            await page.keyboard.press('Escape');
            await expect(page.locator('.modal-backdrop:not([hidden])')).toHaveCount(0);
            await expect.poll(async () => (await library(directory)).dailyGoal).toBe(2);
            await expect.poll(async () => (await library(directory)).dayEndsAt).toBe(4);
            await expect.poll(async () => (await meta(directory)).wordGoal).toBe(10);
        }));
test('[NEO-190-A][NEO-191-A] local four-o-clock writing day, net deletion and real chart goal geometry', async () => fixture(engine, async (_app, page, directory) => {
            await page.clock.setFixedTime(new Date(2026, 6, 2, 23, 30));
            await page.locator('#goal-counter').click();
            await page.locator('#st-daily').fill('10');
            await page.locator('#st-book').fill('20');
            await page.locator('#st-dayends').selectOption('4');
            await page.locator('.modal-backdrop:visible .m-ok').click();
            await page.locator('.chapter-body').first().click();
            await page.keyboard.type('Alpha ');
            await page.clock.setFixedTime(new Date(2026, 6, 3, 0, 30));
            await page.keyboard.type('beta ');
            await page.clock.setFixedTime(new Date(2026, 6, 3, 3, 30));
            await page.locator('#back-to-shelf').click();
            await expect.poll(async () => (await meta(directory)).dailyCounts?.['2026-07-02']?.end).toBe(2);
            await page.locator('.book').first().click();
            await page.clock.setFixedTime(new Date(2026, 6, 3, 4, 30));
            await page.keyboard.type('gamma ');
            await page.keyboard.type('delta ');
            await page.keyboard.press('Backspace');
            await page.keyboard.press('Backspace');
            await page.keyboard.press('Backspace');
            await page.keyboard.press('Backspace');
            await page.keyboard.press('Backspace');
            await page.keyboard.press('Backspace');
            await page.locator('#goal-counter').click();
            await expect(page.locator('#stats-chart rect')).toHaveCount(30);
            await expect(page.locator('#stats-chart line')).toHaveCount(1);
            const heights = await page.locator('#stats-chart rect').evaluateAll(els => els.map(el => Number(el.getAttribute('height'))));
            expect(heights.every(height => height >= 0)).toBe(true);
            await page.keyboard.press('Escape');
            await page.locator('#back-to-shelf').click();
            const daily = (await meta(directory)).dailyCounts;
            expect(daily['2026-07-02'].end).toBe(2);
            expect(daily['2026-07-03'].end - daily['2026-07-03'].start).toBe(0);
        }));
test('[NEO-192-A][NEO-193-A][NEO-194-A] sprint starts/completes/ends with real author word deltas', async () => fixture(engine, async (_app, page) => {
            await page.locator('#goal-counter').click();
            await page.locator('#st-sprint').fill('2');
            await page.locator('#st-sprint-btn').click();
            await expect(page.locator('#goal-counter')).toHaveText(/0 \/ 2/);
            await page.locator('.chapter-body').first().click();
            await page.keyboard.type('Alpha beta ');
            await expect(page.locator('#hint')).toContainText('Sprint complete');
            await page.locator('#goal-counter').click();
            await page.locator('#st-sprint').fill('50');
            await page.locator('#st-sprint-btn').click();
            await page.locator('.chapter-body').first().click();
            await page.keyboard.press('End');
            await page.keyboard.type(' gamma ');
            await page.locator('#goal-counter').click();
            await page.locator('#st-sprint-btn').click();
            await expect(page.locator('#hint')).toContainText(/Sprint ended.*1 word/);
        }));
test('[NEO-216-A][NEO-217-A][NEO-270-A][NEO-283-A] shortcuts and About dialogs own keyboard and remain singular', async () => fixture(engine, async (app, page) => {
            await page.keyboard.type('Dialog manuscript');
            await page.keyboard.press(`${mod}+/`);
            await expect(page.locator('#keyboard-shortcuts')).toBeVisible();
            await expect(page.locator('#keyboard-shortcuts [role="dialog"]')).toHaveAttribute('aria-modal', 'true');
            await page.keyboard.press(`${mod}+/`);
            await expect(page.locator('#keyboard-shortcuts')).toHaveCount(1);
            await page.keyboard.press('Escape');
            await expect(page.locator('#keyboard-shortcuts')).toHaveCount(0);
            await expect(page.locator('#editor-view')).toBeVisible();
            await menu(app, ['Help', 'About NEO']);
            await expect(page.locator('.about-version')).toContainText('Version');
            await expect(page.locator('.modal-backdrop:visible .modal[role="dialog"]')).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(page.locator('.about-version')).toHaveCount(0);
        }));
test('[NEO-212-A][NEO-213-A][NEO-214-A] native fullscreen reflects real window and Escape keeps manuscript before shelf', async () => fixture(engine, async (app, page) => {
            await page.keyboard.type('A fullscreen manuscript.');
            const nativeFocus=await page.context().newCDPSession(page);await nativeFocus.send('Emulation.setFocusEmulationEnabled',{enabled:false});
            await app.evaluate(({ BrowserWindow, app }) => { app.focus({ steal: true }); BrowserWindow.getAllWindows()[0].focus(); });
            await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id)).toBe(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].id));
            await menu(app, ['View', 'Full Screen']);
            await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);
            await expect(page.locator('body')).toHaveClass(/full-screen/);
            await menu(app, ['View', 'Focus Mode', 'Paragraph']);
            await page.locator('.chapter-body').click();
            await page.mouse.move(500, 200);
            await expect.poll(() => page.locator('#bottombar').evaluate(el => getComputedStyle(el).opacity)).toBe('0');
            await page.locator('#bottombar').hover();
            await expect.poll(() => page.locator('#bottombar').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
            await page.mouse.move(500, 200);
            await page.keyboard.press('F6');
            await page.keyboard.press('F6');
            await page.keyboard.press('F6');
            await expect(page.locator('.tab.active')).toBeFocused();
            expect(await page.locator('.tab.active').evaluate(el=>el.matches(':focus-visible'))).toBe(true);
            await expect.poll(() => page.locator('#bottombar').evaluate(el => getComputedStyle(el).opacity)).toBe(engine==='original'?'0':'1');
            await page.keyboard.press('Escape');
            await expect(page.locator('.chapter-body')).toBeFocused();
            await page.keyboard.press('Escape');
            await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false);
            await expect(page.locator('#editor-view')).toBeVisible();
            await expect(page.locator('.chapter-body').first()).toHaveText('A fullscreen manuscript.');
            await page.keyboard.press('Escape');
            await expect(page.locator('#bookshelf-view')).toBeVisible();
        }));
});
