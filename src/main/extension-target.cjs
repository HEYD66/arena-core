'use strict';
const {ipcMain}=require('electron');
const contexts=new Map(),channel='facet:extension-target';
function receive(event){
 const binding=contexts.get(event.sender);if(!binding||event.senderFrame!==event.sender.mainFrame)return null;
 const {runtime,key,extensionId}=binding,wc=runtime.view?.webContents;
 if(runtime.status!=='running'||!wc||wc.isDestroyed()||wc.session!==event.sender.session||runtime.loadedExtensions?.get(key)?.id!==extensionId)return null;
 try{if(new URL(event.senderFrame.url).protocol!=='chrome-extension:'||new URL(event.senderFrame.url).hostname!==extensionId)return null;}catch{return null;}
 return wc.id;
}
function bindExtensionTarget(win,runtime,key,extensionId){
 if(!contexts.size)ipcMain.handle(channel,receive);
 const wc=win.webContents;contexts.set(wc,{runtime,key,extensionId});
 wc.once('destroyed',()=>{contexts.delete(wc);if(!contexts.size)ipcMain.removeHandler(channel);});
}
module.exports={bindExtensionTarget};
