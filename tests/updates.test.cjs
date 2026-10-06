'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Updates,updateError}=require('../src/main/updates.cjs');
function fixture(options={}){const updater=new EventEmitter();updater.checkForUpdates=async()=>updater.emit('update-available',{version:'0.2.2'});updater.downloadUpdate=async()=>updater.emit('update-downloaded',{version:'0.2.2'});const calls=[];updater.quitAndInstall=(...args)=>calls.push(['install',...args]);const app={isPackaged:true,getVersion:()=> '0.2.1',commandLine:{hasSwitch:()=>false}};const updates=new Updates(app,{updater,prepareInstall:async()=>calls.push(['cleanup']),beginQuit:()=>calls.push(['quit-ready']),cancelQuit:()=>calls.push(['restore']),...options});return {updates,updater,calls,app};}
test('Check and download are manual; exiting cannot silently install or downgrade',async()=>{const {updates,updater,calls}=fixture();assert.equal(updates.snapshot().status,'idle');assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);assert.equal(updater.allowDowngrade,false);assert.equal(updater.allowPrerelease,false);await updates.check();assert.equal(updates.snapshot().status,'available');assert.equal(calls.length,0);await updates.download();assert.equal(updates.snapshot().status,'downloaded');assert.equal(calls.length,0);});
test('Installation requires confirmation and successful process cleanup before quitting',async()=>{const {updates,calls}=fixture();await updates.check();await updates.download();await assert.rejects(updates.install(false),/确认/);assert.deepEqual(calls,[]);await updates.install(true);assert.deepEqual(calls,[['cleanup'],['quit-ready'],['install',true,true]]);});
test('Cleanup failure keeps the downloaded update and restores controls without starting installer',async()=>{const {updates,calls}=fixture({prepareInstall:async()=>{throw Error('core still running');}});await updates.check();await updates.download();await assert.rejects(updates.install(true),/core still running/);assert.equal(updates.snapshot().status,'downloaded');assert.deepEqual(calls,[['restore']]);});
test('Download checksum failures remain failures; install is rejected and release URLs are redacted',async()=>{const {updates,updater,calls}=fixture();await updates.check();updater.downloadUpdate=async()=>{throw Object.assign(Error('bad checksum'),{code:'ERR_UPDATER_CHECKSUM_MISMATCH'});};await updates.download();assert.equal(updates.snapshot().status,'error');await assert.rejects(updates.install(true),/下载/);assert.deepEqual(calls,[]);assert.equal(updateError({code:'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'}),'尚未发布可用的在线更新版本，请稍后再试。');assert(!updateError(Error('request https://example.test/file?token=private-value')).includes('private-value'));});
test('Duplicate checks cannot overlap, and a network error can be retried',async()=>{const {updates,updater}=fixture();let release;updater.checkForUpdates=()=>new Promise(resolve=>release=resolve);const pending=updates.check();await assert.rejects(updates.check(),/正在进行/);updater.emit('error',Error('network unavailable'));release();await pending;assert.equal(updates.snapshot().status,'error');updater.checkForUpdates=async()=>updater.emit('update-not-available',{});await updates.check();assert.equal(updates.snapshot().status,'current');});
test('Custom data directories are not replaced by an automatic default-directory restart',async()=>{const {updater}=fixture();const app={isPackaged:true,getVersion:()=> '0.2.1',commandLine:{hasSwitch:()=>true}};const updates=new Updates(app,{updater});assert.equal(updates.snapshot().restart,false);assert.equal(updater.autoRunAppAfterInstall,false);});
test('Source launches do not expose a working update action',async()=>{const app={isPackaged:false,commandLine:{hasSwitch:()=>false}};const updates=new Updates(app);assert.equal(updates.snapshot().supported,false);await assert.rejects(updates.check(),/源码/);});

test('Startup checks once, records only displayed reminders, and preserves unrelated settings across restarts',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facet-update-reminder-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'app-settings.json'),JSON.stringify({confirmExit:false,customSetting:'preserve'}));
 const {updates,updater}=fixture({settingsDir:dir});let checks=0;updater.checkForUpdates=async()=>{checks++;updater.emit('update-available',{version:'0.2.2'});};
 await updates.checkStartup();await updates.checkStartup();assert.equal(checks,1);assert.equal(updates.snapshot().reminderVersion,'0.2.2');
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'app-settings.json'))).updateRemindedVersions,undefined);
 assert.throws(()=>updates.acknowledgeReminder('0.2.99'),/失效/);updates.acknowledgeReminder('0.2.2');
 const saved=JSON.parse(fs.readFileSync(path.join(dir,'app-settings.json')));assert.deepEqual(saved,{confirmExit:false,customSetting:'preserve',updateRemindedVersions:['0.2.2']});
 const next=fixture({settingsDir:dir});await next.updates.checkStartup();assert.equal(next.updates.snapshot().status,'available');assert.equal(next.updates.snapshot().reminderVersion,null);
 const newer=fixture({settingsDir:dir});newer.updater.checkForUpdates=async()=>newer.updater.emit('update-available',{version:'0.2.3'});await newer.updates.checkStartup();assert.equal(newer.updates.snapshot().reminderVersion,'0.2.3');
});
test('Undelivered startup reminders remain pending after restart',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facet-update-pending-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const first=fixture({settingsDir:dir});await first.updates.checkStartup();assert.equal(first.updates.snapshot().reminderVersion,'0.2.2');
 const next=fixture({settingsDir:dir});await next.updates.checkStartup();assert.equal(next.updates.snapshot().reminderVersion,'0.2.2');
});
test('Automatic network errors never create a reminder or retry loop, while manual retry still works',async()=>{
 const {updates,updater}=fixture();let checks=0;updater.checkForUpdates=async()=>{checks++;throw Error('offline');};await updates.checkStartup();await updates.checkStartup();
 assert.equal(checks,1);assert.equal(updates.snapshot().status,'error');assert.equal(updates.snapshot().reminderVersion,null);
 updater.checkForUpdates=async()=>updater.emit('update-not-available',{});await updates.check();assert.equal(updates.snapshot().status,'current');
});
test('Startup scheduler has a single timer and stops on disposal; prior manual checks are not duplicated',async()=>{
 const {updates,updater}=fixture();let checks=0;updater.checkForUpdates=async()=>{checks++;updater.emit('update-not-available',{});};
 updates.scheduleStartupCheck(0);updates.scheduleStartupCheck(0);await new Promise(resolve=>setTimeout(resolve,30));assert.equal(checks,1);await updates.checkStartup();assert.equal(checks,1);
 const pending=fixture();let disposedChecks=0;pending.updater.checkForUpdates=async()=>disposedChecks++;pending.updates.scheduleStartupCheck(0);pending.updates.dispose();await new Promise(resolve=>setTimeout(resolve,30));assert.equal(disposedChecks,0);
 const manual=fixture();let manualChecks=0;manual.updater.checkForUpdates=async()=>{manualChecks++;manual.updater.emit('update-not-available',{});};await manual.updates.check();await manual.updates.checkStartup();assert.equal(manualChecks,1);
});
