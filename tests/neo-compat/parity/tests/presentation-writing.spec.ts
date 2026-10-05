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
for (const [kind, opening, eligible, dialogue] of [['poetry', '<p class="poetry">A poem line.</p><p>First prose.</p><p>Last prose.</p>', 1, false], ['dialogue', '<p>— Hello there.</p><p>Answering prose.</p>', 0, true], ['ordinary', '<p>Mara opens the book.</p><p>Answering prose.</p>', 0, false]] as const)
            test(`[NEO-203-C] ${kind} first eligible prose dropcap and dialogue indentation match actual layout`, async () => {
                const ctx = await openEditingFixture(engine, { chapters: [opening], library: { fonts: { body: 'Georgia', dropcap: 'literary' } } });
                try {
                    const { page } = ctx;
                    await selectText(page, 0, kind === 'poetry' ? 2 : 1, 3);
                    await expect(page.locator('.chapter-body')).not.toHaveClass(/cap-off/);
                    expect(await page.locator('.chapter-body').evaluate(el => el.classList.contains('opens-dialogue'))).toBe(dialogue);
                    const style = await page.locator('.chapter-body p').nth(eligible).evaluate(p => ({ glyph: parseFloat(getComputedStyle(p, '::first-letter').fontSize), indent: parseFloat(getComputedStyle(p).textIndent) }));
                    expect(style.glyph).toBeCloseTo(dialogue ? 17 : 57.8, 1);
                    expect(style.indent).toBeCloseTo(dialogue ? 34 : 0, 1);
                    if (kind === 'poetry')
                        expect(await page.locator('.chapter-body p').first().evaluate(p => parseFloat(getComputedStyle(p, '::first-letter').fontSize))).toBe(17);
                    await ctx.page.locator('#back-to-shelf').click();
                    const disk = await readFile(path.join(ctx.bookdir, 'chapters', 'ch-1.html'), 'utf8');
                    expect(disk).not.toContain('data-speech');
                    expect(disk).not.toContain('cap-off');
                }
                finally {
                    await ctx.close();
                }
            });
test('[NEO-210-B][NEO-211-B] native focus cycle ticks and retained auxiliary manuscript highlight preserve paragraphs', async () => {
            const ctx = await openEditingFixture(engine, { chapters: ['<p>First sentence. Second sentence.</p><p>Other paragraph.</p>'] });
            try {
                const { page, app } = ctx;
                await selectText(page, 0, 0, 18);
                await menu(app, ['View', 'Focus Mode', 'Cycle']);
                await expect.poll(() => menuChecked(app, ['View', 'Focus Mode', 'Paragraph'])).toBe(true);
                await expect.poll(() => page.evaluate(() => Array.from(CSS.highlights.get('neo-focus') || []).map(r => r.toString()))).toEqual(['First sentence. Second sentence.']);
                await menu(app, ['View', 'Focus Mode', 'Cycle']);
                await expect.poll(() => menuChecked(app, ['View', 'Focus Mode', 'Sentence'])).toBe(true);
                await expect.poll(() => page.evaluate(() => Array.from(CSS.highlights.get('neo-focus') || []).map(r => r.toString()))).toEqual(['Second sentence.']);
                await page.locator('.tab[data-tab="notes"]').click();
                await page.locator('#aux-editor').click();
                await page.keyboard.type('Notes keep manuscript focus.');
                await expect.poll(() => page.evaluate(() => Array.from(CSS.highlights.get('neo-focus') || []).map(r => r.toString()))).toEqual(['Second sentence.']);
                await menu(app, ['View', 'Focus Mode', 'Cycle']);
                await expect.poll(() => menuChecked(app, ['View', 'Focus Mode', 'Off'])).toBe(true);
                await expect.poll(()=>page.evaluate(()=>CSS.highlights.has('neo-focus'))).toBe(false);
                await page.locator('.tab[data-tab="manuscript"]').click();
                await assertTexts(page, [['First sentence. Second sentence.', 'Other paragraph.']]);
            }
            finally {
                await ctx.close();
            }
        });
