'use strict';
const {BrowserWindow,ipcMain}=require('electron'),path=require('node:path');
const pending=new WeakMap();
// Native child window: stays above live browser views without replacing the page.
function showUpdateReminder(parent,{version,currentVersion,onShown}){
 if(!parent||parent.isDestroyed()||!parent.isVisible()||parent.isMinimized()||!parent.isFocused())return Promise.resolve({shown:false,response:1});
 if(pending.has(parent))return pending.get(parent);
 const promise=new Promise((resolve,reject)=>{
  let child,shown=false,settled=false,timer;
  const finish=(response=1,error)=>{
   if(settled)return;settled=true;clearTimeout(timer);ipcMain.removeListener('facet:update-reminder-answer',answer);parent.removeListener('closed',cancel);
   if(child&&!child.isDestroyed())child.destroy();
   if(error)reject(error);else resolve({shown,response});
  };
  const cancel=()=>finish();
  const answer=(event,value)=>{
   if(!child||child.isDestroyed()||event.sender!==child.webContents||event.senderFrame!==child.webContents.mainFrame||![0,1].includes(value?.response))return;
   finish(value.response);
  };
  try{
   child=new BrowserWindow({parent,modal:true,show:false,width:520,height:340,useContentSize:true,frame:false,resizable:false,minimizable:false,maximizable:false,skipTaskbar:true,title:'千面 Facet 有新版本',backgroundColor:'#ffffff',webPreferences:{preload:path.join(__dirname,'update-reminder-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,partition:'facet-update-reminder'}});
   child.webContents.setWindowOpenHandler(()=>({action:'deny'}));child.webContents.on('will-navigate',event=>event.preventDefault());
   child.webContents.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));child.webContents.session.setPermissionCheckHandler(()=>false);
   child.webContents.once('render-process-gone',cancel);child.once('closed',cancel);parent.once('closed',cancel);ipcMain.on('facet:update-reminder-answer',answer);
   timer=setTimeout(cancel,10000);timer.unref?.();
   (async()=>{
    let theme={};try{let themeTimer;try{theme=await Promise.race([parent.webContents.executeJavaScript('({theme:document.documentElement.dataset.theme,lightPalette:document.documentElement.dataset.lightPalette,darkPalette:document.documentElement.dataset.darkPalette})'),new Promise(r=>{themeTimer=setTimeout(()=>r({}),700);})]);}finally{clearTimeout(themeTimer);}}catch{}
    if(settled)return;
    await child.loadFile(path.join(__dirname,'../renderer/update-reminder.html'),{query:{version,currentVersion,theme:theme?.theme==='dark'?'dark':'light',lightPalette:String(theme?.lightPalette||'indigo'),darkPalette:String(theme?.darkPalette||'indigo')}});
    if(settled)return;
    if(!parent.isVisible()||parent.isMinimized()||!parent.isFocused()){finish();return;}
    clearTimeout(timer);child.show();child.focus();shown=true;onShown();
   })().catch(error=>finish(1,error));
  }catch(error){finish(1,error);}
 });
 pending.set(parent,promise);promise.finally(()=>pending.delete(parent)).catch(()=>{});return promise;
}
module.exports={showUpdateReminder};
