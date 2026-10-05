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
test('[NEO-220-C] Vim backward edge refuses protected generated contents page and leaves author caret intact', async () => {
            const ctx = await openEditingFixture(engine, { chapters: ['<p>First chapter.</p>', '<p>Generated contents.</p>', '<p>Last chapter.</p>'], kinds: { 'ch-2': 'contents' }, library: { vimKeys: true } });
            try {
                const { page } = ctx;
                await expect(page.locator('.chapter-body').nth(1)).toBeHidden();
                expect(await page.locator('.chapter-body').nth(1).evaluate(el => (el as HTMLElement).isContentEditable)).toBe(false);
                await selectText(page, 2, 0, 0);
                await page.keyboard.press('Escape');
                await page.keyboard.press('k');
                await expect(page.locator('.chapter-body').nth(2)).toBeFocused();
                expect((await caretState(page))?.chapter).toBe(2);
                expect((await caretState(page))?.offset).toBe(0);
                await page.keyboard.press('{');
                await expect(page.locator('.chapter-body').nth(2)).toBeFocused();
                await expect(page.locator('.toc-list')).toBeVisible();
                await expect(page.locator('.chapter-body').nth(0)).toHaveText('First chapter.');
                await expect(page.locator('.chapter-body').nth(2)).toHaveText('Last chapter.');
            }
            finally {
                await ctx.close();
            }
        });
test('[NEO-221-B] Vim apostrophe underscore punctuation classes and cross-paragraph word edge preserve Unicode text', async () => {
            const ctx = await openEditingFixture(engine, { chapters: ["<p>Alpha_2 can't … beta</p><p>școală сердце.</p>"], library: { vimKeys: true } });
            try {
                const { page } = ctx;
                await selectText(page, 0, 0, 0);
                await page.keyboard.press('Escape');
                for (const expected of [8, 14, 16]) {
                    await page.keyboard.press('w');
                    expect((await caretState(page))?.offset).toBe(expected);
                }
                await page.keyboard.press('b');
                expect((await caretState(page))?.offset).toBe(14);
                await page.keyboard.press('b');
                expect((await caretState(page))?.offset).toBe(8);
                await page.keyboard.press('e');
                expect((await caretState(page))?.offset).toBe(12);
                await selectText(page, 0, 0, 16);
                await page.keyboard.press('w');
                expect((await caretState(page))?.paragraph).toBe(1);
                await page.keyboard.press('b');
                expect((await caretState(page))?.paragraph).toBe(0);
                await assertTexts(page, [["Alpha_2 can't … beta", 'școală сердце.']]);
            }
            finally {
                await ctx.close();
            }
        });
for (const [name, position, expected] of [['removed paragraph', { chapterId: 'ch-1', pIdx: 99, off: 4, scroll: 100 }, { chapter: 0, paragraph: 1, offset: 4 }], ['shortened text', { chapterId: 'ch-1', pIdx: 1, off: 99, scroll: 100 }, { chapter: 0, paragraph: 1, offset: 5 }], ['scroll-only', { chapterId: 'ch-1', scroll: 400 }, null]] as const)
            test(`[NEO-215-B] saved ${name} reading place clamps safely against current disk content`, async () => {
                const lines = expected ? ['First paragraph.', 'Short'] : ['First paragraph.', 'Short', ...Array.from({ length: 70 }, (_, i) => `Scroll paragraph ${i}.`)];
                const ctx = await openEditingFixture(engine, { chapters: [lines.map(text => `<p>${text}</p>`).join('')], metadata: { lastPosition: position } });
                try {
                    if (expected)
                        await expect.poll(async () => { const c = await caretState(ctx.page); return c && { chapter: c.chapter, paragraph: c.paragraph, offset: c.offset }; }).toEqual(expected);
                    else
                        await expect.poll(() => ctx.page.locator('#paper-scroll').evaluate(el => el.scrollTop)).toBe(400);
                    await assertTexts(ctx.page, [lines]);
                    if (expected) {
                        await ctx.page.keyboard.type('X');
                        await expect(ctx.page.locator('.chapter-body p').nth(1)).toContainText('X');
                    }
                }
                finally {
                    await ctx.close();
                }
            });