test('[NEO-202-A][NEO-297-A] real local font permission, filtering, preview, cancel and Enter selection', async () => fixture(engine, async (app, page, directory) => {
            await page.keyboard.type('The author previews their installed fonts.');
            await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.session.setPermissionCheckHandler((_wc, permission) => permission === 'local-fonts'));
            await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.session.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'local-fonts')));
            await menu(app, ['Format', 'Body Font', 'Other Font…']);
            await expect(page.locator('.font-picker')).toBeVisible();
            const buttons = page.locator('.font-list .fr-font');
            expect(await buttons.count()).toBeGreaterThan(0);
            const names = await buttons.allTextContents();
            expect(names.some(name => name.startsWith('.'))).toBe(false);
            expect(new Set(names).size).toBe(names.length);
            const selected = names.find(name => name !== 'Georgia')!;
            await page.locator('.font-picker input').fill(selected);
            await expect.poll(() => buttons.allTextContents()).toContain(selected);
            await buttons.filter({ hasText: new RegExp('^' + selected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).hover();
            expect(await css(page, '--body-font')).toContain(selected);
            await page.locator('.font-picker .m-cancel').click();
            expect(await css(page, '--body-font')).toContain('Georgia');
            expect((await library(directory)).fonts?.body || 'Georgia').toBe('Georgia');
            await menu(app, ['Format', 'Body Font', 'Other Font…']);
            await page.locator('.font-picker input').fill(selected.toUpperCase());
            await expect.poll(() => buttons.allTextContents()).toContain(selected);
            await buttons.first().hover();
            await expect.poll(() => css(page, '--body-font')).toContain(selected);
            await page.locator('.font-picker input').focus();
            await page.keyboard.press('Escape');
            await expect(page.locator('.font-picker')).toHaveCount(0);
            await expect.poll(() => css(page, '--body-font')).toContain('Georgia');
            await menu(app, ['Format', 'Body Font', 'Other Font…']);
            await page.locator('.font-picker input').fill(selected);
            const first = await buttons.first().textContent();
            await page.keyboard.press('Enter');
            await expect(page.locator('.font-picker')).toHaveCount(0);
            await expect.poll(async () => (await library(directory)).fonts.body).toBe(first);
            await expect(page.locator('.chapter-body').first()).toHaveText('The author previews their installed fonts.');
        }));
