'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const extensionContext=typeof location==='undefined'||location.protocol==='chrome-extension:';
if(extensionContext&&(typeof location==='undefined'||process.contextIsolated)){
 contextBridge.exposeInMainWorld('__facetExtensionHost',{
  call:(method,args)=>ipcRenderer.invoke('facet:extension-host',method,args),
  onClick:listener=>{const handler=(_event,info,tab)=>listener(info,tab);ipcRenderer.on('facet:extension-menu-click',handler);return ()=>ipcRenderer.removeListener('facet:extension-menu-click',handler);}
 });
 contextBridge.executeInMainWorld({func:()=>{
  const api=globalThis.chrome,host=globalThis.__facetExtensionHost;if(location.protocol!=='chrome-extension:'||!api||!host)return;
  const result=(promise,callback)=>{if(typeof callback!=='function')return promise;promise.then(value=>callback(value),error=>{console.error('Extension compatibility: '+error.message);callback();});};
  if(!api.contextMenus){
   const listeners=new Set(),pending=[];host.onClick((info,tab)=>{if(!listeners.size){if(pending.length<10)pending.push([info,tab]);return;}for(const fn of listeners)fn(info,tab);});
   let serial=0;
   api.contextMenus={
    create:(properties,callback)=>{const id=properties.id??'facet-menu-'+(++serial);result(host.call('menu-create',[{...properties,id}]),callback||(()=>{}));return id;},
    update:(id,properties,callback)=>result(host.call('menu-update',[id,properties]),callback),
    remove:(id,callback)=>result(host.call('menu-remove',[id]),callback),
    removeAll:callback=>result(host.call('menu-clear',[]),callback),
    onClicked:{addListener:fn=>{listeners.add(fn);for(const args of pending.splice(0))fn(...args);},removeListener:fn=>listeners.delete(fn),hasListener:fn=>listeners.has(fn),hasListeners:()=>listeners.size}
   };
  }
  if(!api.windows)api.windows={WINDOW_ID_CURRENT:-2,WINDOW_ID_NONE:-1,getCurrent:(info,callback)=>result(host.call('window',[]),typeof info==='function'?info:callback),getLastFocused:(info,callback)=>result(host.call('window',[]),typeof info==='function'?info:callback)};
  const tabs=api.tabs;if(!tabs)return;
  if(typeof tabs.get==='function'){const get=tabs.get.bind(tabs);tabs.get=(id,callback)=>result(Promise.all([get(id),host.call('target',[])]).then(([tab,target])=>tab.id===target.tabId?{...tab,active:true,windowId:target.windowId}:tab),callback);}
  if(typeof tabs.query==='function'){const query=tabs.query.bind(tabs);tabs.query=(info,callback)=>{if(info?.active!==true)return query(info,callback);const filters={...info};delete filters.active;return result(Promise.all([query(filters),host.call('target',[])]).then(([rows,target])=>rows.filter(x=>x.id===target.tabId).map(x=>({...x,active:true,windowId:target.windowId}))),callback);};}
  if(globalThis.browser){for(const key of ['contextMenus','windows','tabs'])Object.defineProperty(globalThis.browser,key,{configurable:true,value:api[key]});}
 }});
}