for (const side of ['nav', 'side'])
            test(`[NEO-198-B][NEO-299-B] ${side} pin/unpin at page zoom preserves visible manuscript caret and reading place`, async () => {
                const ctx = await openEditingFixture(engine, { chapters: [Array.from({ length: 60 }, (_, i) => `<p>Paragraph ${i} contains author prose.</p>`).join('')] });
                try {
                    const { page } = ctx;
                    await page.locator('#zoom-in').click();
                    await expect(page.locator('#zoom-level')).toHaveText('110%');
                    await page.locator('#paper-scroll').hover();
                    await page.mouse.wheel(0, 1000);
                    await expect.poll(() => page.locator('#paper-scroll').evaluate(el => el.scrollTop)).toBeGreaterThan(600);
                    const point = await page.locator('.chapter-body').evaluate(body => { const view = document.querySelector('#paper-scroll')!.getBoundingClientRect(); const p = Array.from(body.querySelectorAll('p')).find(p => { const r = p.getBoundingClientRect(); return r.top > view.top + 180 && r.bottom < view.bottom - 100; })!; const r = p.getBoundingClientRect(); return { x: r.left + 90, y: r.top + 12 }; });
                    await page.mouse.click(point.x, point.y);
                    const before = await caret(page);
                    const y = await page.evaluate(() => getSelection()!.getRangeAt(0).getBoundingClientRect().top);
                    const left = await page.locator('#paper-scroll').evaluate(el => el.getBoundingClientRect().left);
                    await page.mouse.move(side === 'nav' ? 1 : await page.evaluate(() => innerWidth - 1), 400);
                    await page.locator(`#${side}-pin`).click();
                    await expect(page.locator(`#${side}-pane`)).toHaveAttribute('data-pinned', '1');
                    await expect(page.locator(`#${side}-pin`)).toHaveAttribute('aria-pressed', 'true');
                    expect((await caret(page))?.before).toBe(before?.before);
                    expect(Math.abs(await page.evaluate(() => getSelection()!.getRangeAt(0).getBoundingClientRect().top) - y)).toBeLessThan(24);
                    expect(await page.locator('#paper-scroll').evaluate(el => el.getBoundingClientRect().left)).not.toBe(left);
                    await page.locator(`#${side}-pin`).click();
                    await expect(page.locator(`#${side}-pane`)).toHaveAttribute('data-pinned', '0');
                    await expect(page.locator(`#${side}-pin`)).toHaveAttribute('aria-pressed', 'false');
                    expect((await caret(page))?.before).toBe(before?.before);
                    expect(await page.evaluate(side => JSON.parse(localStorage.getItem('neo-pinned-panes') || '{}')[side], side)).toBe(false);
                    await expect(page.locator('.chapter-body')).toContainText('Paragraph 59');
                }
                finally {
                    await ctx.close();
                }
            });
test('[NEO-204-C][NEO-206-B] Ctrl wheel and native text size preserve visible caret anchor and persist zoom after debounce', async () => {
            const ctx = await openEditingFixture(engine, { chapters: [Array.from({ length: 60 }, (_, i) => `<p>Paragraph ${i} contains author prose and a reading anchor.</p>`).join('')] });
            try {
                const { page, app } = ctx;
                await page.locator('#paper-scroll').hover();
                await page.mouse.wheel(0, 1000);
                await expect.poll(() => page.locator('#paper-scroll').evaluate(el => el.scrollTop)).toBeGreaterThan(600);
                const point = await page.locator('.chapter-body').evaluate(body => { const view = document.querySelector('#paper-scroll')!.getBoundingClientRect(); const p = Array.from(body.querySelectorAll('p')).find(p => { const r = p.getBoundingClientRect(); return r.top > view.top + 160 && r.bottom < view.bottom - 100; })!; const r = p.getBoundingClientRect(); return { x: r.left + 90, y: r.top + 12 }; });
                await page.mouse.click(point.x, point.y);
                const before = await caret(page);
                const y = await page.evaluate(() => getSelection()!.getRangeAt(0).getBoundingClientRect().top);
                await menu(app, ['Format', 'Larger Text']);
                await expect.poll(() => css(page, '--editor-size')).toBe('18px');
                expect((await caret(page))?.before).toBe(before?.before);
                expect(Math.abs(await page.evaluate(() => getSelection()!.getRangeAt(0).getBoundingClientRect().top) - y)).toBeLessThan(3);
                await page.mouse.move(point.x, point.y);
                await page.keyboard.down('Control');
                await page.mouse.wheel(0, -40);
                await page.keyboard.up('Control');
                await expect.poll(async () => Number(await css(page, '--page-zoom'))).toBeGreaterThan(1);
                expect((await caret(page))?.before).toBe(before?.before);
                expect(Math.abs(await page.evaluate(() => getSelection()!.getRangeAt(0).getBoundingClientRect().top) - y)).toBeLessThan(3);
                const zoom = Number(await css(page, '--page-zoom'));
                expect(zoom).toBeCloseTo(Math.exp(.2), 3);
                await expect.poll(async () => (await library(ctx.directory)).pageZoom).toBeCloseTo(zoom, 3);
                await expect(page.locator('.chapter-body')).toContainText('Paragraph 59');
            }
            finally {
                await ctx.close();
            }
        });
test('[NEO-216-B] trusted question-mark help fallback remains singular and returns exact author caret',async()=>fixture(engine,async(app,page)=>{
          await page.keyboard.type('A help layout manuscript.');await selectText(page,0,0,7);const before=await caret(page);const modifiers=process.platform==='darwin'?['meta','shift']:['control','shift'];await nativeChord(app,'?',modifiers);await expect(page.locator('#keyboard-shortcuts')).toBeVisible();await expect(page.locator('#keyboard-shortcuts')).toHaveCount(1);await nativeChord(app,'?',modifiers);await expect(page.locator('#keyboard-shortcuts')).toHaveCount(1);await page.keyboard.press('Escape');await expect(page.locator('#keyboard-shortcuts')).toBeHidden();await expect(page.locator('.chapter-body')).toBeFocused();expect((await caret(page))?.before).toBe(before?.before);await expect(page.locator('.chapter-body')).toHaveText('A help layout manuscript.');
        }));
