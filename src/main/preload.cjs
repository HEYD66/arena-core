'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const request=(action,payload={})=>ipcRenderer.invoke('core:request',{action,...payload});
contextBridge.exposeInMainWorld('arenaCore',Object.freeze({request,onState(callback){const listener=(_event,state)=>callback(state);ipcRenderer.on('core:state',listener);return ()=>ipcRenderer.removeListener('core:state',listener);},onOverlay(callback){const listener=(_event,message)=>callback(message);ipcRenderer.on('core:overlay',listener);return ()=>ipcRenderer.removeListener('core:overlay',listener);}}));
