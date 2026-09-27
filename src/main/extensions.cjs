'use strict';
const {BrowserWindow}=require('electron');
const {ExtensionCatalog,extensionIcon}=require('./extension-catalog.cjs');
class InstanceExtensions{
 constructor(controller,dir){this.c=controller;this.catalog=new ExtensionCatalog(dir);this.icons=new Map();}
 icon(key){if(!this.icons.has(key)){let value=null;try{value=extensionIcon(this.catalog.folder(key));}catch{}this.icons.set(key,value);}return this.icons.get(key);}
 snapshot(){return this.catalog.data.items.map(({key,...row})=>({...row,icon:this.icon(row.id),instances:this.c.store.list().map(x=>{const r=this.c.runtimes.get(x.id);return {id:x.id,enabled:this.catalog.enabled(x.id).includes(row.id),loaded:!!r?.loadedExtensions?.has(row.id),error:r?.extensionErrors?.[row.id]||''};})}));}
 async load(r,id){r.loadedExtensions=new Map();r.extensionErrors={};for(const key of this.catalog.enabled(id)){try{const e=await r.session.extensions.loadExtension(this.catalog.folder(key),{allowFileAccess:false});if([...r.loadedExtensions.values()].some(x=>x.id===e.id))throw Error('扩展ID重复');r.loadedExtensions.set(key,e);if(r.status!=='starting'||this.c.disposing||r.core&&!r.core.child)throw Error('实例已停止或代理内核退出');}catch(e){r.extensionErrors[key]='加载失败：'+require('./workspace.cjs').redact(e.message);this.unload(r);throw Error('扩展加载失败，请在扩展管理中查看或停用后再启动');}}}
 unload(r){for(const w of r.extensionWindows||[]){if(!w.isDestroyed())w.destroy();}r.extensionWindows?.clear();for(const e of r.loadedExtensions?.values()||[]){try{r.session.extensions.removeExtension(e.id);}catch(error){r.extensionUnloadError=error.message;return;}}r.loadedExtensions?.clear();}
 async configure(id,key,enabled){return this.c.queue(id,async()=>{this.c.store.get(id);this.catalog.get(key);if(typeof enabled!=='boolean')throw Error('启用状态无效');if(this.catalog.enabled(id).includes(key)===enabled)return;await this.c.stopInner(id);this.catalog.setEnabled(id,key,enabled);this.c.log(id,'扩展选择已保存；当前实例已停止，请手动启动');});}
 async open(id,key,kind){if(!['popup','options'].includes(kind))throw Error('无效的扩展界面');const r=this.c.runtimes.get(id),entry=this.catalog.get(key).entries[kind],loaded=r?.loadedExtensions?.get(key);if(!r||r.status!=='running'||!loaded)throw Error('请先启用扩展并启动对应实例');if(!entry)throw Error('此扩展未声明该界面');
 const url=new URL(entry,'chrome-extension://'+loaded.id+'/').href;
 r.extensionWindows??=new Set();for(const w of r.extensionWindows){if(!w.isDestroyed()&&w.webContents.getURL()===url){w.focus();return;}}
 if(r.extensionWindows.size>=4)throw Error('请先关闭已有扩展窗口（最多4个）');
 const win=new BrowserWindow({parent:this.c.window,width:760,height:640,minWidth:420,minHeight:360,show:false,title:this.catalog.get(key).name+' · '+this.c.store.get(id).name,autoHideMenuBar:true,webPreferences:{session:r.session,sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true}});r.extensionWindows.add(win);win.on('closed',()=>r.extensionWindows.delete(win));
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));const guard=(event,target)=>{if(!target.startsWith('chrome-extension://'+loaded.id+'/'))event.preventDefault();};win.webContents.on('will-navigate',guard);win.webContents.on('will-redirect',guard);
 try{await win.loadURL(url);if(!win.isDestroyed()&&r.status==='running')win.show();}catch{if(!win.isDestroyed())win.destroy();throw Error('扩展界面未能打开；请检查扩展兼容性');}}
}
module.exports={InstanceExtensions};