test('[NEO-187-B] actual mousewheel viewport chapter tracking updates locator/nav without moving focused author caret',async()=>{
          const lines=Array.from({length:24},(_,i)=>`<p>Author paragraph ${i} keeps the manuscript readable.</p>`).join('');const ctx=await openEditingFixture(engine,{chapters:[lines,lines,lines]});try{const {page}=ctx;await selectText(page,0,0,5);const before=await caretState(page);await page.locator('#paper-scroll').hover();let reached=false;for(let n=0;n<25&&!reached;n++){await page.mouse.wheel(0,150);await page.waitForTimeout(140);reached=await page.locator('.chapter').evaluateAll(chapters=>{const mid=innerHeight*.4;return chapters[1].getBoundingClientRect().top<mid&&chapters[2].getBoundingClientRect().top>=mid;});}expect(reached).toBe(true);await expect(page.locator('#pos-counter')).toHaveText('chapter 2 of 3');await expect(page.locator('.nav-item.current')).toHaveAttribute('data-id','ch-2');await expect(page.locator('.chapter-body').first()).toBeFocused();expect(await caretState(page)).toEqual(before);await expect(page.locator('.chapter-body').nth(1)).toContainText('Author paragraph 23');}finally{await ctx.close();}
        });
test('[NEO-203-B] dropcap suppression survives repeated first-paragraph caret movement and typing', async () => {
            const ctx = await openEditingFixture(engine, { chapters: ['<p>Mara opens the book.</p><p>Next paragraph.</p>'], library: { fonts: { body: 'Georgia', dropcap: 'literary' } } });
            try {
                const { page } = ctx;
                const body = page.locator('.chapter-body');
                const glyph = () => body.locator('p').first().evaluate(el => parseFloat(getComputedStyle(el, '::first-letter').fontSize));
                await selectText(page, 0, 0, 5);
                await expect(body).toHaveClass(/cap-off/);
                await expect.poll(glyph).toBe(17);
                for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft']) {
                    await page.keyboard.press(key);
                    await expect(body).toHaveClass(/cap-off/);
                    await expect.poll(glyph).toBe(17);
                }
                await page.keyboard.type('X');
                await expect(body).toHaveClass(/cap-off/);
                await expect.poll(glyph).toBe(17);
                await expect(body.locator('p').first()).toHaveText('Mara Xopens the book.');
                await selectText(page, 0, 1, 5);
                await expect(body).not.toHaveClass(/cap-off/);
                await expect.poll(glyph).toBeCloseTo(57.8, 1);
                await selectText(page, 0, 0, 0);
                await page.keyboard.press('ArrowRight');
                await expect(body).toHaveClass(/cap-off/);
                await expect.poll(glyph).toBe(17);
            }
            finally {
                await ctx.close();
            }
        });
for (const [command, expected] of [['i', ['AlXpha beta.']], ['a', ['AlpXha beta.']], ['I', ['XAlpha beta.']], ['A', ['Alpha beta.X']], ['o', ['Alpha beta.', 'X']], ['O', ['X', 'Alpha beta.']]] as const)
            test(`[NEO-226-B] Vim ${command} insertion command enters exact original paragraph/letter`, async () => {
                const ctx = await openEditingFixture(engine, { chapters: ['<p>Alpha beta.</p>'], library: { vimKeys: true } });
                try {
                    await selectText(ctx.page, 0, 0, 2);
                    await ctx.page.keyboard.press('Escape');
                    await expect(ctx.page.locator('body')).toHaveClass(/vim-nav/);
                    await ctx.page.keyboard.press(command);
                    await expect(ctx.page.locator('body')).not.toHaveClass(/vim-nav/);
                    await ctx.page.keyboard.type('X');
                    await assertTexts(ctx.page, [[...expected]]);
                    await expect(ctx.page.locator('.chapter-body p.poetry')).toHaveCount(0);
                }
                finally {
                    await ctx.close();
                }
            });
test('[NEO-220-B][NEO-224-A] Vim aliases, unknown keys, repeat Escape and count999 cap preserve actual prose', async () => {
            const ctx = await openEditingFixture(engine, { chapters: ['<p>' + ('A'.repeat(1100)) + '</p>'], library: { vimKeys: true } });
            try {
                const { page } = ctx;
                await selectText(page, 0, 0, 0);
                await page.keyboard.press('Escape');
                await page.keyboard.press('Space');
                expect((await caretState(page))?.offset).toBe(1);
                await page.keyboard.press('Backspace');
                expect((await caretState(page))?.offset).toBe(0);
                await page.keyboard.type('9999l');
                expect((await caretState(page))?.offset).toBe(999);
                await page.keyboard.press('q');
                expect((await caretState(page))?.offset).toBe(999);
                await page.keyboard.press('Escape');
                await page.keyboard.press('Escape');
                await expect(page.locator('#editor-view')).toBeVisible();
                await expect(page.locator('body')).toHaveClass(/vim-nav/);
                await page.keyboard.press('^');
                expect((await caretState(page))?.offset).toBeLessThan(999);
                await page.keyboard.press('G');
                expect((await caretState(page))?.offset).toBe(1100);
                await page.keyboard.type('gg');
                expect((await caretState(page))?.offset).toBe(0);
                await assertTexts(page, [['A'.repeat(1100)]]);
            }
            finally {
                await ctx.close();
            }
        });
