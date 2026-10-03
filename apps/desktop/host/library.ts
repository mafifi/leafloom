import {CoverArtJob} from '@leafloom/desktop-host';
import {createHash as artHash} from 'node:crypto';
import { CoverArtProvider,CoverProviderError } from './cover-art.ts';
import { CoverOptions } from '@leafloom/desktop-host';
import { paragraphsFromHtml } from './manuscript-export.ts';
import { BackupProvider } from './backups.ts';
import { watch,constants, type FSWatcher } from 'node:fs';
import type { DocumentChange } from '@leafloom/desktop-host';
import { LocaleProvider } from './locales.ts';
import {
  mkdir,
  lstat,
  readdir,
  readFile,
  open,
  rename,
  rm,
  copyFile,
  unlink,
} from 'node:fs/promises';
import { join, resolve, dirname, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Book, SourceBook, Metadata } from '@leafloom/document-contracts';
import { BookFiles, importNeo, hash } from '@leafloom/filesystem-documents';
import { LifecycleError, type Opened, type CheckpointValue } from '@leafloom/editor-contracts';
import { z } from 'zod';
import { parseHostRequest } from '@leafloom/desktop-host';
import { hostSpan, telemetryDiagnostics, TraceParent } from './telemetry.ts';
import { parseManuscript } from './manuscript-import.ts';
import { importDialogue } from './import-dialogue.ts';
import { renderManuscript,manuscriptTextFromHtml, renderChapter, renderCollection } from './manuscript-export.ts';
import { SpellProvider } from './spell.ts';
import {generatedCover,rasterDimensions} from './generated-cover.ts';
import {webpDimensions} from './webp-cover.ts';
import {translate} from '@leafloom/language-contracts';
import {reportRuntimeError} from './runtime-errors.ts';
export class LibraryHost {
  private locales = new LocaleProvider();
  private watchers = new Map<
    string,
    { watcher: FSWatcher | null; timer?: ReturnType<typeof setTimeout>; poll?: ReturnType<typeof setInterval>; signature: string; identity:string; renewed:boolean }
  >();
  private listeners = new Set<(event: DocumentChange) => void>();
  private changes: DocumentChange[] = [];
  subscribeEvents(listener: (event: DocumentChange) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emitChange(event: DocumentChange) {
    this.changes.push(event);
    if (this.changes.length > 256) this.changes.shift();
    for (const listener of this.listeners) listener(event);
  }
  private async watchBook(bookId: string) {
    const directory=await lstat(await this.checked(this.folder(bookId)),{bigint:true});
    const state = { watcher: null, signature: '', identity:`${directory.dev}:${directory.ino}`,renewed:false } as {
      watcher: FSWatcher | null;
      timer?: ReturnType<typeof setTimeout>;
      poll?: ReturnType<typeof setInterval>;
      signature: string;
      identity:string;
      renewed:boolean;
    };
    const inspect = () => {
      clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        const check = this.queue.then(async () => {
          if(this.watchers.get(bookId)!==state)return;
          const session = this.sessions.get(bookId);
          if (!session) return;
          let change: DocumentChange;
          try {
            const current=await lstat(await this.checked(this.folder(bookId)),{bigint:true});
            if(!current.isDirectory())throw new LifecycleError('INVALID');
            const identity=`${current.dev}:${current.ino}`;
            if(identity!==state.identity){
              state.renewed=true;
              attach();
              state.identity=identity;
            }
            const opened = await session.files.load(false);
            if (
              !state.renewed &&
              opened.recovered === session.opened.recovered &&
              Object.entries(session.opened.versions).every(
                ([name, value]) => opened.versions[name as keyof typeof opened.versions] === value,
              )
            ) {
              state.signature = '';
              return;
            }
            change = state.renewed
              ? {bookId,code:'RECOVERY_REQUIRED',versions:opened.versions}
              : opened.recovered
              ? { bookId, code: 'RECOVERY_REQUIRED' }
              : { bookId, versions: opened.versions };
          } catch (error) {
            change = {
              bookId,
              code:
                error instanceof LifecycleError && error.code === 'CORRUPT'
                  ? 'CORRUPT'
                  : 'UNAVAILABLE',
            };
          }
          const signature = JSON.stringify(change);
          if (signature !== state.signature) {
            state.signature = signature;
            this.emitChange(change);
          }
        });
        this.queue = check.then(
          () => {},
          () => {},
        );
      }, 80);
      state.timer.unref();
    };
    const attach=()=>{
      state.watcher?.close();
      state.watcher=watch(this.folder(bookId),(event,file)=>{
        if(event==='rename'||!file||['manuscript.json','reviews.json','notes.html','outline.html'].includes(String(file)))inspect();
      });
      state.watcher.on('error',inspect);
    };
    attach();
    state.poll=setInterval(inspect,30000);state.poll.unref();
    this.watchers.set(bookId, state);
  }
  private unwatchBook(bookId: string) {
    const state = this.watchers.get(bookId);
    if (state) {
      clearTimeout(state.timer);
      clearInterval(state.poll);
      state.watcher?.close();
      this.watchers.delete(bookId);
    }
  }
  private spell = new SpellProvider(() => this.learnedWords());
  private async exportCover(bookId:string,generated?:string){
    const fallback=generatedCover(generated),custom=await this.dispatch('readCover',{bookId,mode:'image'}) as string|null;
    const match=custom?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if(match){const bytes=Buffer.from(match[2]!,'base64');if(bytes.toString('base64')!==match[2])throw new LifecycleError('INVALID');if(match[1]==='image/webp')webpDimensions(bytes);else rasterDimensions(bytes,match[1] as 'image/png'|'image/jpeg',20_000_000);}
    return match?{mime:match[1]!,data:match[2]!}:fallback;
  }
  private async learnedWords() {
    const words=z
      .record(z.string(), z.array(z.string()))
      .parse(await this.json(join(this.root, 'spell-words.json'), {}));
    const library=z.record(z.string(),z.json()).parse(await this.json(join(this.root,'library.json'),{}));
    words['*']=[...new Set([...(words['*']??[]),...z.array(z.string()).parse(library.customWords??[])])];
    return words;
  }
  private deletions = new Map<string, {files:BookFiles;lease:string}>();
  private sessions = new Map<string, { files: BookFiles; lease: string | null; opened: Opened }>();
  private queue: Promise<void> = Promise.resolve();
  readonly root: string;
  constructor(root: string) {
    this.root = root;
  }
  private folder(id: string) {
    if (['Exports','Backups','Trash'].includes(id) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id)) throw new LifecycleError('INVALID');
    return join(this.root, id);
  }
  async initialize() {
    await mkdir(this.root, { recursive: true });
    await this.checked(this.root);
    await this.writeCatalog();
  }
  /** Derived browsing map; a catalog failure must never invalidate an author receipt. */
  private async writeCatalog() {
    try {
      const library = z.record(z.string(), z.json()).parse(await this.json(join(this.root,'library.json'),{}));
      const shelves = z.array(z.object({name:z.string(),bookIds:z.array(z.string())}).passthrough()).parse(library.shelves??[]);
      const onShelf = new Map<string,string>();
      for (const shelf of shelves) for (const id of shelf.bookIds) onShelf.set(id,shelf.name);
      const language = await this.dispatch('getLanguage',{}) as Awaited<ReturnType<LocaleProvider['get']>>;
      const t = (key:string)=>translate(language,key);
      const lines:string[]=[];
      for (const entry of await readdir(this.root,{withFileTypes:true})) {
        if (!entry.isDirectory() || !entry.name.startsWith('book-')) continue;
        try {
          const opened=await new BookFiles(await this.checked(this.folder(entry.name))).load(false);
          const metadata=opened.book.metadata;
          lines.push(`${metadata.title||t('Untitled')}  —  ${entry.name}  —  ${t('shelf:')} ${onShelf.get(metadata.id)||t('(none — removed from shelves)')}`);
        } catch { /* A corrupt or incomplete folder cannot hide the other readable books. */ }
      }
      lines.sort((a,b)=>a.localeCompare(b));
      const text=t('NEO LIBRARY CATALOG — which folder is which book')+'\n'+t('(regenerated automatically; edits here do nothing)')+'\n\n'+lines.join('\n')+'\n';
      const target=join(this.root,'_catalog.txt');
      try {
        const current=await readFile(await this.checked(target),{flag:constants.O_RDONLY|(constants.O_NOFOLLOW??0)});
        if(current.equals(Buffer.from(text)))return;
      } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error; }
      await this.atomic(target,text);
    } catch(error) {
      const code=error instanceof LifecycleError&&['DISK_FULL','SAVE_UNCERTAIN'].includes(error.code)?error.code:'DISK_ERROR';
      process.stderr.write(JSON.stringify({event:'catalog.failure',code})+'\n');
    }
  }
  private async syncDirectory(path: string) {
    const directory = await open(path, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  private async checked(path: string) {
    if ((await lstat(path)).isSymbolicLink()) throw new LifecycleError('INVALID');
    return path;
  }
  private async atomic(path: string, data: string | Uint8Array) {
    const temporary = path + '.' + randomUUID() + '.tmp';
    let replaced = false;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(data);
        await file.sync();
      } finally {
        await file.close();
      }
      try {
        await this.checked(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await rename(temporary, path);
      replaced = true;
      await this.syncDirectory(dirname(path));
    } catch (error) {
      if (replaced) throw new LifecycleError('SAVE_UNCERTAIN');
      if((error as NodeJS.ErrnoException).code==='ENOSPC')throw new LifecycleError('DISK_FULL');
      throw error;
    } finally {
      await rm(temporary, { force: true });
    }
  }
  private async json(path: string, fallback: unknown) {
    try {
      const file=await open(await this.checked(path),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
      try{
        if(!(await file.stat()).isFile())throw new LifecycleError('INVALID');
        const bytes=await file.readFile();
        try{return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}catch{throw new LifecycleError('CORRUPT');}
      }finally{await file.close();}
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
      if((e as NodeJS.ErrnoException).code==='ELOOP')throw new LifecycleError('INVALID');
      throw e;
    }
  }
  async openBook(id: string) {
    const existing = this.sessions.get(id);
    if (existing)
      return { ...existing.opened, lease: existing.lease, readOnly: existing.lease === null };
    const root = await this.checked(this.folder(id)),
      files = new BookFiles(root);
    let lease: string | null = null;
    try {
      lease = await files.acquire();
    } catch (e) {
      if (!(e instanceof LifecycleError && e.code === 'BUSY')) throw e;
    }
    try {
      const opened = await files.load(lease !== null);
      // The reply records that recovery occurred; the private watcher baseline records
      // whether the current bytes still require recovery after an owned restoration.
      const baseline=opened.recovered&&lease!==null?{...opened,recovered:(await files.load(false)).recovered}:opened;
      this.sessions.set(id, { files, lease, opened:baseline });
      await this.watchBook(id);
      if(opened.recovered)await this.writeCatalog();
      return { ...opened, lease, readOnly: lease === null };
    } catch (e) {
      this.unwatchBook(id);
      this.sessions.delete(id);
      if (lease) await files.release();
      throw e;
    }
  }
  private async exportPreferences(){
    const library=await this.json(join(this.root,'library.json'),{}) as Record<string,unknown>|null;
    const fonts=library?.fonts&&typeof library.fonts==='object'?library.fonts as Record<string,unknown>:{};
    return {catalog:await this.dispatch('getLanguage',{}) as Awaited<ReturnType<LocaleProvider['get']>>,customChapterTitles:Boolean(library?.exportCustomChapterTitles),bodyFont:typeof fonts.body==='string'?fonts.body:undefined,dropcap:typeof fonts.dropcap==='string'?fonts.dropcap:undefined};
  }
  private async coverArt(bookId:string){
    const folder=await this.checked(this.folder(bookId)),raw=await this.json(join(folder,'art.json'),null);
    if(raw===null)return null;
    const record=z.object({file:z.string().regex(/^art-[0-9]+\.(jpg|png|webp)$/),brief:z.string().min(1).max(20000),textModel:z.string().default('legacy'),imageModel:z.string().default('legacy'),sha256:z.string().regex(/^[0-9a-f]{64}$/).optional(),jobId:z.uuid().optional()}).safeParse(raw);
    if(!record.success)throw new LifecycleError('CORRUPT');
    const source=await this.checked(join(folder,record.data.file));if((await lstat(source)).size>20_000_000)throw new LifecycleError('CORRUPT');
    const bytes=await readFile(source);if(record.data.sha256&&artHash('sha256').update(bytes).digest('hex')!==record.data.sha256)throw new LifecycleError('CORRUPT');
    const {file,brief,textModel,imageModel}=record.data;return {result:{file,brief,textModel,imageModel},jobId:record.data.jobId};
  }
  async paintCover(raw: unknown, provider = new CoverArtProvider(), progress: (status:'brief'|'painting'|'saving')=>void = ()=>{}) {
    const input = CoverOptions.extend({apiKey:z.string().min(1).max(4096),jobId:z.uuid()}).parse(raw);
    const folder = await this.checked(this.folder(input.bookId));
    const opened = await new BookFiles(folder).load(false);
    const status=async(status:'brief'|'painting'|'saving')=>{await this.atomic(join(folder,'art-job.json'),JSON.stringify({bookId:input.bookId,jobId:input.jobId,status})+'\n');progress(status);};
    try {
      const text = opened.book.chapters.flatMap(chapter=>paragraphsFromHtml(chapter.html).map(paragraph=>paragraph.text)).join('\n\n');
      const result = await provider.paint({apiKey:input.apiKey,text,textModel:input.textModel,imageModel:input.imageModel,quality:input.quality},status);
      await status('saving');await this.checked(folder);
      const file = 'art-' + Date.now() + '.' + result.ext;
      await this.atomic(join(folder,file),result.buffer);
      await this.atomic(join(folder,'art.json'),JSON.stringify({file,brief:result.brief,provider:'openai',textModel:result.textModel,imageModel:result.imageModel,painted:new Date().toISOString(),jobId:input.jobId,sha256:artHash('sha256').update(result.buffer).digest('hex')},null,2)+'\n');
      await this.atomic(join(folder,'art-job.json'),JSON.stringify({bookId:input.bookId,jobId:input.jobId,status:'done'})+'\n');
      return {file,brief:result.brief,textModel:result.textModel,imageModel:result.imageModel};
    }catch(error){const code=error instanceof CoverProviderError?error.code:error instanceof LifecycleError?error.code:'ART_SAVE_FAILED';await this.atomic(join(folder,'art-job.json'),JSON.stringify({bookId:input.bookId,jobId:input.jobId,status:'failed',code})+'\n').catch(()=>{});throw error;}
  }
  /** Private native transport: a held writer lease authorizes one scoped OS move. */
  async prepareDeleteBook(raw:unknown) {
    const {bookId}=z.strictObject({bookId:z.string()}).parse(raw);
    if(this.sessions.has(bookId)||this.deletions.has(bookId))throw new LifecycleError('BUSY');
    const files=new BookFiles(await this.checked(this.folder(bookId)));
    const lease=await files.acquire();
    try {
      const opened=await files.load(false);
      if(opened.book.metadata.id!==bookId)throw new LifecycleError('INVALID');
      this.deletions.set(bookId,{files,lease});
      return {bookId,lease,ownerPid:process.pid};
    }catch(error){await files.release();throw error;}
  }
  async finishDeleteBook(raw:unknown) {
    const {bookId,lease}=z.strictObject({bookId:z.string(),lease:z.uuid()}).parse(raw);
    const pending=this.deletions.get(bookId);
    if(!pending||pending.lease!==lease)throw new LifecycleError('UNAUTHORIZED');
    await pending.files.release().catch(()=>{});
    this.deletions.delete(bookId);
    await this.writeCatalog();
    return {deleted:true,location:'system-trash'};
  }
  async shutdown() {
    for (const bookId of this.watchers.keys()) this.unwatchBook(bookId);
    await this.queue;
    for (const session of this.sessions.values()) await session.files.release();
    this.sessions.clear();
    for(const pending of this.deletions.values())await pending.files.release().catch(()=>{});
    this.deletions.clear();
  }
  request(method: string, payload: unknown, traceparent?: string): Promise<unknown> {
    try {
      parseHostRequest(method, payload);
    } catch (e) {
      return Promise.reject(e);
    }
    if (traceparent && !TraceParent.test(traceparent))
      return Promise.reject(new LifecycleError('INVALID'));
    const next = this.queue.then(() =>
      hostSpan(method, (carrier) => this.dispatch(method, payload, carrier), traceparent),
    );
    this.queue = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  private async dispatch(method: string, raw: unknown, traceparent?: string): Promise<unknown> {
    const { method: operation, payload: p } = parseHostRequest(method, raw);
    switch (operation) {
      case 'reportRuntimeError':
        await reportRuntimeError(this.root,p);
        return true;
      case 'runtimeState':
        return { openBooks: this.sessions.size };
      case 'libraryPath':
        return this.root;
      case 'createBackup':
        return new BackupProvider(this.root).create();
      case 'listBackups':
        return new BackupProvider(this.root).list();
      case 'readLibrary':
        return this.json(join(this.root, 'library.json'), null);
      case 'writeLibrary': {
        await this.json(join(this.root,'library.json'),null);
        const learned=[...new Set(Object.values(await this.learnedWords()).flat())],incoming=z.record(z.string(),z.json()).parse(p.library);
        const library={...incoming,...(learned.length?{customWords:[...new Set([...z.array(z.string()).parse(incoming.customWords??[]),...learned])]}:{})};
        await this.atomic(
          join(this.root, 'library.json'),
          JSON.stringify(library, null, 2) + '\n',
        );
        await this.writeCatalog();
        return true;
      }
      case 'consumeDocumentChanges':
        return this.changes.splice(0);
      case 'listLanguages':
        return this.locales.languages();
      case 'getLanguage': {
        const settings = (await this.json(join(this.root, 'settings.json'), {})) as Record<
          string,
          unknown
        >;
        return this.locales.get(
          typeof settings.uiLanguage === 'string'
            ? settings.uiLanguage
            : Intl.DateTimeFormat().resolvedOptions().locale,
        );
      }
      case 'setLanguage': {
        const language = await this.locales.resolve(p.language);
        if (!language) throw new LifecycleError('INVALID');
        const settings = (await this.json(join(this.root, 'settings.json'), {})) as Record<
          string,
          unknown
        >;
        await this.atomic(
          join(this.root, 'settings.json'),
          JSON.stringify({ ...settings, uiLanguage: language }, null, 2) + '\n',
        );
        return this.locales.get(language);
      }
      case 'getSettings':
        return this.json(join(this.root, 'settings.json'), {});
      case 'writeSettings':
        await this.json(join(this.root,'settings.json'),null);
        await this.atomic(
          join(this.root, 'settings.json'),
          JSON.stringify(p.settings, null, 2) + '\n',
        );
        return true;
      case 'listBooks': {
        const rows = [];
        for (const entry of await readdir(this.root, { withFileTypes: true })) {
          if (!entry.isDirectory() || !entry.name.startsWith('book-')) continue;
          const book = await new BookFiles(await this.checked(this.folder(entry.name))).load(false);
          rows.push(book.book.metadata);
        }
        return rows;
      }
      case 'createBook': {
        const id = 'book-' + randomUUID(),
          staging = join(this.root, '.create-' + randomUUID()),
          destination = this.folder(id),
          now = new Date().toISOString();
        const metadata = {
          id,
          title: p.title || 'Untitled',
          author: p.author,
          kind: p.kind ?? 'novel',
          subtitle: '',
          series: '',
          wordGoal: 0,
          created: now,
          modified: now,
          tabNames: { notes: 'Notes', outline: 'Outline' },
        };
        const book = Book.parse({
          formatVersion: 'neo-lifecycle/v1',
          revision: 0,
          metadata,
          chapters: [],
          darlings: [],
        });
        await mkdir(staging);
        try {
          await this.atomic(join(staging, 'manuscript.json'), JSON.stringify(book, null, 2) + '\n');
          for (const name of ['notes.html', 'outline.html'])
            await this.atomic(join(staging, name), '');
          await rename(staging, destination);
          const parent = await open(this.root, 'r');
          try {
            await parent.sync();
          } finally {
            await parent.close();
          }
          await this.writeCatalog();
          return metadata;
        } finally {
          await rm(staging, { recursive: true, force: true });
        }
      }
      case 'readCoverArt':return (await this.coverArt(p.bookId))?.result??null;
      case 'readCoverArtJob': {
        const folder=await this.checked(this.folder(p.bookId));const raw=await this.json(join(folder,'art-job.json'),null);
        if(raw===null)return {bookId:p.bookId,status:'idle'};
        const job=CoverArtJob.parse(raw);if(job.bookId!==p.bookId)throw new LifecycleError('CORRUPT');
        if(job.status==='done'||job.status==='saving'){const art=await this.coverArt(p.bookId);if(art&&art.jobId&&art.jobId===job.jobId)return {...job,status:'done',result:art.result};}
        if(['brief','painting','saving'].includes(job.status))return {...job,status:'failed',code:'INTERRUPTED'};
        return job;
      }
      case 'readBookMeta':
        return (await new BookFiles(await this.checked(this.folder(p.bookId))).load(false)).book
          .metadata;
      case 'writeBookMeta': {
        if (p.metadata.id !== p.bookId) throw new LifecycleError('INVALID');
        if (this.sessions.has(p.bookId)||this.deletions.has(p.bookId)) throw new LifecycleError('BUSY');
        const files = new BookFiles(await this.checked(this.folder(p.bookId)));
        await files.acquire();
        try {
          const current = await files.load(),
            book = {
              ...current.book,
              metadata: Metadata.parse({ ...p.metadata, modified: new Date().toISOString() }),
            };
          if (book.formatVersion === 'neo-composed/v1') {
            const version = randomUUID();
            await files.checkpoint(
              {
                book: { ...book, revision: book.revision + 1, version },
                reviews: current.reviews
                  ? { ...current.reviews, version }
                  : {
                      formatVersion: 'neo-composed-reviews/v1',
                      bookId: p.bookId,
                      version,
                      references: [],
                      items: [],
                    },
                notes: current.notes,
                outline: current.outline,
              },
              current.versions,
            );
          } else {
            await files.replaceSource(book, current.versions.manuscript);
          }
          if(book.metadata.title!==current.book.metadata.title)await this.writeCatalog();
          return book.metadata;
        } finally {
          await files.release();
        }
      }
      case 'deleteBook': {
        if (this.sessions.has(p.bookId)) throw new LifecycleError('BUSY');
        const folder = await this.checked(this.folder(p.bookId)),
          files = new BookFiles(folder);
        await files.acquire();
        try {
          const opened=await files.load(false);
          if(opened.book.metadata.id!==p.bookId)throw new LifecycleError('INVALID');
          const trash = join(this.root, 'Trash');
          await mkdir(trash, { recursive: true });
          await this.checked(trash);
          const destination = join(trash, p.bookId + '-' + Date.now());
          await rename(folder, destination);
          await unlink(join(destination, '.writer.lock'));
          await this.syncDirectory(destination);
          await this.syncDirectory(trash);
          await this.syncDirectory(this.root);
        } finally {
          await files.release().catch(() => {});
        }
        await this.writeCatalog();
        return {deleted:true,location:'library-trash'};
      }
      case 'openBook':
        return this.openBook(p.bookId);
      case 'closeBook': {
        const session = this.sessions.get(p.bookId);
        if (!session) return true;
        if (session.lease !== p.lease) throw new LifecycleError('UNAUTHORIZED');
        await session.files.release();
        this.unwatchBook(p.bookId);
        this.sessions.delete(p.bookId);
        return true;
      }
      case 'checkpoint': {
        const session = this.sessions.get(p.bookId);
        if (!session || !session.lease || session.lease !== p.lease)
          throw new LifecycleError('UNAUTHORIZED');
        if (p.checkpoint.book.metadata.id !== p.bookId) throw new LifecycleError('INVALID');
        const receipt = await session.files.checkpoint(
          p.checkpoint as CheckpointValue,
          p.expected,
          traceparent,
        );
        const titleChanged=session.opened.book.metadata.title!==p.checkpoint.book.metadata.title;
        session.opened = { ...p.checkpoint, versions: receipt.versions, recovered: false };
        if(titleChanged)await this.writeCatalog();
        return receipt;
      }
      case 'importManuscript': {
        const source = await this.checked(resolve(p.source)),
          parsed = await parseManuscript(source),
          id = 'book-' + randomUUID(),
          folder = this.folder(id),
          staging = join(this.root, '.import-' + randomUUID());
        const library = await this.json(join(this.root, 'library.json'), null) as Record<string, unknown> | null;
        const language = typeof library?.spellLanguage === 'string' && library.spellLanguage
          ? library.spellLanguage : (await this.dispatch('getLanguage', {}) as Awaited<ReturnType<LocaleProvider['get']>>).locale;
        const titles: Record<string, string> = {},
          kinds: Record<string, string> = {},
          chapters = parsed.chapters.map((chapter) => {
            const chapterId = 'chapter-' + randomUUID();
            titles[chapterId] = chapter.title;
            kinds[chapterId] = chapter.role ?? 'chapter';
            const esc = (text: string) =>
              text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const inline = (text: string) =>
              esc(importDialogue(text, language))
                .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
                .replace(/\*([^*]+)\*/g, '<i>$1</i>')
                .replace(/_([^_]+)_/g, '<i>$1</i>')
                .replace(/\n/g, '<br>');
            return {
              id: chapterId,
              html: chapter.paras
                .map((paragraph) =>
                  paragraph.scene
                    ? '<p class="scene-break">***</p>'
                    : '<p>' + inline(paragraph.text ?? '') + '</p>',
                )
                .join(''),
            };
          });
        const now = new Date().toISOString(),
          metadata = {
            id,
            title: parsed.title ?? parsed.name,
            author: parsed.author ?? '',
            created: now,
            modified: now,
            chapterTitles: titles,
            chapterKinds: kinds,
            kind: 'novel',
          };
        await mkdir(staging);
        try {
          await this.atomic(
            join(staging, 'manuscript.json'),
            JSON.stringify(
              Book.parse({
                formatVersion: 'neo-lifecycle/v1',
                revision: 0,
                metadata,
                chapters,
                darlings: [],
              }),
              null,
              2,
            ) + '\n',
          );
          await this.atomic(join(staging, 'notes.html'), '');
          await this.atomic(join(staging, 'outline.html'), '');
          await rename(staging, folder);
          await this.syncDirectory(this.root);
          await this.writeCatalog();
          return metadata;
        } finally {
          await rm(staging, { recursive: true, force: true });
        }
      }
      case 'manuscriptFingerprint': {
        const opened=await new BookFiles(await this.checked(this.folder(p.bookId))).load(false);
        const text=opened.book.metadata.title+'\n'+opened.book.chapters.map(chapter=>manuscriptTextFromHtml(chapter.html)).join('\n');
        return {fingerprint:artHash('sha256').update(text,'utf8').digest('hex')};
      }
      case 'renderEmailDraft': {
        const opened=await new BookFiles(await this.checked(this.folder(p.bookId))).load(false);
        const text=opened.book.metadata.title+'\n'+opened.book.chapters.map(chapter=>manuscriptTextFromHtml(chapter.html)).join('\n');
        const fingerprint=artHash('sha256').update(text,'utf8').digest('hex');
        if(p.expectedFingerprint&&p.expectedFingerprint!==fingerprint)throw new LifecycleError('EXTERNAL_CHANGE');
        const folder = join(this.root, 'Exports');
        await mkdir(folder, { recursive: true });
        await this.checked(folder);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = join(folder, `draft-${p.bookId}-${stamp}.pdf`);
        await this.atomic(file, await renderManuscript(opened, 'pdf',{...await this.exportPreferences(),cover:await this.exportCover(p.bookId,p.generatedCover)}));
        return { file, to: p.to, subject: p.subject, body: p.body, method: p.method };
      }
      case 'exportChapter':
      case 'renderChapterPreview': {
        const opened=this.sessions.get(p.bookId)?.opened??await new BookFiles(await this.checked(this.folder(p.bookId))).load(false);
        const cover=('format' in p&&p.format==='epub')?await this.dispatch('readCover',{bookId:p.bookId,mode:'image'}) as string|null:null;
        const match=cover?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
        const preferences=await this.exportPreferences();
        const bytes=await renderChapter(opened,p.chapterId,'format' in p?p.format:'html',{...preferences,language:p.language,cover:match?{mime:match[1],data:match[2]}:null});
        if(!('destination' in p))return bytes.toString('utf8');
        await this.atomic(resolve(p.destination),bytes);return p.destination;
      }
      case 'exportBook': {
        const opened =
            this.sessions.get(p.bookId)?.opened ??
            (await new BookFiles(await this.checked(this.folder(p.bookId))).load(false)),
          cover = await this.exportCover(p.bookId,p.generatedCover),
          preferences=await this.exportPreferences(),
          bytes = await renderManuscript(opened, p.format, {
            ...preferences,
            language: p.language,
            cover,
          });
        await this.atomic(resolve(p.destination), bytes);
        return p.destination;
      }
      case 'exportCollection': {
        if (new Set(p.bookIds).size !== p.bookIds.length) throw Error('INVALID');
        const books: Opened[] = [];
        for (const bookId of p.bookIds) {
          books.push(
            this.sessions.get(bookId)?.opened ??
              (await new BookFiles(await this.checked(this.folder(bookId))).load(false)),
          );
        }
        const coverBook = p.bound
          ? books.find((book) => book.book.metadata.kind === 'cover')
          : undefined;
        const cover = coverBook
          ? ((await this.dispatch('readCover', { bookId: coverBook.book.metadata.id, mode: 'image' })) as
              string | null)
          : null;
        const fallback=generatedCover(p.generatedCover),match = cover?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
        const bytes = await renderCollection(books, p.format, {
          ...p,
          ...await this.exportPreferences(),
          cover: match ? { mime: match[1], data: match[2] } : fallback,
        });
        await this.atomic(resolve(p.destination), bytes);
        return p.destination;
      }
      case 'renderPreview': {
        const opened =
          this.sessions.get(p.bookId)?.opened ??
          (await new BookFiles(await this.checked(this.folder(p.bookId))).load(false));
        return (await renderManuscript(opened, 'html', { ...await this.exportPreferences(),language: p.language,cover:await this.exportCover(p.bookId,p.generatedCover) })).toString('utf8');
      }
      case 'importLegacy': {
        const id = 'book-' + randomUUID(),
          destination = this.folder(id);
        const book = await importNeo(resolve(p.source), destination, id);
        await this.writeCatalog();
        return book.metadata;
      }
      case 'exportLegacy': {
        const opened =
          this.sessions.get(p.bookId)?.opened ??
          (await new BookFiles(await this.checked(this.folder(p.bookId))).load(false));
        const destination = resolve(p.destination);
        try {
          await lstat(destination);
          throw new LifecycleError('INVALID');
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
        const staging = destination + '.export-' + randomUUID();
        try {
          await mkdir(join(staging, 'chapters'), { recursive: true });
          const { stickies = [], ...metadata } = opened.book.metadata;
          const cover = (await this.json(join(this.folder(p.bookId), 'cover.json'), undefined)) as
            { mime: string; data: string } | null | undefined;
          if (cover) {
            const extension =
              cover.mime === 'image/jpeg' ? 'jpg' : cover.mime === 'image/webp' ? 'webp' : 'png';
            const name = 'cover-0.' + extension;
            metadata.coverImage = name;
            await this.atomic(join(staging, name), Buffer.from(cover.data, 'base64'));
          } else if (cover === null) {
            delete metadata.coverImage;
          }
          for (const entry of await readdir(this.folder(p.bookId), { withFileTypes: true })) {
            if (
              !entry.isFile() ||
              (cover && entry.name === metadata.coverImage) ||
              [
                'manuscript.json',
                'reviews.json',
                'notes.html',
                'outline.html',
                'stickies.json',
                'cover.json',
                'book.json',
                'darlings.json',
              ].includes(entry.name) ||
              entry.name.endsWith('.bak') ||
              entry.name.endsWith('.tmp') ||
              entry.name.startsWith('.')
            )
              continue;
            await copyFile(
              await this.checked(join(this.folder(p.bookId), entry.name)),
              join(staging, entry.name),
            );
          }
          await this.atomic(
            join(staging, 'stickies.json'),
            JSON.stringify(z.array(z.json()).parse(stickies)),
          );
          await this.atomic(
            join(staging, 'book.json'),
            JSON.stringify(
              { ...metadata, chapterOrder: opened.book.chapters.map((c) => c.id) },
              null,
              2,
            ) + '\n',
          );
          for (const chapter of opened.book.chapters) {
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(chapter.id))
              throw new LifecycleError('INVALID');
            await this.atomic(join(staging, 'chapters', chapter.id + '.html'), chapter.html);
          }
          await this.atomic(join(staging, 'darlings.json'), JSON.stringify(opened.book.darlings));
          await this.atomic(join(staging, 'notes.html'), opened.notes);
          await this.atomic(join(staging, 'outline.html'), opened.outline);
          if (opened.reviews)
            await this.atomic(
              join(staging, 'reviews.json'),
              JSON.stringify(opened.reviews, null, 2),
            );
          await rename(staging, destination);
          await this.syncDirectory(dirname(destination));
          return destination;
        } finally {
          await rm(staging, { recursive: true, force: true });
        }
      }
      case 'setCover': {
        const folder = await this.checked(this.folder(p.bookId)),
          source = await this.checked(resolve(p.source)),
          extension = extname(source).toLowerCase();
        if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension))
          throw new LifecycleError('INVALID');
        if ((await lstat(source)).size > 20_000_000) throw new LifecycleError('INVALID');
        const bytes = await readFile(source);
        if (bytes.length > 20_000_000) throw new LifecycleError('INVALID');
        const mime=extension==='.jpg'||extension==='.jpeg'?'image/jpeg':extension==='.webp'?'image/webp':'image/png';
        if(mime==='image/webp')webpDimensions(bytes);else rasterDimensions(bytes,mime,20_000_000);
        await this.atomic(
          join(folder, 'cover.json'),
          JSON.stringify({
            mime,
            data: bytes.toString('base64'),
          }),
        );
        return true;
      }
      case 'removeCover':
        await this.atomic(join(await this.checked(this.folder(p.bookId)), 'cover.json'), 'null');
        return true;
      case 'readCover': {
        const folder = await this.checked(this.folder(p.bookId));
        const metadata = this.sessions.get(p.bookId)?.opened.book.metadata ?? (await new BookFiles(folder).load(false)).book.metadata;
        if (p.mode === 'active' && metadata.coverMode === 'abstract') return null;
        const painting = p.mode === 'painted' || p.mode === 'active' && metadata.coverMode === 'painted';
        const cover = await this.json(join(folder, 'cover.json'), undefined);
        if (!painting && cover !== undefined) {
          const value = z.strictObject({mime:z.enum(['image/png','image/jpeg','image/webp']),data:z.string()}).nullable().parse(cover);
          return value ? 'data:' + value.mime + ';base64,' + value.data : null;
        }
        const candidate = painting ? (await this.coverArt(p.bookId))?.result.file??(metadata.coverArt as {file?:string}|undefined)?.file : metadata.coverImage ?? (p.mode === 'image' ? null : (metadata.coverArt as {file?:string}|undefined)?.file);
        if (typeof candidate !== 'string' || !/^(cover|art)-[0-9]+\.(png|jpg|webp)$/.test(candidate) || p.mode === 'image' && candidate.startsWith('art-')) return null;
        const source = await this.checked(join(folder, candidate));
        if ((await lstat(source)).size > 20_000_000) throw new LifecycleError('INVALID');
        const bytes = await readFile(source);
        return 'data:image/' + (candidate.endsWith('.jpg') ? 'jpeg' : extname(candidate).slice(1)) + ';base64,' + bytes.toString('base64');
      }
      case 'saveExport': {
        const destination = resolve(p.destination);
        await this.atomic(
          destination,
          p.encoding === 'base64' ? Buffer.from(p.content, 'base64') : p.content,
        );
        return destination;
      }
      case 'spellcheck':
        return this.spell.check(p.words, p.language);
      case 'spellSuggest':
        return this.spell.suggest(p.word, p.language);
      case 'spellLearn': {
        const language = await this.spell.learn(p.word, p.language),
          words = await this.learnedWords();
        words[language] = [...new Set([...(words[language] ?? []), p.word])];
        await this.atomic(
          join(this.root, 'spell-words.json'),
          JSON.stringify(words, null, 2) + '\n',
        );
        const library=z.record(z.string(),z.json()).parse(await this.json(join(this.root,'library.json'),{}));
        library.customWords=[...new Set([...Object.values(words).flat(),p.word])];
        await this.atomic(join(this.root,'library.json'),JSON.stringify(library,null,2)+'\n');
        return true;
      }
      case 'diagnostics':
        return {
          root: this.root,
          sessions: this.sessions.size,
          pid: process.pid,
          node: process.version,
          runtime:{executable:process.execPath,entry:process.argv[1]},
          telemetry: await telemetryDiagnostics(),
        };
      default:
        throw new LifecycleError('INVALID');
    }
  }
}
