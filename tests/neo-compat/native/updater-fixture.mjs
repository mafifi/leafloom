/** Private signed loopback package. SDK installs only a disposable bundle, never the running app. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, chmod, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const sha = (value) => createHash('sha256').update(value).digest('hex');
export async function prepareUpdaterFixture({ fixture, artifacts, binary }) {
  assert.equal(process.platform, 'darwin');
  assert.ok((await stat(join(fixture, '.leafloom-fixture'))).isFile());
  const output = join(artifacts, 'updater');
  await mkdir(output, { recursive: true });
  const bundle = join(fixture, 'Disposable.app'),
    executable = join(bundle, 'Contents/MacOS/fixture');
  const stage = join(fixture, 'updater-stage'),
    incoming = join(stage, 'Disposable.app');
  await mkdir(join(bundle, 'Contents/MacOS'), { recursive: true });
  await writeFile(executable, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await writeFile(join(bundle, 'Contents/version.txt'), 'old disposable bundle\n');
  const retainTarget = async (stage, names) => {
    const files = {};
    await mkdir(join(output, stage), { recursive: true });
    for (const name of names) {
      const bytes = await readFile(join(bundle, 'Contents', name));
      await mkdir(join(output, stage, 'Contents', name.split('/').slice(0, -1).join('/')), {
        recursive: true,
      });
      await writeFile(join(output, stage, 'Contents', name), bytes);
      files['Contents/' + name] = { sha256: sha(bytes), bytes: bytes.length };
    }
    const bytes = Buffer.from(JSON.stringify({ files }, null, 2) + '\n');
    await writeFile(join(output, stage, 'manifest.json'), bytes);
    return { directory: stage, manifestSha256: sha(bytes), files };
  };
  const previousTarget = await retainTarget('previous', ['version.txt', 'MacOS/fixture']);
  await mkdir(join(incoming, 'Contents/MacOS'), { recursive: true });
  await writeFile(join(incoming, 'Contents/MacOS/fixture'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const installed = Buffer.from('signed private updater fixture 0.2.0\n');
  await writeFile(join(incoming, 'Contents/version.txt'), installed);
  // Incompressible fixture bytes produce real multiple download progress callbacks.
  await writeFile(join(incoming, 'Contents/payload.bin'), randomBytes(262144));
  const tar = join(fixture, 'private-update.app.tar.gz');
  await exec('/usr/bin/tar', ['-czf', tar, '-C', stage, 'Disposable.app'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  const key = join(fixture, 'private-update.key');
  // Signer output contains private material: capture it and never print or retain it in artifacts.
  const cli = resolve('node_modules/@tauri-apps/cli/tauri.js');
  await exec(process.execPath, [cli, 'signer', 'generate', '--ci', '-w', key, '-p', '']);
  await chmod(key, 0o600);
  await exec(process.execPath, [cli, 'signer', 'sign', '-f', key, '-p', '', tar]);
  const pubkey = (await readFile(key + '.pub', 'utf8')).trim();
  const signature = (await readFile(tar + '.sig', 'utf8')).trim();
  const payload = await readFile(tar);
  await writeFile(join(output, 'package.app.tar.gz'), payload);
  await writeFile(join(output, 'public-key.txt'), pubkey);
  await writeFile(join(output, 'signature.txt'), signature);
  let phase = 'bad-signature',
    requests = [];
  const server = createServer(async (req, res) => {
    requests.push({ path: req.url, phase });
    if (req.url === '/feed') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          version: '0.2.0',
          notes: 'Private signed update fixture',
          pub_date: '2026-10-03T00:00:00Z',
          url: `http://127.0.0.1:${server.address().port}/package`,
          signature:
            phase === 'bad-signature'
              ? Buffer.from('invalid minisign fixture').toString('base64')
              : signature,
        }),
      );
    } else if (req.url === '/package') {
      res.setHeader('Content-Length', payload.length);
      res.setHeader('Content-Type', 'application/octet-stream');
      for (let i = 0; i < payload.length; i += 32768) {
        if (res.destroyed) break;
        res.write(payload.subarray(i, i + 32768));
        await new Promise((r) => setTimeout(r, 10));
      }
      res.end();
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const endpoint = `http://127.0.0.1:${server.address().port}/feed`;
  await writeFile(
    join(fixture, '.leafloom-updater.json'),
    JSON.stringify({ endpoint, pubkey, executable }),
  );
  const helperSha256 = sha(await readFile(new URL(import.meta.url)));
  let preparation;
  return {
    async prepare(first, { bookId }) {
      await first.script('window.__fixtureUpdates=[];return true;');
      await first.request('/session/' + first.session + '/execute/async', {
        script:
          'const done=arguments[arguments.length-1];window.__TAURI__.event.listen("leafloom:update",event=>window.__fixtureUpdates.push(event.payload)).then(()=>done(true)).catch(error=>done({error:String(error)}));',
        args: [],
      });
      const os = async (method) => {
        const result = await first.invoke('os_request', { method, payload: {} });
        assert.equal(result.ok, true);
        return result.value;
      };
      const initial = await os('updateStatus');
      assert.equal(initial.status, 'idle');
      const bad = await os('checkForUpdates');
      assert.equal(bad.status, 'error');
      assert.equal(bad.code, 'UPDATE_SIGNATURE');
      phase = 'valid';
      const ready = await os('checkForUpdates');
      assert.equal(ready.status, 'ready');
      const events = await first.script('return window.__fixtureUpdates;');
      assert.ok(events.some((v) => v.status === 'downloading' && v.transferred > 0));
      assert.ok(events.some((v) => v.status === 'ready'));
      assert.equal(
        await readFile(join(bundle, 'Contents/version.txt'), 'utf8'),
        'old disposable bundle\n',
        'Download must not install',
      );
      // Actual failed durable close must keep the process and verified pending package alive.
      await first.click('.tab[data-tab="notes"]');
      await first.script(
        'const el=document.querySelector("#aux-editor .ProseMirror");el.focus();const r=document.createRange();r.selectNodeContents(el);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);return true;',
      );
      const folder = join(fixture, bookId),
        mode = (await stat(folder)).mode & 0o777;
      try {
        await chmod(folder, 0o555);
        await first.type('#aux-editor .ProseMirror', ' Failed-save retained.');
        await os('restartToUpdate');
        await first.until(
          () => first.script('return document.body.innerText.includes("DISK_ERROR")'),
          'real denied save hint',
        );
        assert.equal(first.child.exitCode, null);
        assert.equal((await os('updateStatus')).status, 'ready');
        assert.equal(
          await readFile(join(bundle, 'Contents/version.txt'), 'utf8'),
          'old disposable bundle\n',
        );
        assert.ok(
          await first.script(
            'return document.querySelector("#aux-editor")?.textContent.includes("Failed-save retained.")',
          ),
        );
      } finally {
        await chmod(folder, mode);
      }
      await first.click('#back-to-shelf');
      await first.until(
        () => first.script('return !!document.querySelector("#bookshelf-view")'),
        'failed-save recovery shelf',
      );
      await first.click('.book[data-book-id="' + bookId + '"]');
      await first.until(
        () => first.script('return !!document.querySelector(".chapter-body .ProseMirror")'),
        'writing reopened after failed close',
      );
      await os('closeWindow');
      await first.until(async () => {
        const reply = await first.invoke('host_request', { method: 'runtimeState', payload: {} });
        return reply.ok === true && reply.value?.ok === true && reply.value.value?.openBooks === 0;
      }, 'ordinary close releases writing lease');
      assert.equal(
        first.child.exitCode,
        null,
        'Ordinary macOS window close keeps application alive',
      );
      assert.equal((await os('getWindowState')).visible, false);
      assert.equal(
        await readFile(join(bundle, 'Contents/version.txt'), 'utf8'),
        'old disposable bundle\n',
        'Ordinary window close never installs',
      );
      assert.equal((await os('updateStatus')).status, 'ready');
      await first.until(
        () => first.script('return !!document.querySelector("#bookshelf-view")'),
        'ordinary close shelf',
      );
      await first.click('.book[data-book-id="' + bookId + '"]');
      await first.until(
        () => first.script('return !!document.querySelector(".tab[data-tab=manuscript]")'),
        'open after ordinary window close',
      );
      await first.click('.tab[data-tab="manuscript"]');
      await first.until(
        () => first.script('return !!document.querySelector(".chapter-body .ProseMirror")'),
        'manuscript author surface',
      );
      preparation = {
        initial,
        bad,
        ready,
        events,
        failedSaveKeptProcess: true,
        failedSaveCommand: 'restartToUpdate',
        ordinaryWindowCloseDidNotInstall: true,
        downloadDidNotInstall: true,
      };
    },
    async inspect({ launches, quitRestart }) {
      assert.ok(preparation);
      assert.equal(quitRestart.exitCode, 0);
      const marker = await readFile(join(bundle, 'Contents/version.txt'));
      assert.ok(marker.equals(installed));
      assert.ok(
        (await readFile(join(bundle, 'Contents/payload.bin'))).equals(
          await readFile(join(incoming, 'Contents/payload.bin')),
        ),
      );
      assert.equal(
        sha(await readFile(binary)),
        launches[0].binding.binarySha256,
        'Running binary is never replaced',
      );
      assert.equal(sha(await readFile(new URL(import.meta.url))), helperSha256);
      const installedTarget = await retainTarget('installed', [
        'version.txt',
        'payload.bin',
        'MacOS/fixture',
      ]);
      const facts = {
        previousTarget,
        installedTarget,
        ...preparation,
        contractId: 'updates:signed-quit',
        helperSha256,
        endpoint,
        disposableBundle: bundle,
        payloadSha256: sha(payload),
        signatureSha256: sha(Buffer.from(signature)),
        publicKeySha256: sha(Buffer.from(pubkey)),
        installedMarkerSha256: sha(marker),
        installedPayloadSha256: sha(await readFile(join(bundle, 'Contents/payload.bin'))),
        requests,
        qualification:
          'Signed loopback Tauri SDK download and install into separate private disposable bundle; unchanged native debug application explicitly restarted by fixture driver. Physical release updater and public channel remain unconfigured.',
      };
      await writeFile(join(output, 'update.json'), JSON.stringify(facts, null, 2) + '\n');
      return { ...facts, artifacts: output };
    },
    async close() {
      await new Promise((r) => server.close(r));
    },
  };
}
