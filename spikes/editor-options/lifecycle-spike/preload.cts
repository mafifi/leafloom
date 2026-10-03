const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('lifecycleHost',{
 request:(command:unknown,traceparent?:string)=>ipcRenderer.invoke('lifecycle:request',{requestId:crypto.randomUUID(),command,...(traceparent?{traceparent}:{})}),
 onCloseRequested:(listener:()=>void)=>{const handler=()=>listener();ipcRenderer.on('lifecycle:close-request',handler);return()=>ipcRenderer.removeListener('lifecycle:close-request',handler);}
});
