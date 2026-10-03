import { open, mkdir, rename, unlink, rmdir, lstat } from 'node:fs/promises';
import {constants} from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  Checkpoint,
  SourceBook,
  Manuscript,
  Reviews,
  LifecycleError,
  type DocumentName,
  type Opened,
  type Receipt,
  type CheckpointValue,
} from '@leafloom/editor-contracts';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
export type Stage =
  'temporary.synced' | 'backup.replaced' | 'current.replaced' | 'directory.synced';
const names = {
  manuscript: 'manuscript.json',
  notes: 'notes.html',
  outline: 'outline.html',
  reviews: 'reviews.json',
} as const;
export const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};
type Owner = { pid: number; token: string };
const validOwner = (owner: Owner) =>
  !!owner &&
  Number.isSafeInteger(owner.pid) &&
  owner.pid > 0 &&
  typeof owner.token === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(owner.token);
export class BookFiles {
  private queue: Promise<void> = Promise.resolve();
  private checkpoints: Promise<void> = Promise.resolve();
  private partial = new Map<DocumentName, { expected: string; etag: string }>();
  private owner: Owner | null = null;
  private ownerDirectory: string | null = null;
  private uncertain = new Map<DocumentName, { expected: string; etag: string; revision: number }>();
  readonly root: string;
  private barrier?: (stage: Stage) => Promise<void>;
  constructor(root: string, barrier?: (stage: Stage) => Promise<void>) {
    this.root = root;
    this.barrier = barrier;
  }
  private async read(path: string) {
    try {
      if ((await lstat(path)).isSymbolicLink()) throw new LifecycleError('INVALID');
      const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
      try{
        if(!(await file.stat()).isFile())throw new LifecycleError('INVALID');
        return new TextDecoder('utf-8', { fatal: true,ignoreBOM:true }).decode(await file.readFile());
      }finally{await file.close();}
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      if((e as NodeJS.ErrnoException).code==='ELOOP')throw new LifecycleError('INVALID');
      throw e;
    }
  }
  private async write(path: string, value: string) {
    const file = await open(path, 'wx', 0o600);
    try {
      await file.writeFile(value, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
  }
  private ordered<T>(op: () => Promise<T>) {
    const next = this.queue.then(op);
    this.queue = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  private async syncDir() {
    const directory = await open(this.root, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  async acquire() {
    if (this.owner) {
      await this.verifyOwner();
      return this.owner.token;
    }
    await mkdir(this.root, { recursive: true });
    const directory=await this.directoryIdentity();
    const lock = join(this.root, '.writer.lock'),
      recovery = join(this.root, '.writer-recovery');
    try {
      await lstat(recovery);
      throw new LifecycleError('BUSY');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    const owner = { pid: process.pid, token: randomUUID() };
    try {
      await this.write(lock, JSON.stringify(owner));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      let previous: Owner;
      try {
        previous = JSON.parse((await this.read(lock))!);
      } catch {
        throw new LifecycleError('BUSY');
      }
      if (!validOwner(previous) || alive(previous.pid)) throw new LifecycleError('BUSY');
      try {
        await mkdir(recovery);
      } catch {
        throw new LifecycleError('BUSY');
      }
      try {
        const current = JSON.parse((await this.read(lock))!) as Owner;
        if (
          !validOwner(current) ||
          current.token !== previous.token ||
          current.pid !== previous.pid ||
          alive(current.pid)
        )
          throw new LifecycleError('BUSY');
        await unlink(lock);
        await this.write(lock, JSON.stringify(owner));
      } finally {
        await rmdir(recovery);
      }
    }
    this.owner = owner;
    this.ownerDirectory = directory;
    await this.verifyOwner();
    return owner.token;
  }
  private async directoryIdentity() {
    const directory=await lstat(this.root,{bigint:true});
    if(directory.isSymbolicLink()||!directory.isDirectory())throw new LifecycleError('INVALID');
    return `${directory.dev}:${directory.ino}`;
  }
  private async verifyOwner() {
    if (!this.owner) throw new LifecycleError('UNAUTHORIZED');
    let current: Owner;
    try {
      if(await this.directoryIdentity()!==this.ownerDirectory)throw new LifecycleError('UNAUTHORIZED');
      current = JSON.parse((await this.read(join(this.root, '.writer.lock')))!);
    } catch {
      throw new LifecycleError('UNAUTHORIZED');
    }
    if (
      !validOwner(current) ||
      current.token !== this.owner.token ||
      current.pid !== this.owner.pid
    )
      throw new LifecycleError('UNAUTHORIZED');
  }
  async release() {
    await this.checkpoints;
    await this.queue;
    if (!this.owner) return;
    const lock = join(this.root, '.writer.lock');
    try {
      if(await this.directoryIdentity()!==this.ownerDirectory)return;
      const text=await this.read(lock);
      if(text===null)return;
      const current = JSON.parse(text) as Owner;
      if (validOwner(current)&&current.token === this.owner.token&&current.pid===this.owner.pid) await unlink(lock);
    } catch(error) {
      if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
    } finally {
      this.owner = null;
      this.ownerDirectory = null;
    }
  }
  private valid(name: DocumentName, value: string) {
    if (name !== 'manuscript' && name !== 'reviews') return true;
    try {
      return (name === 'manuscript' ? SourceBook : Reviews).safeParse(JSON.parse(value)).success;
    } catch {
      return false;
    }
  }
  private async readVersion(
    name: DocumentName,
    recover: boolean,
  ): Promise<{ text: string; recovered: boolean }> {
    const file = join(this.root, names[name]);
    let current: string | null,
      invalidEncoding = false;
    try {
      current = await this.read(file);
    } catch (e) {
      if (e instanceof TypeError) {
        current = null;
        invalidEncoding = true;
      } else throw e;
    }
    if (!invalidEncoding && current !== null && this.valid(name, current))
      return { text: current, recovered: false };
    let backup: string | null;
    try {
      backup = await this.read(file + '.bak');
    } catch (error) {
      if (error instanceof TypeError) backup = null;
      else throw error;
    }
    if (backup !== null && this.valid(name, backup)) {
      if (recover) {
        if (!this.owner) throw new LifecycleError('UNAUTHORIZED');
        await this.atomic(name, backup, null);
      }
      return { text: backup, recovered: true };
    }
    if (name !== 'manuscript' && current === null && !invalidEncoding)
      return { text: '', recovered: false };
    throw new LifecycleError('CORRUPT');
  }
  private async atomic(name: DocumentName, text: string, expected: string | null) {
    await this.verifyOwner();
    let replaced = false;
    const file = join(this.root, names[name]),
      temporary = file + '.' + randomUUID() + '.tmp',
      backup = file + '.' + randomUUID() + '.bak.tmp';
    try {
      await this.write(temporary, text);
      await this.barrier?.('temporary.synced');
      let previous: string | null;
      try {
        previous = await this.read(file);
      } catch (e) {
        if (e instanceof TypeError && expected === null) previous = null;
        else throw e;
      }
      if (expected !== null && hash(previous ?? '') !== expected)
        throw new LifecycleError('EXTERNAL_CHANGE');
      if (previous !== null && this.valid(name, previous)) {
        await this.write(backup, previous);
        await rename(backup, file + '.bak');
        await this.syncDir();
      }
      await this.barrier?.('backup.replaced');
      if (expected !== null && hash((await this.read(file)) ?? '') !== expected)
        throw new LifecycleError('EXTERNAL_CHANGE');
      await this.verifyOwner();
      await rename(temporary, file);
      replaced = true;
      await this.barrier?.('current.replaced');
      await this.syncDir();
      await this.barrier?.('directory.synced');
    } catch (error) {
      if (replaced) throw new LifecycleError('SAVE_UNCERTAIN');
      if((error as NodeJS.ErrnoException).code==='ENOSPC')throw new LifecycleError('DISK_FULL');
      throw error;
    } finally {
      for (const path of [temporary, backup])
        try {
          await unlink(path);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
    }
  }
  replaceSource(raw: unknown, expected: string): Promise<void> {
    if (!this.owner) return Promise.reject(new LifecycleError('UNAUTHORIZED'));
    const book = SourceBook.parse(raw),
      text = JSON.stringify(book, null, 2) + '\n';
    return this.ordered(async () => {
      if (!this.owner) throw new LifecycleError('UNAUTHORIZED');
      await this.atomic('manuscript', text, expected);
    });
  }
  load(recover = true): Promise<Opened> {
    return this.ordered(async () => {
      const manuscript = await this.readVersion('manuscript', recover),
        notes = await this.readVersion('notes', recover),
        outline = await this.readVersion('outline', recover),
        reviews = await this.readVersion('reviews', recover);
      const book = SourceBook.parse(JSON.parse(manuscript.text));
      const reviewState = reviews.text ? Reviews.parse(JSON.parse(reviews.text)) : null;
      const mismatchedReviews =
        reviewState !== null &&
        (reviewState.bookId !== book.metadata.id ||
          !('version' in book) ||
          reviewState.version !== book.version);
      return {
        book,
        notes: notes.text,
        outline: outline.text,
        reviews: reviewState,
        versions: {
          manuscript: hash(manuscript.text),
          notes: hash(notes.text),
          outline: hash(outline.text),
          reviews: hash(reviews.text),
        },
        recovered:
          manuscript.recovered ||
          notes.recovered ||
          outline.recovered ||
          reviews.recovered ||
          mismatchedReviews,
      };
    });
  }

  save(
    name: DocumentName,
    raw: unknown,
    expected: string,
    revision: number,
  ): Promise<{ name: DocumentName; revision: number; etag: string }> {
    if (!this.owner) return Promise.reject(new LifecycleError('UNAUTHORIZED'));
    let text: string;
    try {
      if (name === 'manuscript') {
        const book = Manuscript.parse(raw);
        if (book.revision !== revision) throw new LifecycleError('INVALID');
        text = JSON.stringify(book, null, 2) + '\n';
      } else if (name === 'reviews') {
        text = JSON.stringify(Reviews.parse(raw), null, 2) + '\n';
      } else {
        if (typeof raw !== 'string') throw new LifecycleError('INVALID');
        text = raw;
      }
    } catch (e) {
      return Promise.reject(e);
    }
    return this.ordered(async () => {
      if (!this.owner) throw new LifecycleError('UNAUTHORIZED');
      await this.verifyOwner();
      const current = await this.readVersion(name, false);
      if (hash(current.text) !== expected) {
        const pending = this.uncertain.get(name);
        if (
          pending &&
          pending.expected === expected &&
          pending.etag === hash(text) &&
          pending.revision === revision &&
          hash(current.text) === pending.etag
        ) {
          try {
            await this.syncDir();
          } catch {
            throw new LifecycleError('SAVE_UNCERTAIN');
          }
          this.uncertain.delete(name);
          return { name, revision, etag: pending.etag };
        }
        throw new LifecycleError('EXTERNAL_CHANGE');
      }
      if (
        name === 'manuscript' &&
        text !== current.text &&
        JSON.parse(current.text).formatVersion === 'neo-composed/v1' &&
        JSON.parse(current.text).revision >= revision
      )
        throw new LifecycleError('INVALID');
      if (text !== current.text)
        try {
          await this.atomic(name, text, expected);
        } catch (error) {
          if (error instanceof LifecycleError && error.code === 'SAVE_UNCERTAIN')
            this.uncertain.set(name, { expected, etag: hash(text), revision });
          throw error;
        }
      return { name, revision, etag: hash(text) };
    });
  }
  checkpoint(raw: unknown, expected: Opened['versions'], traceparent?: string): Promise<Receipt> {
    const value = Checkpoint.parse(raw),
      baseline = { ...expected };
    const next = this.checkpoints.then(async () => {
      let parent = context.active();
      if (
        traceparent &&
        /^00-(?!0{32}-)[0-9a-f]{32}-(?!0{16}-)[0-9a-f]{16}-0[01]$/.test(traceparent)
      ) {
        const [, traceId, spanId, flags] = traceparent.split('-');
        parent = trace.setSpanContext(parent, {
          traceId,
          spanId,
          traceFlags: parseInt(flags, 16),
          isRemote: true,
        });
      }
      const span = trace
        .getTracer('@leafloom/filesystem-documents', '0.1.0')
        .startSpan('documents.checkpoint', {}, parent);
      try {
        await this.verifyOwner();
        const current = await this.load(false),
          versions = { ...baseline };
        for (const name of Object.keys(versions) as DocumentName[]) {
          if (current.versions[name] !== versions[name]) {
            const uncertain = this.uncertain.get(name);
            if (uncertain?.expected === versions[name] && uncertain.etag === current.versions[name])
              continue;
            const partial = this.partial.get(name);
            if (
              !partial ||
              partial.expected !== versions[name] ||
              partial.etag !== current.versions[name]
            )
              throw new LifecycleError('EXTERNAL_CHANGE');
            versions[name] = partial.etag;
          }
        }
        for (const name of ['reviews', 'notes', 'outline', 'manuscript'] as const) {
          const content =
            name === 'manuscript' ? value.book : name === 'reviews' ? value.reviews : value[name];
          const receipt = await this.save(name, content, versions[name], value.book.revision);
          this.partial.set(name, { expected: baseline[name], etag: receipt.etag });
          versions[name] = receipt.etag;
        }
        await this.verifyOwner();
        this.partial.clear();
        return { revision: value.book.revision, versions };
      } catch (e) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw e;
      } finally {
        span.end();
      }
    });
    this.checkpoints = next.then(
      () => {},
      () => {},
    );
    return next;
  }
}