test('[NEO-304-A] emulated forced-colors preserves selected tab/current chapter/page outline cues', async () => fixture(engine, async (_app, page) => {
            await page.keyboard.type('System theme manuscript.');
            await page.emulateMedia({ forcedColors: 'active' });
            expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
            await expect.poll(() => page.locator('.tab.active').evaluate(el => getComputedStyle(el).textDecorationLine)).toContain('underline');
            await expect.poll(() => page.locator('#bottombar').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
            const border = await page.locator('.sheet').first().evaluate(el => ({ width: getComputedStyle(el).borderTopWidth, style: getComputedStyle(el).borderTopStyle }));
            expect(border).toEqual({ width: '1px', style: 'solid' });
            await page.locator('.tab[data-tab="notes"]').click();
            await expect.poll(() => page.locator('.tab[data-tab="notes"]').evaluate(el => getComputedStyle(el).textDecorationLine)).toContain('underline');
            await page.locator('.tab[data-tab="manuscript"]').click();
            await expect(page.locator('.chapter-body').first()).toHaveText('System theme manuscript.');
        }));
for (const [align, label] of [['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justify']])
            test(`[NEO-208-A] ${label} native paragraph alignment preserves prose, disk, reopen and HTML export`, async () => fixture(engine, async (app, page, directory) => {
                await page.keyboard.type('First aligned paragraph.');
                await page.keyboard.press('Enter');
                await page.keyboard.type('Second aligned paragraph.');
                await page.keyboard.press(`${mod}+a`);
                expect((await caret(page))?.selected).toContain('First aligned paragraph.');
                await menu(app, ['Format', 'Align Paragraph', label]);
                await expect.poll(() => page.locator('.chapter-body p').evaluateAll(ps => ps.map(p => (p as HTMLElement).style.textAlign))).toEqual([align === 'left' ? '' : align, align === 'left' ? '' : align]);
                await page.locator('#back-to-shelf').click();
                const metadata = await meta(directory);
                const saved = await readFile(path.join(directory, 'Documents', 'NEO Library', metadata.id, 'chapters', metadata.chapterOrder[0] + '.html'), 'utf8');
                if (align === 'left')
                    expect(saved).not.toContain('text-align');
                else
                    expect(saved).toContain(`text-align: ${align}`);
                await page.locator('.book').first().click();
                await expect.poll(() => page.locator('.chapter-body p').evaluateAll(ps => ps.map(p => (p as HTMLElement).style.textAlign))).toEqual([align === 'left' ? '' : align, align === 'left' ? '' : align]);
                const output = path.join(directory, 'aligned.html');
                await writeFile(path.join(directory, '.neo-parity-host.json'), JSON.stringify({ savePath: output }));
                await menu(app, ['File', 'Export', 'Web Page (.html)']);
                await expect.poll(async () => {
                    try {
                        return await readFile(output, 'utf8');
                    }
                    catch {
                        return '';
                    }
                }).toContain('First aligned paragraph.');
                const exported = await readFile(output, 'utf8');
                expect(await page.evaluate(html => Array.from(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.chapter p')).map(p => (p as HTMLElement).style.textAlign), exported)).toEqual([align === 'left' ? '' : align, align === 'left' ? '' : align]);
            }));
test('[NEO-208-A] native alignment affects prose/poetry and skips actual scene-break paragraph', async () => fixture(engine, async (app, page) => {
            await page.keyboard.type('First prose.');
            await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await page.keyboard.type('Second prose.');
            await page.keyboard.press('Shift+Enter');
            await page.keyboard.type('A verse line.');
            await expect(page.locator('.chapter-body p.scene-break')).toHaveCount(1);
            await expect(page.locator('.chapter-body p.poetry')).toContainText('A verse line.');
            await page.keyboard.press(`${mod}+a`);
            await menu(app, ['Format', 'Align Paragraph', 'Center']);
            await expect.poll(() => page.locator('.chapter-body p:not(.scene-break)').evaluateAll(ps => ps.map(p => (p as HTMLElement).style.textAlign))).toEqual(['center', 'center', 'center']);
            expect(await page.locator('.chapter-body p.scene-break').evaluate(el => (el as HTMLElement).style.textAlign)).toBe('');
            await expect(page.locator('.chapter-body')).toContainText('First prose.');
            await expect(page.locator('.chapter-body')).toContainText('Second prose.');
            await expect(page.locator('.chapter-body p.poetry')).toContainText('A verse line.');
        }));
test('[NEO-184-A][NEO-185-A][NEO-186-A] visible book/chapter/selection counts respond to actual text and native selection', async () => fixture(engine, async (_app, page) => {
            await page.keyboard.type('Alpha beta gamma');
            await expect(page.locator('#word-counter')).toHaveText('3 words');
            await page.locator('#word-counter').click();
            await expect(page.locator('#word-counter')).toHaveText(/ch\. 1: 3 words/);
            await start(page);
            await page.keyboard.press(process.platform === 'darwin' ? 'Alt+Shift+ArrowRight' : 'Control+Shift+ArrowRight');
            await expect(page.locator('#word-counter')).toHaveText(/1 selected/);
            await page.keyboard.press('ArrowRight');
            await expect(page.locator('#word-counter')).toHaveText(/3 words/);
        }));
test('[NEO-213-B] fullscreen focus mode reveals the bottom bar for actual keyboard tab focus',async()=>{
            const c=await openEditingFixture(engine);try{
                const nativeFocus=await c.page.context().newCDPSession(c.page);await nativeFocus.send('Emulation.setFocusEmulationEnabled',{enabled:false});
                await c.app.evaluate(({BrowserWindow,app})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0].focus();});
                await expect.poll(()=>c.app.evaluate(({BrowserWindow})=>BrowserWindow.getFocusedWindow()?.id)).toBe(await c.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].id));
                await menu(c.app,['View','Full Screen']);await expect.poll(()=>c.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);await expect(c.page.locator('body')).toHaveClass(/full-screen/);
                await menu(c.app,['View','Focus Mode','Paragraph']);await expect(c.page.locator('body')).toHaveClass(/focus-mode/);await c.page.locator('.chapter-body').click();await c.page.mouse.move(500,200);
                await expect.poll(()=>c.page.locator('#bottombar').evaluate(el=>getComputedStyle(el).opacity)).toBe('0');
                await c.page.keyboard.press('F6');await c.page.keyboard.press('F6');await c.page.keyboard.press('F6');
                await expect(c.page.locator('.tab.active')).toBeFocused();expect(await c.page.locator('.tab.active').evaluate(el=>el.matches(':focus-visible'))).toBe(true);
                expect(await c.page.locator('#bottombar').evaluate(el=>el.matches(':hover')||el.classList.contains('attn'))).toBe(false);
                await expect.poll(()=>c.page.locator('#bottombar').evaluate(el=>getComputedStyle(el).opacity)).toBe(engine==='original'?'0':'1');
                await c.page.keyboard.press('Escape');await expect(c.page.locator('.chapter-body')).toBeFocused();await c.page.keyboard.press('Escape');await expect.poll(()=>c.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false);
                await expect(c.page.locator('#editor-view')).toBeVisible();await assertTexts(c.page,[['Alpha beta.','Gamma delta.']]);
            }finally{await c.close();}
        });
test('[NEO-215-A] shelf leave/reopen resumes real paragraph and letter with Unicode and saved metadata', async () => fixture(engine, async (_app, page, directory) => {
            await page.keyboard.insertText('A manuscript with școală and сердце.');
            await start(page);
            for (let i = 0; i < 14; i++)
                await page.keyboard.press('ArrowRight');
            const before = await caret(page);
            await page.locator('#back-to-shelf').click();
            await expect.poll(async () => (await meta(directory)).lastPosition?.off).toBe(14);
            await page.locator('.book').first().click();
            await expect.poll(async () => (await caret(page))?.before).toBe(before?.before);
            await expect(page.locator('.chapter-body').first()).toHaveText('A manuscript with școală and сердце.');
            await page.keyboard.type(' resumed');
            await expect(page.locator('.chapter-body').first()).toContainText(' resumed');
        }));
});