test('[NEO-222-B] Vim sentence paragraph line aliases and chapter edges move live native selection', async () => {
            const ctx = await openEditingFixture(engine, { chapters: ['<p>First sentence. Second sentence.</p><p>Next paragraph.</p>', '<p>Last chapter.</p>'], library: { vimKeys: true } });
            try {
                const { page } = ctx;
                await selectText(page, 0, 0, 0);
                await page.keyboard.press('Escape');
                await page.keyboard.press(')');
                expect((await caretState(page))?.offset).toBeGreaterThan(0);
                const forward = (await caretState(page))!.offset;
                await page.keyboard.press('(');
                expect((await caretState(page))?.offset).toBeLessThan(forward);
                await page.keyboard.press('}');
                expect((await caretState(page))?.paragraph).toBe(1);
                await page.keyboard.press('{');
                expect((await caretState(page))?.paragraph).toBe(0);
                await page.keyboard.press('Enter');
                expect((await caretState(page))?.paragraph).toBe(1);
                await page.keyboard.press('k');
                expect((await caretState(page))?.paragraph).toBe(0);
                await selectText(page, 0, 1, 15);
                await page.keyboard.press('j');
                await expect(page.locator('.chapter-body').nth(1)).toBeFocused();
                expect((await caretState(page))?.chapter).toBe(1);
                await selectText(page, 1, 0, 0);
                await page.keyboard.press('k');
                await expect(page.locator('.chapter-body').first()).toBeFocused();
                expect((await caret(page))?.before).toBe('First sentence. Second sentence.Next paragraph.');
                await assertTexts(page, [['First sentence. Second sentence.', 'Next paragraph.'], ['Last chapter.']]);
            }
            finally {
                await ctx.close();
            }
        });
for (const cut of ['x', 'Delete'])
            test(`[NEO-227-B][NEO-228-A] Vim reverse selection yank, visual ${cut}, cancellation and native undo`, async () => {
                const ctx = await openEditingFixture(engine, { chapters: ['<p>Alpha beta gamma.</p>'], library: { vimKeys: true } });
                try {
                    const { page, app } = ctx;
                    await selectText(page, 0, 0, 5);
                    await page.keyboard.press('Escape');
                    await page.keyboard.type('v2hy');
                    await expect.poll(() => app.evaluate(async ({ clipboard }) => clipboard.readText())).toBe('ha');
                    expect((await caretState(page))?.offset).toBe(3);
                    await page.keyboard.press('d');
                    await assertTexts(page, [['Alpha beta gamma.']]);
                    await page.keyboard.type('v2l');
                    expect((await caret(page))?.selected).toBe('ha');
                    await page.keyboard.press('v');
                    expect((await caret(page))?.selected).toBe('');
                    await page.keyboard.type('v2h');
                    await page.keyboard.press('Escape');
                    expect((await caret(page))?.selected).toBe('');
                    await selectText(page, 0, 0, 0);
                    await page.keyboard.type('v2l');
                    await page.keyboard.press(cut);
                    await assertTexts(page, [['ha beta gamma.']]);
                    await page.keyboard.press(`${mod}+z`);
                    await assertTexts(page, [['Alpha beta gamma.']]);
                    await selectText(page, 0, 0, 0);
                    await page.keyboard.type('2');
                    await page.keyboard.press('Delete');
                    await assertTexts(page, [['pha beta gamma.']]);
                    await page.keyboard.press(`${mod}+z`);
                    await assertTexts(page, [['Alpha beta gamma.']]);
                }
                finally {
                    await ctx.close();
                }
            });
test('[NEO-229-B][NEO-219-A] disabling Vim clears normal visual state and native Notes IME commits author text', async () => fixture(engine, async (app, page) => {
            await page.keyboard.type('Manuscript.');
            await menu(app, ['View', 'Vim Keys']);
            await expect(page.locator('#hint')).toContainText('Vim keys on');
            await page.locator('.chapter-body').focus();
            await page.keyboard.press('Escape');
            await page.keyboard.type('v2h');
            await menu(app, ['View', 'Vim Keys']);
            await expect(page.locator('body')).not.toHaveClass(/vim-nav/);
            await expect.poll(() => menuChecked(app, ['View', 'Vim Keys'])).toBe(false);
            await page.locator('.chapter-body').focus();
            await page.keyboard.type('X');
            await expect(page.locator('.chapter-body')).toHaveText('ManuscripX');
            await page.locator('.tab[data-tab="notes"]').click();
            await page.locator('#aux-editor').click();
            await page.keyboard.type('Note');
            await menu(app, ['View', 'Vim Keys']);
            await expect(page.locator('#hint')).toContainText('Vim keys on');
            await page.locator('#aux-editor').focus();
            await page.keyboard.press('Escape');
            const session = await page.context().newCDPSession(page);
            await session.send('Input.imeSetComposition', { text: 'かな', selectionStart: 2, selectionEnd: 2 });
            await session.send('Input.insertText', { text: 'かな' });
            await session.detach();
            await expect(page.locator('#aux-editor')).toHaveText('Noteかな');
            await expect(page.locator('body')).toHaveClass(/vim-nav/);
            await page.keyboard.press('0');
            await page.keyboard.press('a');
            await page.keyboard.type('X');
            await expect(page.locator('#aux-editor')).toHaveText('NXoteかな');
        }));
