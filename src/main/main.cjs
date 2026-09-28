'use strict';
const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const path=require('node:path'),fs=require('node:fs');
const {Controller}=require('./controller.cjs');
app.setName('千面 Facet');
// Renamed from Arena Core: the data folder stays ArenaCore so existing instances, sessions and settings are kept.
app.setPath('userData',path.join(app.getPath('appData'),'ArenaCore'));
if(process.platform==='win32')app.setAppUserModelId('Facet.MultiInstanceBrowser');
const appIcon=path.join(__dirname,'../../resources',process.platform==='win32'?'facet.ico':'facet.png');
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy','disable_non_proxied_udp');
app.commandLine.appendSwitch('disable-quic');
const locked=app.requestSingleInstanceLock();if(!locked)app.quit();
let window,controller,quitting=false,closing=false;
if(locked){app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
app.whenReady().then(async()=>{
 window=new BrowserWindow({width:1440,height:960,minWidth:960,minHeight:700,title:'千面 Facet',icon:appIcon,backgroundColor:'#f5f8f7',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true,webviewTag:false,backgroundThrottling:false,partition:'persist:arena-core-controls'}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
 window.webContents.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));window.webContents.session.setPermissionCheckHandler(()=>false);
 const binary=path.join(app.isPackaged?process.resourcesPath:path.join(__dirname,'../../resources'),'mihomo',process.platform==='win32'?'mihomo.exe':'mihomo');
 controller=new Controller(window,app.getPath('userData'),binary);
 require('./ipc.cjs').installIPC(window,controller);
 window.on('close',event=>{if(quitting)return;event.preventDefault();if(closing)return;closing=true;require('./exit-guard.cjs').confirmExit(controller,window,dialog,app.getPath('userData')).catch(()=>true).then(go=>{if(!go){closing=false;return;}return controller.closeAll().then(()=>{quitting=true;app.quit();});}).catch(e=>{closing=false;dialog.showErrorBox('暂不能退出',e.message);});});
 app.on('before-quit',event=>{if(!quitting&&window&&!window.isDestroyed()){event.preventDefault();window.close();}});
 await window.loadFile(path.join(__dirname,'../renderer/index.html'));
 console.log('千面 Facet 0.2.0 ready; instances are not auto-started.');
}).catch(e=>{dialog.showErrorBox('千面 Facet 启动失败',e.message);quitting=true;app.quit();});
app.on('window-all-closed',()=>app.quit());}
