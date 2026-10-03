import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createFileStore } from '../src/persistence/file-store.js';
import { ManuscriptSchema } from '../src/contracts.js';
const here=path.dirname(fileURLToPath(import.meta.url));
app.setName('NEO Editor Options Spike');
void app.whenReady().then(async()=>{
const dataDir=process.env.NEO_SPIKE_DATA_DIR??path.join(app.getPath('userData'),'editor-options-spike');
const file=path.join(dataDir,'manuscript.json');const store=createFileStore(file);
const win=new BrowserWindow({width:1440,height:960,title:'NEO · Editor options spike',webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
function authorized(event:Electron.IpcMainInvokeEvent){if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('Invalid spike sender');}
ipcMain.handle('spike:save',async(event,value:unknown)=>{authorized(event);await store.save(ManuscriptSchema.parse(value));});
ipcMain.handle('spike:load',async(event)=>{authorized(event);return store.load();});
ipcMain.handle('spike:path',event=>{authorized(event);return file;});
await win.loadFile(path.resolve(here,'../../dist/index.html'));
let closing=false;
win.on('close',event=>{if(closing)return;event.preventDefault();closing=true;void win.webContents.executeJavaScript('window.spike?.save(true)').then(()=>win.destroy()).catch(error=>{closing=false;console.error('Close save failed',error);});});
app.on('window-all-closed',()=>app.quit());

});
