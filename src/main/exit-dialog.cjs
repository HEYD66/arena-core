'use strict';
// A real modal child window stays above native WebContentsViews (including the grid).
// Its isolated preload exposes only the confirmation response; no app/session APIs.
const {BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const pending=new WeakMap();
function showExitDialog(parent,options){
 if(!parent||parent.isDestroyed())return Promise.resolve({response:0});
 if(pending.has(parent))return pending.get(parent);
 const promise=new Promise(resolve=>{
  let child,settled=false,timer;
  const finish=(response=0,checkboxChecked=false)=>{
   if(settled)return;settled=true;clearTimeout(timer);
   ipcMain.removeListener('facet:exit-answer',answer);
   parent.removeListener('closed',cancel);
   if(child&&!child.isDestroyed())child.destroy();
   resolve({response,checkboxChecked:response===1&&checkboxChecked===true});
  };
  const cancel=()=>finish();
  const answer=(event,value)=>{
   if(!child||child.isDestroyed()||event.sender!==child.webContents||event.senderFrame!==child.webContents.mainFrame)return;
   if(value?.response!==0&&value?.response!==1)return;
   finish(value.response,value.checkboxChecked);
  };
  try{
   child=new BrowserWindow({parent,modal:true,show:false,width:520,height:380,useContentSize:true,frame:false,resizable:false,minimizable:false,maximizable:false,skipTaskbar:true,title:'退出千面 Facet',backgroundColor:'#ffffff',webPreferences:{preload:path.join(__dirname,'exit-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,partition:'facet-exit-confirmation'}});
   child.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   child.webContents.on('will-navigate',event=>event.preventDefault());
   child.webContents.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
   child.webContents.session.setPermissionCheckHandler(()=>false);
   child.webContents.once('render-process-gone',cancel);
   child.once('closed',cancel);parent.once('closed',cancel);
   ipcMain.on('facet:exit-answer',answer);
   // Failure is cancellation, never implicit consent to stop instances.
   timer=setTimeout(cancel,10000);timer.unref?.();
   (async()=>{
    let theme={};
    try{
     let themeTimer;
     try{theme=await Promise.race([parent.webContents.executeJavaScript('({theme:document.documentElement.dataset.theme,lightPalette:document.documentElement.dataset.lightPalette,darkPalette:document.documentElement.dataset.darkPalette})'),new Promise(r=>{themeTimer=setTimeout(()=>r({}),700);})]);}
     finally{clearTimeout(themeTimer);}
    }catch{}
    if(settled)return;
    const query={theme:theme?.theme==='dark'?'dark':'light',lightPalette:String(theme?.lightPalette||'indigo'),darkPalette:String(theme?.darkPalette||'indigo'),message:String(options.message||''),names:String(options.detail||'').split('\n')[0]};
    await child.loadFile(path.join(__dirname,'../renderer/exit-dialog.html'),{query});
    if(settled)return;
    clearTimeout(timer);child.show();child.focus();
   })().catch(cancel);
  }catch{finish();}
 });
 pending.set(parent,promise);promise.finally(()=>pending.delete(parent));return promise;
}
module.exports={showExitDialog};
