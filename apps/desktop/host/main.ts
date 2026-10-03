import { isAbsolute } from 'node:path';
import { createInterface } from 'node:readline';
import { CoverArtProvider,CoverProviderError } from './cover-art.ts';
import { BackupProvider } from './backups.ts';
import { LibraryHost } from './library.ts';
import { PDFExportError } from './pdf-glyphs.ts';
import { LifecycleError } from '@leafloom/editor-contracts';
import { ZodError } from 'zod';
import {installHostFatalLogging} from './fatal-errors.ts';
const root = process.env.LEAFLOOM_LIBRARY_ROOT;
if (!root || !isAbsolute(root)) throw new Error('Library root required');
installHostFatalLogging(root);
const host = new LibraryHost(root);
await host.initialize();
process.stdout.write(JSON.stringify({ ready: true, version: 1 }) + '\n');
const artWorker = process.env.LEAFLOOM_ART_WORKER === '1';
const backupTimer = setTimeout(() => {
  if (artWorker) return;
  void new BackupProvider(root)
    .create()
    .catch(() =>
      process.stderr.write(
        JSON.stringify({ event: 'backup.failure', code: 'BACKUP_UNAVAILABLE' }) + '\n',
      ),
    );
}, 5000);
backupTimer.unref();
host.subscribeEvents((payload) =>
  process.stdout.write(JSON.stringify({ event: 'document-changed', payload }) + '\n'),
);
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let queue = Promise.resolve();
for await (const line of lines) {
  queue = queue.then(async () => {
    let id: unknown;
    try {
      const request = JSON.parse(line);
      id = request.id;
      if (
        !Number.isSafeInteger(id) ||
        typeof request.method !== 'string' ||
        Object.keys(request).some((k) => !['id', 'method', 'payload', 'traceparent'].includes(k))
      )
        throw new LifecycleError('INVALID');
      let value: unknown;
      if (artWorker && request.method === '_paintCover') {
        let provider = new CoverArtProvider();
        if (process.env.LEAFLOOM_ART_FIXTURE_BASE) {
          const {stat}=await import('node:fs/promises');await stat(root+'/.leafloom-fixture');
          const base=new URL(process.env.LEAFLOOM_ART_FIXTURE_BASE);
          if(base.protocol!=='http:'||!['127.0.0.1','localhost'].includes(base.hostname))throw new LifecycleError('INVALID');
          provider=new CoverArtProvider(fetch,base.toString().replace(/\/$/,''));
        }
        const payload=request.payload as {bookId?:unknown;jobId?:unknown};
        value=await host.paintCover(request.payload,provider,status=>process.stdout.write(JSON.stringify({event:'cover-art-progress',payload:{bookId:payload.bookId,jobId:payload.jobId,status}})+'\n'));
      } else {
        if (artWorker) throw new LifecycleError('INVALID');
        if(request.method==='_prepareDeleteBook')value=await host.prepareDeleteBook(request.payload);
        else if(['_finishDeleteBook','_cancelDeleteBook'].includes(request.method))value=await host.finishDeleteBook(request.payload);
        else value=await host.request(request.method, request.payload, request.traceparent);
      }
      process.stdout.write(JSON.stringify({ id, ok: true, value }) + '\n');
    } catch (e) {
      const code =
        e instanceof PDFExportError ? e.code : e instanceof CoverProviderError ? e.code : e instanceof LifecycleError
          ? e.code
          : e instanceof ZodError || (e instanceof Error && e.message === 'INVALID')
            ? 'INVALID'
            : (e as NodeJS.ErrnoException).code === 'ENOSPC'
              ? 'DISK_FULL'
              : 'DISK_ERROR';
      process.stderr.write(JSON.stringify({ event: 'host.failure', code }) + '\n');
      process.stdout.write(JSON.stringify({ id, ok: false, code }) + '\n');
    }
  });
}
clearTimeout(backupTimer);
await queue;
await host.shutdown();
