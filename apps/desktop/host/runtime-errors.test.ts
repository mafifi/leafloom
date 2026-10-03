import { it, expect } from 'vitest';
import { mkdtemp, readFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeErrorReport } from '@leafloom/desktop-host';
import { reportRuntimeError, runtimeErrorLogLimit } from './runtime-errors';
it('validates fixed content-free reports and serializes concurrent records into a bounded real log', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-errors-'));
  try {
    const report = {
      source: 'renderer',
      code: 'UNEXPECTED_RUNTIME',
      at: '2026-10-03T01:30:00.000Z',
    };
    expect(() => RuntimeErrorReport.parse({ ...report, message: 'Secret author prose' })).toThrow();
    expect(() => RuntimeErrorReport.parse({ ...report, source: 'Secret title' })).toThrow();
    await Promise.all(
      Array.from({ length: 1800 }, (_, i) =>
        reportRuntimeError(root, { ...report, source: i % 2 ? 'promise' : 'renderer' }),
      ),
    );
    const bytes = await readFile(join(root, 'leafloom-errors.log'));
    expect(bytes.length).toBeLessThanOrEqual(runtimeErrorLogLimit);
    const rows = bytes
      .toString('utf8')
      .trim()
      .split('\n')
      .map((row) => RuntimeErrorReport.parse(JSON.parse(row)));
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.at(-1)?.source).toBe('promise');
    expect(bytes.toString()).not.toContain('Secret');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('swallows logging failures and refuses a symlink without modifying its target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-errors-denied-'));
  try {
    const target = join(root, 'author');
    await mkdir(target);
    await symlink(target, join(root, 'leafloom-errors.log'));
    await expect(
      reportRuntimeError(root, {
        source: 'promise',
        code: 'UNEXPECTED_RUNTIME',
        at: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
    expect(await readFile(join(root, 'leafloom-errors.log')).catch(() => null)).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