for (const font of nativeFonts)
            test(`[NEO-201-B] ${font} preserves live mid-book caret and reading anchor`, async () => {
                const ctx = await openEditingFixture(engine, { chapters: [Array.from({ length: 70 }, (_, i) => `<p>Paragraph ${i} tells the story in a measured line.</p>`).join('')] });
                try {
                    const { page, app } = ctx;
                    await page.locator('#paper-scroll').hover();
                    await page.mouse.wheel(0, 1200);
                    await expect.poll(() => page.locator('#paper-scroll').evaluate(el => el.scrollTop)).toBeGreaterThan(600);
                    const point = await page.locator('.chapter-body').evaluate(body => { const box = document.querySelector('#paper-scroll')!.getBoundingClientRect(); const p = Array.from(body.querySelectorAll('p')).find(p => { const r = p.getBoundingClientRect(); return r.top > box.top + 150 && r.bottom < box.bottom - 100; })!; const r = p.getBoundingClientRect(); return { x: r.left + 110, y: r.top + 12 }; });
                    await page.mouse.click(point.x, point.y);
                    const before = await caret(page);
                    const y = await page.evaluate(() => getSelection()!.getRangeAt(0).getBoundingClientRect().top);
                    await menu(app, ['Format', 'Body Font', font]);
                    await expect.poll(() => css(page, '--body-font')).toContain(font);
                    await page.evaluate(() => document.fonts.ready);
                    expect((await caret(page))?.before).toBe(before?.before);
                    const after = await page.evaluate(() => getSelection()!.getRangeAt(0).getBoundingClientRect().top);
                    expect(Math.abs(after - y)).toBeLessThan(24);
                    await expect(page.locator('.chapter-body')).toContainText('Paragraph 69 tells the story');
                }
                finally {
                    await ctx.close();
                }
            });
test('[NEO-205-B] native Reset menu keeps Jost/interface150/caret while restoring page1/text17', async () => fixture(engine, async (app, page) => {
            await page.keyboard.type('Reset preserves the author reading place.');
            await menu(app, ['Format', 'Body Font', 'Jost']);
            await expect.poll(() => css(page, '--body-font')).toContain('Jost');
            await menu(app, ['View', 'Interface Size', '150%']);
            await expect.poll(() => css(page, '--ui-zoom')).toBe('1.5');
            await menu(app, ['Format', 'Larger Text']);
            await expect.poll(() => css(page, '--editor-size')).toBe('18px');
            await page.locator('#zoom-in').click();
            await expect(page.locator('#zoom-level')).toHaveText('110%');
            await page.locator('.chapter-body').click();
            const before = await caret(page);
            await menu(app, ['Format', 'Reset Text Size']);
            await expect.poll(() => css(page, '--editor-size')).toBe('17px');
            expect(await css(page, '--page-zoom')).toBe('1');
            expect(await css(page, '--ui-zoom')).toBe('1.5');
            expect(await css(page, '--body-font')).toContain('Jost');
            expect((await caret(page))?.before).toBe(before?.before);
            await expect(page.locator('.chapter-body')).toHaveText('Reset preserves the author reading place.');
        }));
test('[NEO-285-A] enlarged interface keeps page glyph size and keyboard-accessible controls/dialog in viewport', async () => fixture(engine, async (app, page) => {
            await page.keyboard.type('Readable page at enlarged interface.');
            const size = await page.locator('.chapter-body').first().evaluate(el => getComputedStyle(el).fontSize);
            await menu(app, ['View', 'Interface Size', '300%']);
            await expect.poll(() => css(page, '--ui-zoom')).toBe('3');
            expect(await page.locator('.chapter-body').first().evaluate(el => getComputedStyle(el).fontSize)).toBe(size);
            await page.keyboard.press('F6');
            await expect(page.locator('.n-row').first()).toBeFocused();
            await page.keyboard.press('Escape');
            await expect(page.locator('.chapter-body').first()).toBeFocused();
            await page.keyboard.press(`${mod}+/`);
            await expect(page.locator('#keyboard-shortcuts')).toBeVisible();
            const box = await page.locator('.shortcuts-modal').evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
            expect(box.left).toBeGreaterThanOrEqual(0);
            expect(box.right).toBeLessThanOrEqual(box.width);
            expect(box.top).toBeGreaterThanOrEqual(0);
            expect(box.bottom).toBeLessThanOrEqual(box.height);
            await page.keyboard.press('Escape');
            await expect(page.locator('.chapter-body').first()).toHaveText('Readable page at enlarged interface.');
        }));
