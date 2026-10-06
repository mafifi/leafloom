// @vitest-environment jsdom
import {it, expect} from 'vitest';
import {get} from 'svelte/store';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './application-fixture';
it('shared script contact stages native text and flushes one library write on close without changing author book history', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newScript(get(f.vm.state).library.shelves[0].id);
    const editor = f.vm.editor!, version = editor.historyVersion,
      id = get(f.vm.state).book!.id, request = f.host.request.bind(f.host);
    let writes = 0;
    f.host.request = async (method, payload) => {
      if (method === 'writeLibrary') writes++;
      return request(method, payload);
    };
    const contact = 'Ada Writer\nLondon';
    for (let length = 1; length <= contact.length; length++)
      f.vm.editScriptTitle('contact', contact.slice(0, length));
    expect(get(f.vm.state).library.scriptContact).toBe(contact);
    expect(writes).toBe(0);
    expect(editor.historyVersion).toBe(version);
    await f.vm.closeBook();
    expect(writes).toBe(1);
    expect(JSON.parse(await readFile(join(f.provider.root, 'library.json'), 'utf8')).scriptContact).toBe(contact);
    await f.vm.openBook(id);
    expect(f.vm.editor!.historyVersion).toBe(version);
    expect(get(f.vm.state).library.scriptContact).toBe(contact);
  } finally { await f.close(); }
});
it('a refused contact flush retains staged text and retries through the existing library writer', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newScript(get(f.vm.state).library.shelves[0].id);
    const request = f.host.request.bind(f.host);
    let refused = false;
    f.host.request = async (method, payload) => {
      if (method === 'writeLibrary' && !refused) {
        refused = true;
        return {ok: false, code: 'WRITE_REFUSED'};
      }
      return request(method, payload);
    };
    f.vm.editScriptTitle('contact', 'Ada Writer\nLondon');
    await expect(f.vm.finishScriptContact()).rejects.toThrow('WRITE_REFUSED');
    expect(get(f.vm.state).library.scriptContact).toBe('Ada Writer\nLondon');
    await f.vm.finishScriptContact();
    expect(JSON.parse(await readFile(join(f.provider.root, 'library.json'), 'utf8')).scriptContact).toBe('Ada Writer\nLondon');
  } finally { await f.close(); }
});
it('Save flushes staged shared contact before publication can read the library file', async () => {
  const f = await fixture();
  try {
    await f.vm.onboard('Writer', 'pantser');
    await f.vm.newScript(get(f.vm.state).library.shelves[0].id);
    f.vm.editScriptTitle('contact', 'Current contact\nLondon');
    await f.vm.save();
    expect(JSON.parse(await readFile(join(f.provider.root, 'library.json'), 'utf8')).scriptContact).toBe('Current contact\nLondon');
  } finally { await f.close(); }
});
