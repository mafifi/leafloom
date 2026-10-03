import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { readFile, readdir, unlink, mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {nativeChord} from './editing-helpers';
import { createReferenceDirectory, launchReference, removeReferenceDirectory } from '../reference/harness';
type Engine = 'original' | 'prosemirror';
const engines: Engine[] = process.env.NEO_SPELL_ENGINE ? [process.env.NEO_SPELL_ENGINE as Engine] : ['original', 'prosemirror'];
const languages = [
    ['en-US', 'English (US)', 'hello'], ['en-GB', 'English (UK)', 'colour'], ['en-CA', 'English (Canada)', 'colour'], ['en-AU', 'English (Australia)', 'colour'],
    ['fr', 'Français', 'bonjour'], ['es', 'Español', 'hola'], ['de', 'Deutsch', 'Haus'], ['nl', 'Nederlands', 'huis'], ['pl', 'Polski', 'dom'],
    ['pt-BR', 'Português (Brasil)', 'coração'], ['ro', 'Română', 'școală'], ['ru', 'Русский', 'дом'], ['el', 'Ελληνικά', 'σπίτι'],
] as const;
const wrong = 'qzxxqzxxqz';
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const libraryFile = (directory: string) => path.join(directory, 'Documents', 'NEO Library', 'library.json');
async function library(directory: string) { return JSON.parse(await readFile(libraryFile(directory), 'utf8')); }
async function menu(app: ElectronApplication, labels: string[]) {
    await app.evaluate(({ Menu, BrowserWindow }, labels) => {
        let items = Menu.getApplicationMenu()?.items;
        let item: Electron.MenuItem | undefined;
        for (const label of labels) {
            item = items?.find(candidate => candidate.label.replace(/&/g, '') === label);
            if (!item)
                throw new Error(`Missing menu ${labels.join(' / ')}`);
            items = item.submenu?.items;
        }
        item!.click(item!, BrowserWindow.getFocusedWindow() ?? undefined, {} as Electron.KeyboardEvent);
    }, labels);
}
async function checkedLanguage(app: ElectronApplication) {
    return app.evaluate(({ Menu }) => { const scan = (items: Electron.MenuItem[]): string[] | undefined => { for (const item of items) {
        const children = item.submenu?.items;
        if (children?.some(child => child.label === 'English (US)'))
            return children.filter(child => child.checked).map(child => child.label);
        if (children) {
            const result = scan(children);
            if (result)
                return result;
        }
    } }; return scan(Menu.getApplicationMenu()?.items || []); });
}
async function freshBook(page: Page) {
    await page.locator('#fr-name').fill('Spelling Writer');
    await page.locator('.fr-choice[data-style="pantser"]').click();
    await page.locator('#fr-done').click();
    await page.locator('.new-book').first().click();
    await page.locator('#tp-title').click();
    await page.keyboard.type('Spelling manuscript');
    await page.keyboard.press('Enter');
    await page.locator('.chapter-body').first().click();
}
async function highlights(page: Page): Promise<string[]> {
    return page.evaluate(() => Array.from(CSS.highlights.get('neo-spell') ?? []).map(range => range.toString()).sort());
}
async function ready(page: Page) {
    await expect.poll(async () => page.evaluate(async (words) => (window as any).neo.spellCheckWords(words), ['hello', wrong])).toEqual({ hello: true, [wrong]: false });
}
async function rightClickWord(page: Page, word: string, root = '.chapter-body') {
    const point = await page.locator(root).first().evaluate((host, word) => {
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
            const index = node.textContent!.indexOf(word);
            if (index < 0)
                continue;
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + word.length);
            const box = range.getBoundingClientRect();
            return { x: box.x + Math.min(8, box.width / 2), y: box.y + box.height / 2 };
        }
        throw new Error(`No rendered word ${word}`);
    }, word);
    await page.mouse.click(point.x, point.y, { button: 'right' });
}
async function fixture(engine: Engine, action: (app: ElectronApplication, page: Page, directory: string) => Promise<void>) {
    const directory = await createReferenceDirectory();
    let app: ElectronApplication | undefined;
    try {
        app = await launchReference(directory, engine === 'prosemirror' ? 'prosemirror' : undefined);
        const page = await app.firstWindow();
        await freshBook(page);
        await ready(page);
        await action(app, page, directory);
    }
    finally {
        await app?.close();
        await removeReferenceDirectory(directory);
    }
}
for (const engine of engines) {
    test.describe(engine, () => {
        for (const [locale, code] of [['en', 'en-US'], ['fr', 'fr'], ['fr-CA', 'fr'], ['es', 'es'], ['de', 'de'], ['it', 'en-US'], ['nl', 'nl'], ['pl', 'pl'], ['pt', 'pt-BR'], ['pt-PT', 'en-US'], ['ro', 'ro'], ['ru', 'ru'], ['el', 'el'], ['tr', 'en-US']])
            test(`[NEO-301-A] interface ${locale} supplies ${code} default without saving a dictionary choice`, async () => {
                const directory = await createReferenceDirectory();
                let app: ElectronApplication | undefined;
                try {
                    await mkdir(path.join(directory, 'userData'));
                    await writeFile(path.join(directory, 'userData', 'settings.json'), JSON.stringify({ uiLanguage: locale, libraryDir: path.join(directory, 'Documents', 'NEO Library') }));
                    app = await launchReference(directory, engine === 'prosemirror' ? 'prosemirror' : undefined);
                    const page = await app.firstWindow();
                    await freshBook(page);
                    const entry = languages.find(language => language[0] === code)!;
                    expect(await checkedLanguage(app)).toEqual([entry[1]]);
                    await expect.poll(() => page.evaluate(async (words) => (window as any).neo.spellCheckWords(words), [entry[2], wrong])).toEqual({ [entry[2]]: true, [wrong]: false });
                    await page.keyboard.insertText(`${entry[2]} ${wrong}`);
                    expect(await highlights(page)).toEqual([]);
                    expect((await library(directory)).spellLanguage).toBeUndefined();
                    const styles:Record<string,[string,string]>={fr:['«\u202f','\u202f»'],'fr-CA':['«\u202f','\u202f»'],es:['«','»'],de:['„','“'],it:['«','»'],pl:['„','”'],'pt-PT':['«','»'],ro:['„','”'],ru:['«','»'],el:['«','»']};const [open,close]=styles[locale]??['“','”'];await page.keyboard.type(' "Hello"');expect(await page.locator('.chapter-body').textContent()).toBe(`${entry[2]} ${wrong} ${open}Hello${close}`);expect(await highlights(page)).toEqual([]);expect((await library(directory)).spellLanguage).toBeUndefined();
                }
                finally {
                    await app?.close();
                    await removeReferenceDirectory(directory);
                }
            });
        test('[NEO-301-A] explicit dictionary survives actual interface language reload and preserves words', async () => {
            await fixture(engine, async (app, page, directory) => {
                await menu(app, ['Edit', 'Spellcheck Language', 'English (UK)']);
                await expect.poll(async () => (await library(directory)).spellLanguage).toBe('en-GB');
                await page.keyboard.type('colour remains on the page');
                await menu(app, ['View', 'Language', 'Français']);
                await expect.poll(() => page.evaluate(() => (window as any).neo.i18n.locale)).toBe('fr');
                await expect(page.locator('#bookshelf-view')).toBeVisible();
                await page.locator('.book').first().click();
                await expect(page.locator('.chapter-body').first()).toContainText('colour remains on the page');
                expect(await checkedLanguage(app)).toEqual(['English (UK)']);
                expect((await library(directory)).spellLanguage).toBe('en-GB');
                expect(await page.evaluate(async () => (window as any).neo.spellCheckWords(['colour']))).toEqual({ colour: true });
            });
        });
        for (const [code, label, valid] of languages)
            test(`[NEO-178-A] real Hunspell language ${code}, visible pass and persisted menu choice`, async () => {
                await fixture(engine, async (app, page, directory) => {
                    await menu(app, ['Edit', 'Spellcheck Language', label]);
                    await expect.poll(async () => (await library(directory)).spellLanguage).toBe(code);
                    expect(await checkedLanguage(app)).toEqual([label]);
                    await page.keyboard.type(`${valid} ${wrong}`);
                    await expect.poll(() => highlights(page)).toEqual([]);
                    await menu(app, ['Edit', 'Spellcheck Pass']);
                    await expect.poll(() => highlights(page)).toEqual([wrong]);
                    expect(await page.evaluate(async (words) => (window as any).neo.spellCheckWords(words), [valid, wrong])).toEqual({ [valid]: true, [wrong]: false });
                });
            });
        test('[NEO-169-A][NEO-170-A][NEO-175-A][NEO-176-A] opt-in suggestions, correction styling, Undo and off clears menu', async () => {
            await fixture(engine, async (app, page) => {
                await page.keyboard.press(`${mod}+i`);
                await page.keyboard.type('helo');
                await page.keyboard.press(`${mod}+i`);
                await expect(page.locator('.chapter-body i, .chapter-body em')).toContainText('helo');
                expect(await highlights(page)).toEqual([]);
                expect(await page.locator('.chapter-body').first().getAttribute('spellcheck')).toBe('false');
                await menu(app, ['Edit', 'Spellcheck Pass']);
                await expect.poll(() => highlights(page)).toEqual(['helo']);
                await rightClickWord(page, 'helo');
                await expect(page.locator('.spell-menu')).toBeVisible();
                expect(await page.locator('.spell-menu button').count()).toBeLessThanOrEqual(7);
                const bounds = await page.locator('.spell-menu').evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
                expect(bounds.left).toBeGreaterThanOrEqual(0);
                expect(bounds.top).toBeGreaterThanOrEqual(0);
                expect(bounds.right).toBeLessThanOrEqual(bounds.width);
                expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
                await page.locator('.spell-menu button').filter({ hasText: /^hello$/ }).click();
                await expect(page.locator('.chapter-body i, .chapter-body em')).toContainText('hello');
                await expect.poll(() => highlights(page)).toEqual([]);
                await page.keyboard.press(`${mod}+z`);
                await expect(page.locator('.chapter-body').first()).toContainText('helo');
                await expect.poll(() => highlights(page)).toEqual(['helo']);
                await rightClickWord(page, 'helo');
                await menu(app, ['Edit', 'Spellcheck Pass']);
                await expect(page.locator('.spell-menu')).toHaveCount(0);
                expect(await highlights(page)).toEqual([]);
            });
        });
        test('[NEO-172-A][NEO-173-A][NEO-174-A] tokenization skips acronyms/short letters, checks compounds and stammers intact', async () => {
            await fixture(engine, async (app, page) => {
                await page.keyboard.type('NASA Q Z qzxxqzxxqz e-mail well-known well-knwon Wh-what Qz-qzxxqzxxqz');
                await menu(app, ['Edit', 'Spellcheck Pass']);
                await expect.poll(() => highlights(page)).toEqual(['knwon', wrong, wrong].sort());
            });
        });
        test('[NEO-172-A] real outline ghosts, scene marks and sticky notes are excluded from manuscript spelling', async () => {
            await fixture(engine, async (app, page) => {
                await page.keyboard.insertText(`NASA A don't don’t ${wrong}`);
                await page.locator('.tab[data-tab="outline"]').click();
                await page.locator('.ol-chapter .ol-text').first().click();
                await page.keyboard.press('Enter');
                await page.keyboard.press('Tab');
                await expect(page.locator('.ol-section .ol-text')).toBeVisible();
                await page.keyboard.type('qzghostmisspelling');
                await page.locator('.tab[data-tab="manuscript"]').click();
                await expect(page.locator('.chapter-body p.ghost')).toContainText('qzghostmisspelling');
                await page.locator('.chapter-body p:not(.ghost):not(.scene-break)').first().click();
                await page.keyboard.press('End');
                await page.keyboard.press(`${mod}+Shift+x`);
                await expect(page.locator('#sticky-list textarea')).toBeFocused();
                await page.locator('#sticky-list textarea').fill('qzstickymisspelling');
                await page.keyboard.press('Enter');
                await expect(page.locator('.chapter-body .ph-mark')).toBeVisible();
                await menu(app, ['Edit', 'Spellcheck Pass']);
                await expect.poll(() => highlights(page)).toEqual([wrong]);
            });
        });
        test('[NEO-175-A][NEO-177-A][NEO-183-A] no-suggestion menu, learn invented word, Notes and restart persistence', async () => {
            const directory = await createReferenceDirectory();
            let app: ElectronApplication | undefined;
            try {
                app = await launchReference(directory, engine === 'prosemirror' ? 'prosemirror' : undefined);
                let page = await app.firstWindow();
                await freshBook(page);
                await ready(page);
                await page.keyboard.type(wrong);
                await menu(app, ['Edit', 'Spellcheck Pass']);
                await expect.poll(() => highlights(page)).toEqual([wrong]);
                await rightClickWord(page, wrong);
                await expect(page.locator('.spell-menu button').first()).toHaveText('No suggestions');
                await expect(page.locator('.spell-menu button').first()).toBeDisabled();
                await page.locator('.spell-menu button').filter({ hasText: /Add .*dictionary/ }).click();
                await expect.poll(() => highlights(page)).toEqual([]);
                await expect.poll(async () => (await library(directory)).customWords).toContain(wrong);
                await page.locator('.tab[data-tab="notes"]').click();
                await page.locator('#aux-editor').click();
                await page.keyboard.type(`${wrong} helo`);
                await expect(page.locator('#aux-editor')).toHaveText(`${wrong} helo`);
                await expect.poll(() => highlights(page)).toEqual(['helo']);
                await page.locator('#back-to-shelf').click();
                await app.close();
                app = undefined;
                app = await launchReference(directory, engine === 'prosemirror' ? 'prosemirror' : undefined);
                page = await app.firstWindow();
                await page.locator('.book').first().click();
                expect(await highlights(page)).toEqual([]);
                await menu(app, ['Edit', 'Spellcheck Pass']);
                await expect.poll(() => highlights(page)).toEqual([]);
                await page.locator('.tab[data-tab="notes"]').click();
                await expect(page.locator('#aux-editor')).toHaveText(`${wrong} helo`);
                await expect.poll(() => highlights(page)).toEqual(['helo']);
            }
            finally {
                await app?.close();
                await removeReferenceDirectory(directory);
            }
        });
        test('[NEO-181-A][NEO-177-A] Romanian Unicode equivalence and learning across manuscript/Notes', async () => {
            await fixture(engine, async (app, page) => {
                await menu(app, ['Edit', 'Spellcheck Language', 'Română']);
                await page.keyboard.insertText(`școală şcoală ${'Țară'.normalize('NFD')} Nerţulică Nerțulică ${'Nerțulică'.normalize('NFD')}`);
                await menu(app, ['Edit', 'Spellcheck Pass']);
                await expect.poll(() => highlights(page)).toEqual(['Nerţulică', 'Nerțulică', 'Nerțulică'.normalize('NFD')].sort());
                await page.locator('.tab[data-tab="notes"]').click();
                await page.locator('#aux-editor').click();
                await page.keyboard.insertText('Nerţulică frgament');
                await expect.poll(() => highlights(page)).toContain('frgament');
                await page.locator('.tab[data-tab="manuscript"]').click();
                await rightClickWord(page, 'Nerţulică');
                await page.locator('.spell-menu button').filter({ hasText: /Add .*dictionary/ }).click();
                await expect.poll(() => highlights(page)).toEqual(['frgament']);
                expect(await page.evaluate(async () => (window as any).neo.spellCheckWords(['Nerţulică', 'Nerțulică', 'Nerțulică'.normalize('NFD')]))).toEqual({ 'Nerţulică': true, 'Nerțulică': true, ['Nerțulică'.normalize('NFD')]: true });
            });
        });
        test('[NEO-182-A][NEO-173-A][NEO-174-A] actual Portuguese compounds and stammers with dictionary suggestions', async () => {
            await fixture(engine, async (app, page) => {
                await menu(app, ['Edit', 'Spellcheck Language', 'Português (Brasil)']);
                await page.keyboard.insertText('fazê-lo disse-lhe dir-se-ia amá-lo-ei guarda-chuva e-mail ideia voo linguiça E-eu N-não coracao excessão previlégio');
                await menu(app, ['Edit', 'Spellcheck Pass']);
                await expect.poll(() => highlights(page)).toEqual(['coracao', 'excessão', 'previlégio'].sort());
                await rightClickWord(page, 'coracao');
                await expect(page.locator('.spell-menu button').filter({ hasText: /^coração$/ })).toBeVisible();
            });
        });
        test('[NEO-170-B] trusted modified semicolon layout fallback toggles exactly one real spell pass and ignores Alt chord',async()=>{
          await fixture(engine,async(app,page)=>{await page.keyboard.type('helo');await page.evaluate(()=>{(window as any).__spellKeyProof=[];document.addEventListener('keydown',e=>{(window as any).__spellKeyProof.push({key:e.key,code:e.code,shift:e.shiftKey,alt:e.altKey,trusted:e.isTrusted});},true);});const modifiers=process.platform==='darwin'?['meta','shift']:['control','shift'];await nativeChord(app,';',modifiers);await expect.poll(()=>highlights(page)).toEqual(['helo']);const keys=await page.evaluate(()=>(window as any).__spellKeyProof);expect(keys.some((k:{code:string;shift:boolean;trusted:boolean})=>k.code==='Semicolon'&&k.shift&&k.trusted)).toBe(true);await nativeChord(app,';',[...modifiers,'alt']);await expect.poll(()=>highlights(page)).toEqual(['helo']);await nativeChord(app,';',modifiers);await expect.poll(()=>highlights(page)).toEqual([]);await expect(page.locator('.chapter-body')).toHaveText('helo');});
        });
        test('[NEO-180-B] actual queued Hunspell scan cannot retain detached misspelling ranges after native text replacement/chapter switch', async () => {
            await fixture(engine, async (app, page) => {
                await page.keyboard.type('helo');
                await page.keyboard.press('Enter');
                await page.keyboard.press('Enter');
                await page.keyboard.press('Enter');
                await page.keyboard.type(wrong);
                await page.locator('.chapter-body').first().click();
                let settled = false;
                const pending = page.evaluate(async () => (window as any).neo.spellCheckWords(Array.from({ length: 100000 }, (_, i) => `queuedword${i}`))).then(() => { settled = true; });
                expect(settled).toBe(false);
                await menu(app, ['Edit', 'Spellcheck Pass']);
                expect(settled).toBe(false);
                await page.keyboard.press(`${mod}+a`);
                await page.keyboard.insertText('hello');
                await page.locator('.chapter-body').last().click();
                await pending;
                await expect.poll(() => highlights(page)).toEqual([wrong]);
                expect(await page.evaluate(() => Array.from(CSS.highlights.get('neo-spell') || []).every(range => range.startContainer.isConnected && range.endContainer.isConnected))).toBe(true);
                await expect(page.locator('.chapter-body').first()).toHaveText('hello');
                await expect(page.locator('.chapter-body').last()).toHaveText(wrong);
            });
        });
        test('[NEO-171-A][NEO-180-A] lazy chapters, editing rescan and pending-worker off race retain prose', async () => {
            await fixture(engine, async (app, page) => {
                await page.keyboard.type('helo');
                await page.keyboard.press('Enter');
                await page.keyboard.press('Enter');
                await page.keyboard.press('Enter');
                await page.keyboard.type(wrong);
                await expect(page.locator('.chapter-body').last()).toHaveText(wrong);
                await menu(app, ['Edit', 'Spellcheck Pass']);
                await expect.poll(() => highlights(page)).toEqual([wrong]);
                await page.locator('.chapter-body').first().click();
                await expect.poll(() => highlights(page)).toEqual(['helo', wrong].sort());
                await page.keyboard.press('End');
                await page.keyboard.type(' knwon');
                await expect.poll(() => highlights(page)).toContain('knwon');
                await page.keyboard.type(' qzpendingword');
                await menu(app, ['Edit', 'Spellcheck Pass']);
                const pending = page.evaluate(async () => (window as any).neo.spellCheckWords(Array.from({ length: 20000 }, (_, i) => `word${i}`)));
                // Turning on starts an actual renderer scan behind the worker queue.
                await menu(app, ['Edit', 'Spellcheck Pass']);
                await menu(app, ['Edit', 'Spellcheck Pass']);
                await page.keyboard.type(' preserved');
                await pending;
                await expect.poll(() => highlights(page)).toEqual([]);
                await expect(page.locator('.chapter-body').first()).toContainText('preserved');
            });
        });
        test('[NEO-179-A] real missing dictionary failure retains prior language and prose', async () => {
            await fixture(engine, async (app, page, directory) => {
                await page.keyboard.type('hello');
                const deps = path.resolve('node_modules'), local = path.join(directory, 'source', 'node_modules');
                await unlink(local);
                await mkdir(local);
                for (const entry of await readdir(deps))
                    if (entry !== 'dictionary-fr')
                        await symlink(path.join(deps, entry), path.join(local, entry), 'dir');
                await menu(app, ['Edit', 'Spellcheck Language', 'Français']);
                await expect(page.locator('#hint')).toContainText('That dictionary would not load');
                expect(await checkedLanguage(app)).toEqual(['Français']);
                expect((await library(directory)).spellLanguage).toBeUndefined();
                await expect(page.locator('.chapter-body').first()).toHaveText('hello');
                expect(await page.evaluate(async (words) => (window as any).neo.spellCheckWords(words), ['hello', wrong])).toEqual({ hello: true, [wrong]: false });
            });
        });
    });
}
