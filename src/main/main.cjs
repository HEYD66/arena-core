'use strict';
const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const path=require('node:path'),fs=require('node:fs');
const {Controller}=require('./controller.cjs');
app.setName('千面 Facet');
// Persisted data and session identifiers remain stable across application upgrades.
const {userDataPath,resourcePath}=require('./app-paths.cjs');
app.setPath('userData',userDataPath(app));
if(app.isPackaged)require('./runtime-output.cjs').installRuntimeOutput(app);
if(process.platform==='win32')app.setAppUserModelId('Facet.MultiInstanceBrowser');
const appIcon=resourcePath(app,process.platform==='win32'?'facet.ico':'facet.png');
require('./webrtc-policy.cjs').installWebRTCPolicy(app);
app.commandLine.appendSwitch('disable-quic');
const locked=app.requestSingleInstanceLock();if(!locked)app.quit();
let window,controller,quitting=false,closing=false;
// Windows：去掉系统黑色标题栏，改由界面自绘一行（颜色跟随主题），最小化/最大化/关闭仍用系统按钮（titleBarOverlay）。
const customFrame=process.platform==='win32';
if(locked){app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
app.whenReady().then(async()=>{
 window=new BrowserWindow({width:1440,height:960,minWidth:960,minHeight:700,title:'千面 Facet',icon:appIcon,backgroundColor:'#f5f8f7',autoHideMenuBar:true,...(customFrame?{titleBarStyle:'hidden',titleBarOverlay:{color:'#e9eaee',symbolColor:'#171a21',height:32}}:{}),webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true,webviewTag:false,backgroundThrottling:false,partition:'persist:arena-core-controls'}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
 window.webContents.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));window.webContents.session.setPermissionCheckHandler(()=>false);
 const binary=resourcePath(app,'mihomo',process.platform==='win32'?'mihomo.exe':'mihomo');
 controller=new Controller(window,app.getPath('userData'),binary);
 controller.updates=new (require('./updates.cjs').Updates)(app,{onChange:value=>{if(!window.isDestroyed())window.webContents.send('core:update',value);},prepareInstall:()=>controller.closeAll(),beginQuit:()=>{quitting=true;},cancelQuit:()=>{quitting=false;controller.disposing=false;}});
 require('./ipc.cjs').installIPC(window,controller);
 window.on('close',event=>{if(quitting)return;event.preventDefault();if(closing)return;closing=true;require('./exit-guard.cjs').confirmExit(controller,window,{showMessageBox:require('./exit-dialog.cjs').showExitDialog},app.getPath('userData')).then(go=>{if(!go){closing=false;return;}return controller.closeAll().then(()=>{quitting=true;app.quit();});}).catch(e=>{closing=false;dialog.showErrorBox('暂不能退出',e.message);});});
 app.on('before-quit',event=>{if(!quitting&&window&&!window.isDestroyed()){event.preventDefault();window.close();}});
 await window.loadFile(path.join(__dirname,'../renderer/index.html'),customFrame?{query:{frame:'custom'}}:undefined);
 controller.updates.scheduleStartupCheck();
 window.once('closed',()=>controller.updates.dispose());
 console.log('千面 Facet '+require('./application-version.cjs').applicationVersion(app)+' ready; instances are not auto-started.');
}).catch(e=>{dialog.showErrorBox('千面 Facet 启动失败',e.message);quitting=true;app.quit();});
app.on('window-all-closed',()=>app.quit());}
