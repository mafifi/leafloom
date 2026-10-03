const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('spikeHost',{save:(document:unknown)=>ipcRenderer.invoke('spike:save',document),load:()=>ipcRenderer.invoke('spike:load'),path:()=>ipcRenderer.invoke('spike:path')});
