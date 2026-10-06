'use strict';
const {applicationVersion}=require('./application-version.cjs');
const {redact}=require('./workspace.cjs');
function updateError(error){
 if(['ERR_UPDATER_NO_PUBLISHED_VERSIONS','ERR_UPDATER_LATEST_VERSION_NOT_FOUND','ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'].includes(error?.code))return '尚未发布可用的在线更新版本，请稍后再试。';
 if(error?.code==='ERR_UPDATER_CHECKSUM_MISMATCH')return '更新文件校验失败，请重新检查更新并下载。';
 return '更新失败：'+redact(error?.message||String(error));
}
class Updates {
 constructor(app,{updater,onChange=()=>{},prepareInstall=async()=>{},beginQuit=()=>{},cancelQuit=()=>{}}={}){
  this.app=app;this.onChange=onChange;this.prepareInstall=prepareInstall;this.beginQuit=beginQuit;this.cancelQuit=cancelQuit;this.lastProgress=0;
  this.state={supported:app.isPackaged&&process.platform==='win32',status:'idle',currentVersion:applicationVersion(app),version:null,progress:0,error:'',restart:!app.commandLine.hasSwitch('user-data-dir')};
  if(!this.state.supported){this.state.status='unsupported';this.state.error='在线更新仅用于 Windows 安装版；源码运行请更新项目代码。';return;}
  this.updater=updater||require('electron-updater').autoUpdater;
  this.updater.autoDownload=false;this.updater.autoInstallOnAppQuit=false;this.updater.allowDowngrade=false;this.updater.allowPrerelease=false;
  this.updater.autoRunAppAfterInstall=this.state.restart;
  // Log status without release URLs, signed links or request headers.
  this.updater.logger={info:()=>{},warn:()=>{},debug:()=>{},error:()=>{}};
  this.updater.on('checking-for-update',()=>this.set({status:'checking',error:''}));
  this.updater.on('update-available',info=>this.set({status:'available',version:String(info.version),progress:0,error:''}));
  this.updater.on('update-not-available',()=>this.set({status:'current',version:null,progress:0,error:''}));
  this.updater.on('download-progress',info=>{const now=Date.now();if(now-this.lastProgress<200&&info.percent<100)return;this.lastProgress=now;this.set({status:'downloading',progress:Math.max(0,Math.min(100,Number(info.percent)||0))});});
  this.updater.on('update-downloaded',info=>this.set({status:'downloaded',version:String(info.version),progress:100,error:''}));
  this.updater.on('error',error=>this.fail(error));
 }
 snapshot(){return {...this.state};}
 set(patch){Object.assign(this.state,patch);this.onChange(this.snapshot());}
 fail(error){this.set({status:'error',error:updateError(error)});}
 assertReady(){if(!this.state.supported)throw Error(this.state.error);if(['checking','downloading','installing'].includes(this.state.status))throw Error('更新任务正在进行，请稍候');}
 async check(){this.assertReady();if(this.state.status==='downloaded')return this.snapshot();this.set({status:'checking',version:null,progress:0,error:''});try{await this.updater.checkForUpdates();}catch(error){this.fail(error);}return this.snapshot();}
 async download(){this.assertReady();if(!this.state.version||!['available','error'].includes(this.state.status))throw Error('请先检查是否有新版本');this.set({status:'downloading',progress:0,error:''});try{await this.updater.downloadUpdate();}catch(error){this.fail(error);}return this.snapshot();}
 async install(confirmed){this.assertReady();if(confirmed!==true)throw Error('请先确认退出并更新');if(this.state.status!=='downloaded')throw Error('请先完成更新下载');this.set({status:'installing',error:''});try{
   await this.prepareInstall();
   // The updater starts NSIS before app.quit. Bypass a second exit prompt only after cleanup succeeded.
   this.beginQuit();this.updater.quitAndInstall(true,this.state.restart);
   if(this.state.status==='error')throw Error(this.state.error);
  }catch(error){this.cancelQuit();this.set({status:'downloaded',error:updateError(error)});throw error;}
  return this.snapshot();
 }
}
module.exports={Updates,updateError};
