// A host boundary for renderer-only original-reference journeys. The pinned
// source, native editing engine, preload and document handlers remain unchanged.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const electron = require('electron');
const root = process.env.NEO_PARITY_DATA_DIR;
if (!root || !path.isAbsolute(root)) throw Error('Hidden original host requires private fixture');
const fixture = fs.realpathSync(root);
if (!fixture.startsWith(fs.realpathSync(os.tmpdir()) + path.sep) || fs.readFileSync(path.join(fixture, '.neo-parity-fixture'), 'utf8') !== 'isolated-neo-parity-v1') throw Error('Invalid hidden original fixture');
const effects = [];
const record = type => {
  effects.push(type);
  fs.writeFileSync(path.join(fixture, 'hidden-host-effects.json'), JSON.stringify(effects));
};
if (process.platform === 'darwin') electron.app.setActivationPolicy('prohibited');
const Window = new Proxy(electron.BrowserWindow, {
  construct(target, args) {
    const win = Reflect.construct(target, [{ ...(args[0] || {}), show: false }, ...args.slice(1)], target);
    // Source may explicitly reactivate an existing window. Hidden reference
    // never acquires foreground ownership or opens a credential prompt.
    for (const action of ['show', 'showInactive', 'focus']) win[action] = () => record('suppressed-window-' + action);
    win.on('show', () => win.hide());
    return win;
  },
});
const facade = Object.create(electron);
Object.defineProperty(facade, 'BrowserWindow', { value: Window });
Object.defineProperty(facade, 'safeStorage', { value: new Proxy({}, { get: (_target, name) => () => { record('blocked-safe-storage-' + String(name)); throw Error('Credential operations require explicit foreground reference qualification'); } }) });
const load = Module._load;
Module._load = function(request, parent, ...args) {
  if (request === 'electron' && parent?.filename?.startsWith(path.join(fixture, 'source') + path.sep)) return facade;
  return load.call(this, request, parent, ...args);
};
const handle = electron.ipcMain.handle.bind(electron.ipcMain);
electron.ipcMain.handle = (channel, listener) => handle(channel, channel === 'secret:set' ? () => { record('blocked-secret-set'); throw Error('Hidden reference cannot save credentials'); } : listener);
global.__leafloomReferenceHidden = { policy: 'hidden', credentialPolicy: 'denied', effects: () => effects.slice() };
