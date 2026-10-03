import { app,BrowserWindow,ipcMain } from 'electron';import { join,dirname,resolve } from 'node:path';import { fileURLToPath } from 'node:url';import { realpath,mkdir,readFile,writeFile } from 'node:fs/promises';import { tmpdir } from 'node:os';
import { Envelope,LifecycleError,type Opened } from './contracts';import { BookFiles } from './files';import { importNeo } from '../lifecycle-spike/legacy';import { CompositionTelemetry,type Stage } from './telemetry';
const here=dirname(fileURLToPath(import.meta.url)),root=process.env.NEO_COMPOSITION_ROOT;if(!root)throw new Error('A private lifecycle fixture is required');const canonical=await realpath(root);if(!canonical.startsWith((await realpath(tmpdir()))+'/')||(await readFile(join(canonical,'.composition-fixture'),'utf8'))!=='neo-composition-v1')throw new Error('Invalid private lifecycle root');
app.setName('NEO Parity');await mkdir(join(canonical,'profile'),{recursive:true});app.setPath('userData',join(canonical,'profile'));app.setPath('temp',canonical);if(process.platform==='darwin')app.setActivationPolicy('accessory');
const telemetry=new CompositionTelemetry();type Session={win:BrowserWindow;files:BookFiles;lease:string|null;dirty:number|null;closed:boolean};const sessions=new Map<number,Session>();
const diskError=(error:unknown)=>error instanceof LifecycleError?error:new LifecycleError('DISK_ERROR');
async function createWindow(){const win=new BrowserWindow({show:false,width:1440,height:1000,title:'NEO composition spike',webPreferences:{preload:join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});const session:Session={win,files:new BookFiles(join(canonical,'book')),lease:null,dirty:null,closed:false};const senderId=win.webContents.id;sessions.set(senderId,session);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());win.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
 win.on('close',event=>{if(session.closed)return;event.preventDefault();win.webContents.send('composition:close-request');});
 win.webContents.on('render-process-gone',()=>{if(session.closed)return;void telemetry.run('host.renderer-recovery',async()=>{await session.files.release();if(session.closed)return;session.lease=null;session.closed=true;await createWindow();win.destroy();}).catch(()=>app.exit(1));});
 win.on('closed',()=>{sessions.delete(senderId);void session.files.release();});
 await win.loadFile(resolve(here,'../index.html'));return win;
}
ipcMain.handle('composition:request',async(event,payload:unknown):Promise<{ok:true;value:unknown}|{ok:false;code:string}>=>{
 const session=sessions.get(event.sender.id);if(!session||event.senderFrame!==session.win.webContents.mainFrame)return{ok:false,code:'UNAUTHORIZED'};
 const parsed=Envelope.safeParse(payload);if(!parsed.success)return{ok:false,code:'INVALID'};const {command,traceparent}=parsed.data;
 try{const operation=async(ctx:import('@opentelemetry/api').Context):Promise<unknown>=>{
  switch(command.method){
   case'open':{try{session.lease=await session.files.acquire();}catch(e){if(!(e instanceof LifecycleError)||e.code!=='BUSY')throw e;}const opened=await session.files.load(!!session.lease);return{...opened,lease:session.lease,readOnly:!session.lease} satisfies Opened&{lease:string|null;readOnly:boolean};}
   case'save':{if(!session.lease||command.lease!==session.lease)throw new LifecycleError('UNAUTHORIZED');const receipt=await telemetry.run('storage.checkpoint',async()=>{try{return await session.files.checkpoint(command.checkpoint,command.expected);}catch(e){throw diskError(e);}},ctx);if((session.dirty??0)<=receipt.revision)session.dirty=null;return receipt;}
   case'dirty':{session.dirty=Math.max(command.revision,session.dirty??0);return null;}
   case'close':session.win.close();return null;
   case'finish-close':{if(!command.discard&&session.dirty!==null)throw new LifecycleError('UNSAVED');await session.files.release();session.closed=true;setImmediate(()=>session.win.destroy());return null;}
   case'diagnostics':return telemetry.report();
  }
 };
 const stage:Stage|undefined=({open:'ipc.open',save:'ipc.save','finish-close':'ipc.close'} as Partial<Record<typeof command.method,Stage>>)[command.method];const value=stage?await telemetry.run(stage,operation,telemetry.parent(traceparent)):await operation(telemetry.parent(traceparent)??(await import('@opentelemetry/api')).context.active());return{ok:true,value};
 }catch(error){return{ok:false,code:error instanceof LifecycleError?error.code:'DISK_ERROR'};}
});
await app.whenReady();app.dock?.hide();try{await readFile(join(canonical,'book','manuscript.json'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await importNeo(join(canonical,'source'),join(canonical,'book'));}await createWindow();
app.on('window-all-closed',()=>app.quit());