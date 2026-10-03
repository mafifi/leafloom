import { it, expect } from 'vitest';
import { createServer, type IncomingMessage } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { developmentRequestError, readDevelopmentJSON } from '../../apps/desktop/development/request';

it('rejects browser cross-origin and simple form requests before a filesystem operation, while same-origin JSON preserves author text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'leafloom-dev-http-'));
  const file = join(root, 'author.txt');
  await writeFile(file, 'Original author text');
  const server = createServer(async (request, response) => {
    const denied = developmentRequestError(request.headers);
    if (denied) { response.writeHead(denied.status).end(); return; }
    const body = await readDevelopmentJSON(request) as { text: string };
    await writeFile(file, body.text);
    response.writeHead(200).end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Missing private HTTP fixture');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    for (const headers of [
      { origin: 'https://attacker.example', 'content-type': 'text/plain' },
      { origin: 'https://attacker.example', 'content-type': 'application/json' },
      { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' },
      { origin: url, 'content-type': 'text/plain' },
      { origin: 'null', 'content-type': 'application/json' },
    ]) {
      const reply = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ text: 'Unwanted write' }) });
      expect([403, 415]).toContain(reply.status);
      expect(await readFile(file, 'utf8')).toBe('Original author text');
    }
    const reply = await fetch(url, { method: 'POST', headers: { origin: url, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ text: '作者 café 🖋' }) });
    expect(reply.status).toBe(200);
    expect(await readFile(file, 'utf8')).toBe('作者 café 🖋');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

it('assembles split UTF-8 book bytes before decoding and refuses invalid author bytes', async () => {
  const original = { text: '作者 café 🖋' };
  async function* split() { for (const byte of Buffer.from(JSON.stringify(original))) yield Buffer.from([byte]); }
  expect(await readDevelopmentJSON(split() as unknown as IncomingMessage)).toEqual(original);
  async function* invalid() { yield Buffer.from([0x22, 0xc3, 0x22]); }
  await expect(readDevelopmentJSON(invalid() as unknown as IncomingMessage)).rejects.toThrow();
});