test('[NEO-210-A][NEO-211-A][NEO-274-A] paragraph/sentence/off focus tracks real caret without changing prose', async () => fixture(engine, async (app, page, directory) => {
            const text = 'First sentence. Second sentence.';
            await page.keyboard.type(text);
            await menu(app, ['View', 'Focus Mode', 'Paragraph']);
            await expect.poll(() => page.evaluate(() => Array.from(CSS.highlights.get('neo-focus') || []).map(r => r.toString()))).toEqual([text]);
            await expect.poll(() => menuChecked(app, ['View', 'Focus Mode', 'Paragraph'])).toBe(true);
            await menu(app, ['View', 'Focus Mode', 'Sentence']);
            await expect.poll(() => page.evaluate(() => Array.from(CSS.highlights.get('neo-focus') || []).map(r => r.toString()))).toEqual(['Second sentence.']);
            await expect.poll(() => menuChecked(app, ['View', 'Focus Mode', 'Sentence'])).toBe(true);
            await start(page);
            await expect.poll(() => page.evaluate(() => Array.from(CSS.highlights.get('neo-focus') || []).map(r => r.toString()))).toEqual(['First sentence.']);
            await menu(app, ['View', 'Focus Mode', 'Off']);
            await expect.poll(()=>page.evaluate(()=>CSS.highlights.has('neo-focus'))).toBe(false);
            await expect.poll(() => menuChecked(app, ['View', 'Focus Mode', 'Off'])).toBe(true);
            await expect(page.locator('.chapter-body').first()).toHaveText(text);
            await expect.poll(async () => (await library(directory)).focus).toBe('off');
        }));
test('[NEO-278-A][NEO-279-A][NEO-280-A][NEO-281-A][NEO-282-A] keyboard regions, tab focus and Escape return to actual editing caret', async () => fixture(engine, async (_app, page) => {
            await page.keyboard.type('Keyboard regions.');
            await page.keyboard.press('F6');
            await expect(page.locator('#nav-pane')).toHaveClass(/open/);
            await expect(page.locator('.n-row').first()).toBeFocused();
            await page.keyboard.press('F6');
            await expect(page.locator('#side-pin')).toBeFocused();
            await page.keyboard.press('F6');
            await expect(page.locator('.tab.active')).toBeFocused();
            await page.keyboard.press('Escape');
            await expect(page.locator('.chapter-body').first()).toBeFocused();
            await page.keyboard.press('F6');
            await page.keyboard.press('F6');
            await page.keyboard.press('F6');
            await page.keyboard.press('ArrowRight');
            await expect(page.locator('.tab[data-tab="notes"]')).toBeFocused();
            await page.keyboard.press('Enter');
            await expect(page.locator('.tab[data-tab="notes"]')).toHaveAttribute('aria-selected', 'true');
            await page.locator('.tab[data-tab="manuscript"]').focus();
            await page.keyboard.press('ArrowLeft');
            await expect(page.locator('.tab[data-tab="darlings"]')).toBeFocused();
            await page.keyboard.press('ArrowRight');
            await expect(page.locator('.tab[data-tab="manuscript"]')).toBeFocused();
            await page.keyboard.press('Space');
            await expect(page.locator('.tab[data-tab="manuscript"]')).toHaveAttribute('aria-selected', 'true');
            await page.locator('.chapter-body').first().click();
            await page.keyboard.type(' More.');
            await expect(page.locator('.chapter-body').first()).toContainText(' More.');
        }));
test('[NEO-209-A] typewriter centers live keyboard caret, reserves last-line room and respects mouse reading', async () => fixture(engine, async (app, page) => {
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.keyboard.type('A long manuscript begins.');
            for (let i = 0; i < 30; i++) {
                await page.keyboard.press('Enter');
                await page.keyboard.type(`Paragraph ${i} keeps a long manuscript on the page.`);
            }
            await menu(app, ['Format', 'Typewriter Scrolling']);
            await expect(page.locator('body')).toHaveClass(/typewriter/);
            await page.keyboard.type(' More');
            await expect.poll(() => page.evaluate(() => { const selection = getSelection(); const rect = selection?.getRangeAt(0).getBoundingClientRect(); return rect ? Math.abs(rect.top - innerHeight * .45) : 999; })).toBeLessThan(65);
            expect(await page.locator('#paper').evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue('--typewriter-room')))).toBeGreaterThanOrEqual(120);
            await page.locator('#paper-scroll').hover();
            const wheelBefore = await page.locator('#paper-scroll').evaluate(el => el.scrollTop);
            await page.mouse.wheel(0, -100);
            await expect.poll(() => page.locator('#paper-scroll').evaluate(el => el.scrollTop)).toBeLessThan(wheelBefore - 50);
            const before = await page.locator('#paper-scroll').evaluate(el => el.scrollTop);
            await page.locator('.chapter-body p').last().click();
            const after = await page.locator('#paper-scroll').evaluate(el => el.scrollTop);
            expect(Math.abs(after - before)).toBeLessThan(2);
            await expect(page.locator('.chapter-body').first()).toContainText('More');
        }));
test('[NEO-219-A][NEO-220-A][NEO-221-A][NEO-222-A][NEO-224-A] Vim modes, counted words and line motions use the live caret', async () => fixture(engine, async (app, page) => {
            const text = 'Alpha beta gamma delta.';
            await page.keyboard.type(text);
            await start(page);
            await menu(app, ['View', 'Vim Keys']);
            await expect(page.locator('#hint')).toContainText('Vim keys on');
            await page.locator('.chapter-body').first().focus();
            await page.keyboard.press('Escape');
            await expect(page.locator('body')).toHaveClass(/vim-nav/);
            await page.keyboard.press('l');
            expect((await caret(page))?.before).toBe('A');
            await page.keyboard.press('h');
            expect((await caret(page))?.before).toBe('');
            await page.keyboard.type('2w');
            expect((await caret(page))?.before).toBe('Alpha beta ');
            await page.keyboard.press('b');
            expect((await caret(page))?.before).toBe('Alpha ');
            await page.keyboard.press('e');
            expect((await caret(page))?.before).toBe('Alpha bet');
            await page.keyboard.press('$');
            expect((await caret(page))?.before).toBe(text);
            await page.keyboard.press('0');
            expect((await caret(page))?.before).toBe('');
            await page.keyboard.press('Escape');
            await expect(page.locator('#editor-view')).toBeVisible();
            await page.keyboard.press('i');
            await page.keyboard.type('New ');
            await expect(page.locator('.chapter-body').first()).toHaveText('New ' + text);
        }));
