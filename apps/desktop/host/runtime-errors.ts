import { open, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { RuntimeErrorReport } from '@leafloom/desktop-host';

export const runtimeErrorLogLimit = 128 * 1024;
const queues = new Map<string, Promise<void>>();
/** Derived diagnostics never carry author content and never fail the author operation. */
export async function reportRuntimeError(root: string, raw: unknown): Promise<void> {
  const previous = queues.get(root) ?? Promise.resolve();
  const pending = previous
    .then(async () => {
      const report = RuntimeErrorReport.parse(raw);
      const file = join(root, 'leafloom-errors.log');
      const handle = await open(
        file,
        constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await handle.appendFile(JSON.stringify(report) + '\n');
      } finally {
        await handle.close();
      }
      const input = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      let retained: string | undefined;
      try {
        const size = (await input.stat()).size;
        if (size > runtimeErrorLogLimit) {
          const tail = Buffer.alloc(runtimeErrorLogLimit / 2);
          const { bytesRead } = await input.read(tail, 0, tail.length, size - tail.length);
          const text = tail.subarray(0, bytesRead).toString('utf8');
          // Start at a whole record; never retain a partial line or an unvalidated old payload.
          retained =
            text
              .slice(text.indexOf('\n') + 1)
              .split('\n')
              .filter(Boolean)
              .flatMap((line) => {
                try {
                  return [JSON.stringify(RuntimeErrorReport.parse(JSON.parse(line)))];
                } catch {
                  return [];
                }
              })
              .join('\n') + '\n';
        }
      } finally {
        await input.close();
      }
      if (retained !== undefined) {
        const staging = join(root, '.runtime-errors-' + randomUUID());
        try {
          const output = await open(staging, 'wx', 0o600);
          try {
            await output.writeFile(retained);
          } finally {
            await output.close();
          }
          await rename(staging, file);
        } finally {
          await rm(staging, { force: true });
        }
      }
    })
    .catch(() => {});
  queues.set(root, pending);
  await pending;
  if (queues.get(root) === pending) queues.delete(root);
}
