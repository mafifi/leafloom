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
for (const engine of engines)
    test.describe(engine, () => {
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
        test('[NEO-216-B] trusted question-mark help fallback remains singular and returns exact author caret',async()=>fixture(engine,async(app,page)=>{
          await page.keyboard.type('A help layout manuscript.');await selectText(page,0,0,7);const before=await caret(page);const modifiers=process.platform==='darwin'?['meta','shift']:['control','shift'];await nativeChord(app,'?',modifiers);await expect(page.locator('#keyboard-shortcuts')).toBeVisible();await expect(page.locator('#keyboard-shortcuts')).toHaveCount(1);await nativeChord(app,'?',modifiers);await expect(page.locator('#keyboard-shortcuts')).toHaveCount(1);await page.keyboard.press('Escape');await expect(page.locator('#keyboard-shortcuts')).toBeHidden();await expect(page.locator('.chapter-body')).toBeFocused();expect((await caret(page))?.before).toBe(before?.before);await expect(page.locator('.chapter-body')).toHaveText('A help layout manuscript.');
        }));
        for(const state of ['current','unavailable','release'] as const)test(`[NEO-271-B][NEO-272-B] actual source manual update ${state} response owns one native dialog and preserves pending draft`,async()=>{
          const directory=await createReferenceDirectory();let app:ElectronApplication|undefined;try{const release='https://github.com/hughhowey/neo/releases/tag/v999.9.9';await writeFile(path.join(directory,'.neo-parity-host.json'),JSON.stringify({httpResponses:[{match:'api.github.com',status:state==='unavailable'?503:200,body:{tag_name:state==='current'?'v0.0.0':'v999.9.9',html_url:release}}]}));app=await launchReference(directory,engine==='prosemirror'?'prosemirror':undefined);const page=await app.firstWindow();await fresh(page);await page.keyboard.type('A pending update draft.');await menu(app,['Help','Check for Update…']);const dialog=page.locator('.modal-backdrop:visible .modal');await expect(dialog).toHaveCount(1);await expect(dialog).toHaveAttribute('role','dialog');await expect(dialog).toHaveAttribute('aria-modal','true');if(state==='current'){await expect(dialog.locator('h2')).toHaveText('NEO is up to date');const version=await app.evaluate(({app})=>app.getVersion());await expect(dialog.locator('.up-text')).toHaveText(`You have ${version}.`);}else if(state==='unavailable')await expect(dialog.locator('h2')).toHaveText('Couldn’t check for updates — try again later');else{await expect(dialog.locator('h2')).toHaveText('NEO 999.9.9 is available');await expect(dialog.locator('.m-ok')).toHaveText('View Release');await expect(dialog.locator('.up-bar')).toBeHidden();}await menu(app,['Help','Check for Update…']);await expect(dialog).toHaveCount(1);if(state==='release'){await dialog.locator('.m-ok').click();await expect.poll(async()=>JSON.parse(await readFile(path.join(directory,'intercepted-effects.json'),'utf8')).some((e:{type:string;payload:string})=>e.type==='external-url'&&e.payload===release)).toBe(true);}else await page.keyboard.press('Enter');await expect(page.locator('.modal-backdrop:visible')).toHaveCount(0);await expect(page.locator('.chapter-body')).toHaveText('A pending update draft.');await page.locator('#back-to-shelf').click();const book=(await meta(directory)).id;expect(await readFile(path.join(directory,'Documents','NEO Library',book,'chapters',(await meta(directory)).chapterOrder[0]+'.html'),'utf8')).toContain('A pending update draft.');}finally{await app?.close();await removeReferenceDirectory(directory);}
        });
        test('[NEO-197-B] native window blur closes unpinned notes pane while newly edited real sticky persists',async()=>{
          const ctx=await openEditingFixture(engine,{chapters:['<p>Author <span class="ph-mark" data-sid="flag" contenteditable="false">⚑</span> prose.</p>'],stickies:[{id:'flag',chapterId:'ch-1',text:'Existing note.',resolved:false}]});try{const {app,page}=ctx;const nativeFocus=await page.context().newCDPSession(page);await nativeFocus.send('Emulation.setFocusEmulationEnabled',{enabled:false});await page.mouse.move(await page.evaluate(()=>innerWidth-1),400);await expect(page.locator('#side-pane')).toHaveClass(/open/);await page.locator('#sticky-list textarea').fill('New note retained through blur.');await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0].focus();});await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused())).toBe(true);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].blur());await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFocused())).toBe(false);await expect.poll(()=>page.evaluate(()=>document.hasFocus())).toBe(false);await expect(page.locator('#side-pane')).not.toHaveClass(/open/);await expect.poll(async()=>JSON.parse(await readFile(path.join(ctx.bookdir,'stickies.json'),'utf8'))[0].text).toBe('New note retained through blur.');await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0].focus();});await page.mouse.move(await page.evaluate(()=>innerWidth-1),400);await expect(page.locator('#side-pane')).toHaveClass(/open/);await expect(page.locator('#sticky-list textarea')).toHaveValue('New note retained through blur.');await expect(page.locator('.chapter-body')).toHaveText('Author ⚑ prose.');}finally{await ctx.close();}
        });
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