test('[NEO-187-A][NEO-223-A][NEO-225-A] Vim chapter pairs and half-page scrolling preserve document and move real caret', async () => fixture(engine, async (app, page) => {
            await page.keyboard.type('First chapter.');
            await page.mouse.move(1, 400);
            await page.locator('#nav-add').click();
            await page.keyboard.type('Second chapter.');
            await page.mouse.move(1, 400);
            await page.locator('#nav-add').click();
            await page.keyboard.type('Third chapter.');
            for (let i = 0; i < 24; i++) {
                await page.keyboard.press('Enter');
                await page.keyboard.type(`A line of the third chapter ${i}.`);
            }
            await menu(app, ['View', 'Vim Keys']);
            await expect(page.locator('#hint')).toContainText('Vim keys on');
            await page.locator('.chapter-body').last().focus();
            await page.keyboard.press('Escape');
            await page.keyboard.type('[[');
            await expect(page.locator('.chapter-body').nth(1)).toBeFocused();
            await expect(page.locator('#pos-counter')).toHaveText('chapter 2 of 3');
            await page.keyboard.type('[[');
            await expect(page.locator('.chapter-body').first()).toBeFocused();
            await expect(page.locator('#pos-counter')).toHaveText('chapter 1 of 3');
            await page.keyboard.type('2]]');
            await expect(page.locator('.chapter-body').nth(1)).toBeFocused();
            await expect(page.locator('#pos-counter')).toHaveText('chapter 2 of 3');
            await page.keyboard.type(']]');
            await expect(page.locator('.chapter-body').last()).toBeFocused();
            await settlePaperScroll(page);await spyNativeViewportWrites(page);await page.keyboard.type('gg');
            const motionProof:any={ggImmediate:await halfPageSnapshot(page)};
            await settlePaperScroll(page);motionProof.ggSettled=await halfPageSnapshot(page);await spyHalfPageHitTests(page);
            const before = await page.locator('#paper-scroll').evaluate(el => el.scrollTop);
            await page.keyboard.press('Control+d');motionProof.downImmediate=await halfPageSnapshot(page);motionProof.downHit=await halfPageProof(page);
            await expect.poll(() => page.locator('#paper-scroll').evaluate(el => el.scrollTop)).toBeGreaterThan(before + 100);
            await settlePaperScroll(page);motionProof.downSettled=await halfPageSnapshot(page);
            await page.keyboard.press('Control+u');motionProof.upImmediate=await halfPageSnapshot(page);motionProof.upHit=await halfPageProof(page);
            await expect.poll(() => page.locator('#paper-scroll').evaluate(el => el.scrollTop)).toBeLessThan(before + 50);
            await settlePaperScroll(page);motionProof.upSettled=await halfPageSnapshot(page);await restoreHalfPageHitTests(page);motionProof.nativeSelectionWrites=await finishNativeViewportWrites(page);
            await test.info().attach('half-page-motion-timeline',{body:JSON.stringify(motionProof,null,2),contentType:'application/json'});
            const halfPageGeometry=await page.evaluate(()=>{
              const scroll=document.querySelector('#paper-scroll')!,selection=getSelection()!,range=selection.getRangeAt(0);
              const rect=(value:DOMRect)=>({top:value.top,bottom:value.bottom,left:value.left,right:value.right,width:value.width,height:value.height});
              const describe=(node:Node|null)=>node?{type:node.nodeType,name:node.nodeName,text:(node.textContent||'').slice(0,120)}:null;
              const adjacent=(direction:'before'|'after')=>{
                let node=range.startContainer,offset=range.startOffset;
                if(node.nodeType!==Node.TEXT_NODE){
                  const child=node.childNodes[direction==='before'?offset-1:offset];if(!child)return null;
                  const walker=document.createTreeWalker(child,NodeFilter.SHOW_TEXT);const texts:Node[]=[];
                  if(child.nodeType===Node.TEXT_NODE)texts.push(child);while(walker.nextNode())texts.push(walker.currentNode);
                  const nonempty=texts.filter(n=>n.textContent?.length);node=direction==='before'?nonempty[nonempty.length-1]:nonempty[0];if(!node)return null;
                  offset=direction==='before'?node.textContent!.length:0;
                }
                const start=direction==='before'?offset-1:offset;if(start<0||start>=node.textContent!.length)return null;
                const glyph=document.createRange();glyph.setStart(node,start);glyph.setEnd(node,start+1);
                return{node:describe(node),start,rect:rect(glyph.getBoundingClientRect())};
              };
              const viewport=scroll.getBoundingClientRect(),caret=range.getBoundingClientRect();
              return{viewport:rect(viewport),scrollTop:scroll.scrollTop,container:describe(range.startContainer),offset:range.startOffset,end:describe(range.endContainer),endOffset:range.endOffset,collapsed:range.collapsed,anchor:describe(selection.anchorNode),anchorOffset:selection.anchorOffset,focus:describe(selection.focusNode),focusOffset:selection.focusOffset,rangeRect:rect(caret),adjacentBefore:adjacent('before'),adjacentAfter:adjacent('after'),distance:Math.abs(caret.top-(viewport.top+viewport.height/2))};
            });
            await test.info().attach('half-page-caret-geometry',{body:JSON.stringify(halfPageGeometry,null,2),contentType:'application/json'});
            expect(halfPageGeometry.distance).toBeLessThan(40);
            const nativeBefore=await page.locator('.chapter-body').last().textContent();await page.keyboard.press(`${mod}+z`);await expect.poll(()=>page.locator('.chapter-body').last().textContent()).not.toBe(nativeBefore);await page.keyboard.press(`${mod}+Shift+z`);await expect.poll(()=>page.locator('.chapter-body').last().textContent()).toBe(nativeBefore);
            await expect(page.locator('.chapter-body').first()).toHaveText('First chapter.');
            await expect(page.locator('.chapter-body').nth(1)).toHaveText('Second chapter.');
            await expect(page.locator('.chapter-body').last()).toContainText('Third chapter.');
        }));
