// Runs a byte-for-byte source snapshot with a private desktop profile.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Menu, BrowserWindow, app, ipcMain, shell, dialog, systemPreferences, session, utilityProcess } = require('electron');
const requested = process.env.NEO_PARITY_DATA_DIR;
if (!requested || !path.isAbsolute(requested)) throw new Error('NEO_PARITY_DATA_DIR must be an absolute test directory');
const directory = fs.realpathSync(requested);
const marker = path.join(directory, '.neo-parity-fixture');
if (!directory.startsWith(fs.realpathSync(os.tmpdir()) + path.sep) || !fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== 'isolated-neo-parity-v1') {
  throw new Error('Refusing unmarked directory outside the temporary test root');
}
const root = process.env.NEO_REFERENCE_ROOT || path.resolve(__dirname, '../../../../tests/reference/neo');
const source = path.join(directory, 'source');
const data = path.join(directory, 'userData');
const documents = path.join(directory, 'Documents');
for (const folder of [source, data, documents]) fs.mkdirSync(folder, { recursive: true });
app.setName('NEO Parity');
app.setPath('userData', data);
app.setPath('documents', documents);
app.setPath('temp', directory);
const settings = path.join(data, 'settings.json');
if (!fs.existsSync(settings)) fs.writeFileSync(settings, JSON.stringify({ uiLanguage: 'en', libraryDir: path.join(documents, 'NEO Library') }));
const configured = JSON.parse(fs.readFileSync(settings, 'utf8'));
if (configured.libraryDir && !path.resolve(configured.libraryDir).startsWith(directory + path.sep)) throw new Error('Library path outside fixture');
const dependencies = path.resolve(__dirname, '../../node_modules');
const link = (target, destination) => {
  try { fs.lstatSync(destination); fs.rmSync(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  fs.symlinkSync(target, destination, 'dir');
};
link(dependencies, path.join(source, 'node_modules'));
const hashes = {};
for (const name of fs.readdirSync(root)) {
  const src = path.join(root, name);
  if (fs.statSync(src).isFile() && /\.(js|html|css|json)$/.test(name)) {
    const bytes = fs.readFileSync(src); fs.writeFileSync(path.join(source, name), bytes);
    hashes[name] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
}
for (const name of ['fonts', 'locales', 'build', 'covers', 'licenses']) {
  if (fs.existsSync(path.join(root, name))) link(path.join(root, name), path.join(source, name));
}
fs.writeFileSync(path.join(directory, 'source-hashes.json'), JSON.stringify(hashes, null, 2));
const engine = process.env.NEO_PARITY_ENGINE;
const persistenceBoundary = engine === 'prosemirror' ? require(path.resolve(__dirname, '../../parity-dist/persistence-boundary.cjs')) : null;
if (engine && engine !== 'prosemirror') throw new Error('Unsupported NEO_PARITY_ENGINE');
if (engine === 'prosemirror') {
  const bundle = path.resolve(__dirname, '../../parity-dist/neo-prosemirror.js');
  fs.copyFileSync(bundle, path.join(source, 'neo-prosemirror.js'));
  const indexFile = path.join(source, 'index.html');
  const html = fs.readFileSync(indexFile, 'utf8');
  if (!html.includes('<script src="app.js"></script>')) throw new Error('Original app script location changed');
  fs.writeFileSync(indexFile, html.replace('<script src="app.js"></script>', '<script src="neo-prosemirror.js"></script>\n  <script src="app.js"></script>'));
  fs.writeFileSync(path.join(directory, 'target-bundle-sha256.txt'), crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex'));
}
// Target-native Undo/Redo must dispatch the PM capability rather than Chromium history.
if(engine==='prosemirror'){
 const build=Menu.buildFromTemplate.bind(Menu);
 Menu.buildFromTemplate=function(template){
  const translate=require(path.join(source,'i18n.js')).t;
  function adapt(items){return items.map(item=>{
   const next={...item};if(Array.isArray(next.submenu))next.submenu=adapt(next.submenu);
   if(['undo','redo'].includes(next.role)){
    const role=next.role;delete next.role;next.label=translate(role==='undo'?'Undo':'Redo');
    next.accelerator=role==='undo'?'CmdOrCtrl+Z':'CmdOrCtrl+Shift+Z';
    next.click=(_item,window)=>{const win=window??BrowserWindow.getFocusedWindow()??BrowserWindow.getAllWindows()[0];win?.webContents.send('menu',{type:'pmCommand',value:role});};
   }return next;
  });}return build(adapt(template));
 };
}
// Source snapshot symlinks are recreated on restart, rather than retaining stale code.
// The profile and manuscript files remain in their private directories.
const hostFile = path.join(directory, '.neo-parity-host.json');
function hostConfig(){try{return JSON.parse(fs.readFileSync(hostFile,'utf8'));}catch(error){if(error.code==='ENOENT')return {};throw error;}}
// A host-clock fixture drives real backup rollover. Renderer clocks and timers
// remain native; only launches explicitly configured with clockNowIso use it.
if(hostConfig().clockNowIso){const NativeDate=Date,stamp=NativeDate.parse(hostConfig().clockNowIso);if(!Number.isFinite(stamp))throw new Error('Invalid fixture host clock');global.Date=new Proxy(NativeDate,{construct(target,args){return Reflect.construct(target,args.length?args:[stamp],target);},apply(){return new NativeDate(stamp).toString();},get(target,key,receiver){return key==='now'?()=>stamp:Reflect.get(target,key,receiver);}});}
function fixturePath(file){const resolved=path.resolve(file);if(!resolved.startsWith(directory+path.sep))throw new Error('Host fixture path outside isolated directory');return resolved;}
function takeResponse(){const config=hostConfig();const response=config.messageResponses?.shift();if(response!==undefined)fs.writeFileSync(hostFile,JSON.stringify(config));return response;}
const effects = [];
const record = (type, payload) => {
  effects.push({ type, payload });
  fs.writeFileSync(path.join(directory, 'intercepted-effects.json'), JSON.stringify(effects, null, 2));
};
if (systemPreferences?.setUserDefault) systemPreferences.setUserDefault = (...args) => record('system-preference', args);
shell.openExternal = async url => { record('external-url', url); };
shell.showItemInFolder = file => record('reveal-file', file);
shell.trashItem = async file => {
  if(hostConfig().trashError)throw new Error('Fixture trash failure');
  const resolved = fs.realpathSync(file);
  if (!resolved.startsWith(directory + path.sep)) throw new Error('Trash target outside fixture');
  const trash = path.join(directory, 'Trash'); fs.mkdirSync(trash, { recursive: true });
  fs.renameSync(resolved, path.join(trash, path.basename(resolved) + '-' + Date.now()));
  record('fixture-trash', resolved);
};
dialog.showOpenDialog = async()=>{const paths=hostConfig().openPaths?.map(fixturePath)??[];record('native-open',paths);return {canceled:!paths.length,filePaths:paths};};
dialog.showSaveDialog = async()=>{const file=hostConfig().savePath;const filePath=file?fixturePath(file):undefined;record('native-save',filePath??null);return {canceled:!filePath,filePath};};
dialog.showMessageBox = async(...args)=>{const options=args.at(-1);record('native-dialog',options);return {response:takeResponse()??options.cancelId??0,checkboxChecked:false};};
app.relaunch=(options)=>record('native-relaunch',options??{});
dialog.showErrorBox=(title,content)=>record('native-error-box',{title,content});
const firedStartupFaults=new Set();
function startupFault(name){const message=hostConfig().startupFaults?.[name];if(message&&!firedStartupFaults.has(name)){firedStartupFaults.add(name);record('startup-fault',{name,message});throw new Error(message);}}
// Fault the real host resource calls used by unchanged startup handlers.
// Paths are restricted to this source snapshot; user resources stay outside.
const readDirectoryAtBoundary=fs.readdirSync.bind(fs);
fs.readdirSync=(folder,...args)=>{if(typeof folder==='string'&&path.resolve(folder)===path.join(source,'locales'))startupFault('locales');return readDirectoryAtBoundary(folder,...args);};
const forkSpellAtBoundary=utilityProcess.fork.bind(utilityProcess);
utilityProcess.fork=(modulePath,...args)=>{if(path.resolve(modulePath)===path.join(source,'spell-worker.js'))startupFault('spellFork');return forkSpellAtBoundary(modulePath,...args);};
const buildMenuAtBoundary=Menu.buildFromTemplate.bind(Menu);Menu.buildFromTemplate=(template)=>{const ownTemplate=items=>items.some(item=>item.label==='Spellcheck Pass'||(Array.isArray(item.submenu)&&ownTemplate(item.submenu)));if(ownTemplate(template))startupFault('menu');return buildMenuAtBoundary(template);};
global.fetch = async (url,options={}) => {
  const config=hostConfig(); const address=String(url);
  const index=(config.httpResponses??[]).findIndex(response=>!response.match||address.includes(response.match));
  if(index<0){record('blocked-fetch',address);throw new Error('Reference harness blocks unconfigured network');}
  const [response]=config.httpResponses.splice(index,1);fs.writeFileSync(hostFile,JSON.stringify(config));
  let payload;try{payload=JSON.parse(options.body);}catch{payload=options.body;}
  record('http-request',{url:address,method:options.method??'GET',payload});
  if(response.delayMs)await new Promise(resolve=>setTimeout(resolve,response.delayMs));
  return new Response(JSON.stringify(response.body??{}),{status:response.status??200,headers:{'Content-Type':'application/json'}});
};
const childProcess=require('node:child_process');const execFile=childProcess.execFile.bind(childProcess);
childProcess.execFile=(file,args,...rest)=>{
 if(file==='osascript'&&args?.some(arg=>String(arg).includes('make new outgoing message'))){
  record('mail-draft-script',{file,args});const callback=rest.at(-1);queueMicrotask(()=>callback(hostConfig().mailError?new Error('Fixture Mail unavailable'):null));return {};
 }
 return execFile(file,args,...rest);
};
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => {
  if (['email:draft', 'cover:paint', 'update:check', 'update:install', 'update:openRelease'].includes(channel)) {
    return handle(channel, (...args) => {
      const config=hostConfig();
      if((channel==='cover:paint'||channel==='update:check')&&config.httpResponses?.length)return listener(...args);
      if((['update:check','update:install'].includes(channel)&&config.updater?.packaged)||channel==='update:openRelease'||(channel==='email:draft'&&config.allowEmailDraft))return listener(...args);
      record('blocked-ipc',channel);return {ok:false,error:'External effect disabled in reference harness'};
    });
  }
  return handle(channel, async (...args)=>{
    const config=hostConfig();const timing=config.ipcDelays?.[channel]??{};
    if(config.ipcLog&&['chapter:read','chapter:write','book:readMeta','book:writeMeta','library:read','library:write','json:read','json:write','fullscreen:escape'].includes(channel))record('ipc-start',{channel,args:args.slice(1)});
    if(timing.before)await new Promise(resolve=>setTimeout(resolve,timing.before));
    if(config.ipcFailures?.[channel])throw new Error(config.ipcFailures[channel]);
    const result=await listener(...(persistenceBoundary ? persistenceBoundary.persistenceArguments(channel,args) : args));
    if(timing.after)await new Promise(resolve=>setTimeout(resolve,timing.after));
    if(config.ipcLog&&['chapter:read','chapter:write','book:readMeta','book:writeMeta','library:read','library:write','json:read','json:write','fullscreen:escape'].includes(channel))record('ipc-complete',{channel,...(channel==='fullscreen:escape'?{result}: {})});
    return result;
  });
};
app.whenReady().then(() => session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true })));
const {EventEmitter}=require('node:events');
const updaterCalls=[];const fixtureUpdater=new EventEmitter();
fixtureUpdater.checkForUpdates=async()=>{updaterCalls.push({method:'checkForUpdates'});const config=hostConfig().updater??{};if(config.checkDelayMs)await new Promise(resolve=>setTimeout(resolve,config.checkDelayMs));if(config.checkError)throw new Error(config.checkError);return config.checkResult??{updateInfo:{version:'0.0.0'}};};
fixtureUpdater.quitAndInstall=(...args)=>{updaterCalls.push({method:'quitAndInstall',args});record('updater-install',args);};
if(hostConfig().updater?.packaged)Object.defineProperty(app,'isPackaged',{value:true});
const scheduled=[];
if(hostConfig().updater?.packaged){
 const timeout=global.setTimeout,interval=global.setInterval;
 global.setTimeout=(callback,delay,...args)=>{if([8000,15000].includes(delay)){scheduled.push({callback,delay,args,repeat:false});record('updater-schedule',{delay,repeat:false});return {unref(){}};}return timeout(callback,delay,...args);};
 global.setInterval=(callback,delay,...args)=>{if(delay===3600000){scheduled.push({callback,delay,args,repeat:true});record('updater-schedule',{delay,repeat:true});return {unref(){}};}return interval(callback,delay,...args);};
}
global.__neoParityHost={emitUpdater:(event,payload)=>fixtureUpdater.emit(event,event==='error'?new Error(payload.message??payload):payload),updaterCalls:()=>updaterCalls.slice(),fireScheduled:delay=>{for(const timer of scheduled.filter(t=>t.delay===delay)){timer.callback(...timer.args);if(!timer.repeat)scheduled.splice(scheduled.indexOf(timer),1);}},scheduled:()=>scheduled.map(({delay,repeat})=>({delay,repeat}))};
const Module = require('node:module');
const load = Module._load;
Module._load = function(request, ...args) {
  if(request==='electron-updater'&&hostConfig().updater?.packaged)return {autoUpdater:fixtureUpdater};
  if (request === 'koffi'&&((engine==='prosemirror'&&args[0]?.filename===path.join(source,'main.js'))||!hostConfig().nativeMenu)) throw new Error(engine==='prosemirror'?'Legacy native watcher replaced by TypeScript live-menu boundary':'Native menu injection disabled in reference harness');
  return load.call(this, request, ...args);
};
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function(file, ...args) { startupFault('loadFile');return loadFile.call(this, path.isAbsolute(file) ? file : path.join(source, file), ...args); };
process.chdir(source);
const nativeMenuBoundary = engine==='prosemirror'&&hostConfig().nativeMenu ? persistenceBoundary.installNativeMenuBoundary(Menu) : null;
if(nativeMenuBoundary){
 app.once('will-quit',()=>nativeMenuBoundary.dispose());
 const exit=app.exit.bind(app);app.exit=code=>{nativeMenuBoundary.dispose();return exit(code);};
}
require(path.join(source, 'main.js'));