for(const variant of ['short','long'] as const)test(`[NEO-225-B] rapid ${variant} manuscript half-page keys preserve actual midpoint hit or source noneditor guard`,async()=>{
            const paragraphs=variant==='short'?['Short author prose.']:Array.from({length:50},(_,i)=>`Author line ${i} has unchanged prose.`);
            const ctx=await openEditingFixture(engine,{chapters:[paragraphs.map(text=>`<p>${text}</p>`).join('')],library:{vimKeys:true}});
            try{
                await selectText(ctx.page,0,0,0);await ctx.page.keyboard.press('Escape');await expect(ctx.page.locator('body')).toHaveClass(/vim-nav/);await settlePaperScroll(ctx.page);await spyHalfPageHitTests(ctx.page);
                for(const [index,key]of ['Control+d','Control+u'].entries()){
                    await ctx.page.keyboard.press(key);const proof=await halfPageProof(ctx.page);expect(proof.hits).toHaveLength(index+1);
                    const latest=proof.hits[index];expect(proof.current).toEqual(latest.hit??latest.before);
                    await test.info().attach(`rapid-halfpage-${variant}-${index}`,{body:JSON.stringify(proof,null,2),contentType:'application/json'});
                }
                await assertTexts(ctx.page,[paragraphs]);
            }finally{try{await restoreHalfPageHitTests(ctx.page);}finally{await ctx.close();}}
        });
test('[NEO-227-A] Vim visual inclusive yank/cut touches the real OS clipboard and undo restores prose', async () => fixture(engine, async (app, page) => {
            await page.keyboard.type('Alpha beta gamma.');
            await start(page);
            await menu(app, ['View', 'Vim Keys']);
            await expect(page.locator('#hint')).toContainText('Vim keys on');
            await page.locator('.chapter-body').first().focus();
            await page.keyboard.press('Escape');
            await page.keyboard.type('v2ly');
            await expect.poll(() => app.evaluate(async ({ clipboard }) => clipboard.readText())).toBe('Alp');
            await expect(page.locator('.chapter-body').first()).toHaveText('Alpha beta gamma.');
            expect((await caret(page))?.before).toBe('');
            await page.keyboard.type('v2ld');
            await expect.poll(() => app.evaluate(async ({ clipboard }) => clipboard.readText())).toBe('Alp');
            await expect(page.locator('.chapter-body').first()).toHaveText('ha beta gamma.');
            await page.keyboard.press(`${mod}+z`);
            await expect(page.locator('.chapter-body').first()).toHaveText('Alpha beta gamma.');
        }));
test('[NEO-226-A][NEO-228-A][NEO-229-A] Vim insertion, deletion undo and search work in manuscript and Notes', async () => fixture(engine, async (app, page) => {
            await page.keyboard.type('Alpha beta.');
            await start(page);
            await menu(app, ['View', 'Vim Keys']);
            await expect(page.locator('#hint')).toContainText('Vim keys on');
            await page.locator('.chapter-body').first().focus();
            await page.keyboard.press('Escape');
            await page.keyboard.press('x');
            await expect(page.locator('.chapter-body').first()).toHaveText('lpha beta.');
            await page.keyboard.press(`${mod}+z`);
            await expect(page.locator('.chapter-body').first()).toHaveText('Alpha beta.');
            await page.keyboard.press('A');
            await page.keyboard.type(' Tail.');
            await expect(page.locator('.chapter-body').first()).toHaveText('Alpha beta. Tail.');
            await page.keyboard.press('Escape');
            await page.keyboard.press('/');
            await expect(page.locator('#searchbar')).toBeVisible();
            await page.keyboard.press('Escape');
            await page.locator('.tab[data-tab="notes"]').click();
            await page.locator('#aux-editor').click();
            await page.keyboard.type('Note words');
            await page.keyboard.press('Escape');
            await page.keyboard.press('0');
            await page.keyboard.press('a');
            await page.keyboard.type('X');
            await expect(page.locator('#aux-editor')).toHaveText('NXote words');
        }));
});
