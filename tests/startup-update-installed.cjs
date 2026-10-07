'use strict';
// Actual packaged updater + UI, with local controlled release metadata and isolated data.
// The caller must provide a disposable copy of the production directory, never an installed user copy.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{chromium}=require('playwright'),{Store}=require('../src/main/store.cjs');
const executable=path.resolve(process.argv[2]),version=process.argv[3]||require('../package.json').version;
assert(path.basename(path.dirname(executable)).startsWith('FacetReminderValidation-'),'A disposable validation copy is required');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'facet-startup-update-')),results=[],errors=[];
let server,child,browser,ui,page,id,checks=0,mode='available',feedDelay=300,launchAt=0,firstCheckAt=0,startupCheckElapsedMs=0;
const parts=version.split('.').map(Number),firstVersion=`${parts[0]}.${parts[1]}.${parts[2]+1}`,secondVersion=`${parts[0]}.${parts[1]}.${parts[2]+2}`;
let offered=firstVersion;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),pass=name=>{results.push(name);console.log('PASS: '+name);};
async function wait(fn,label,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await sleep(80);}throw Error('Timeout: '+label);}
async function call(action,payload={}){const r=await ui.evaluate(({action,payload})=>bridge.request(action,payload),{action,payload});assert(r.ok,r.error);return r.value;}
async function launch(){
 const portFile=path.join(data,'DevToolsActivePort');fs.rmSync(portFile,{force:true});const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 launchAt=Date.now();child=spawn(executable,['--user-data-dir='+data,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'],{env,stdio:'ignore',windowsHide:false});
 await wait(()=>{if(child.exitCode!==null)throw Error('App exited '+child.exitCode);return fs.existsSync(portFile);},'debugger');
 const port=Number(fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0]);browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 await wait(()=>{ui=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/src/renderer/index.html'));return !!ui;},'control page');
 await ui.waitForFunction(()=>typeof bridge!=='undefined'&&state.instances.length===1);await ui.bringToFront();assert.equal((await call('snapshot')).versions.app,version);assert(ui.url().includes('app.asar'));
}
async function close(){
 if(!child||child.exitCode!==null)return;
 for(const x of (await call('snapshot')).instances)if(['running','starting'].includes(x.status))await call('stop',{id:x.id});
 const closer=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$p=Get-Process -Id ${child.pid}; if(-not $p.CloseMainWindow()){exit 1}`],{windowsHide:true,stdio:'ignore'});
 await new Promise((resolve,reject)=>{closer.once('error',reject);closer.once('exit',code=>code===0?resolve():reject(Error('Close failed '+code)));});await wait(()=>child.exitCode!==null,'normal exit');await browser?.close();browser=null;ui=null;
}
async function automatic(status){await ui.waitForFunction(s=>appUpdateState.status===s,status,{timeout:25000});}
function popup(){return browser?.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/src/renderer/update-reminder.html')&&!p.isClosed());}
async function waitPopup(){await wait(()=>!!popup(),'native popup');const p=popup();await p.waitForSelector('[data-update-reminder=view]');return p;}
async function main(){
 server=http.createServer((req,res)=>{
  if(req.url.startsWith('/latest.yml')){checks++;if(!firstCheckAt)firstCheckAt=Date.now();if(mode==='offline'){res.writeHead(503);res.end('Unavailable');return;}
   const v=mode==='current'?version:offered,digest=Buffer.alloc(64).toString('base64');setTimeout(()=>res.end(`version: ${v}
files:
  - url: Facet-Fixture-${v}.exe
    sha512: ${digest}
    size: 128
path: Facet-Fixture-${v}.exe
sha512: ${digest}
releaseDate: '2026-10-07T00:00:00Z'
`),feedDelay);return;}
  if(req.url==='/page'){res.end('<!doctype html><title>Startup check live page</title><h1>Live page</h1><script>window.ticks=0;function tick(){window.ticks++;requestAnimationFrame(tick)}tick();</script>');return;}
  res.writeHead(404);res.end();
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 fs.writeFileSync(path.join(path.dirname(executable),'resources','app-update.yml'),`provider: generic
url: ${url}/
updaterCacheDirName: facet-startup-validation-updater
`);
 const store=new Store(data),a=store.create('启动更新验证');id=a.id;store.update(id,{url:url+'/page',autoStart:true});
 const settings=path.join(data,'app-settings.json');fs.writeFileSync(settings,JSON.stringify({confirmExit:false,marker:'preserve'}));
 await launch();const firstLaunchAt=launchAt;await automatic('available');const firstPopup=await waitPopup();
 await wait(()=>{page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url()===url+'/page');return !!page;},'live browser');await page.waitForFunction(()=>window.ticks>0);
 const ticks=await page.evaluate(()=>window.ticks);await sleep(350);assert(await page.evaluate(()=>window.ticks)>ticks);assert.equal((await call('snapshot')).instances[0].status,'running');
 startupCheckElapsedMs=firstCheckAt-firstLaunchAt;assert(startupCheckElapsedMs<5000,'Update request should have no ten-second buffer');assert((await firstPopup.locator('#reminderTitle').textContent()).includes(firstVersion));
 await wait(()=>JSON.parse(fs.readFileSync(settings)).updateRemindedVersions?.includes(firstVersion),'reminder persistence');await firstPopup.screenshot({path:path.join(data,'startup-reminder.png')});
 pass('Real packaged startup checks immediately, shows a native child popup over the live browser and preserves its animated session');
 await firstPopup.locator('[data-update-reminder=later]').last().click();await wait(()=>!popup(),'popup close');assert(await ui.locator('#updateAvailable').isVisible());
 await sleep(1200);assert.equal(checks,1);const saved=JSON.parse(fs.readFileSync(settings));assert.equal(saved.confirmExit,false);assert.equal(saved.marker,'preserve');pass('Later dismisses the popup, keeps the update entry and preserves settings without polling or downloading');await close();
 await launch();await automatic('available');assert.equal(checks,2);assert.equal(popup(),undefined);assert(await ui.locator('#updateAvailable').isVisible());pass('Real process restart checks again but does not popup for the same version');await close();
 offered=secondVersion;await launch();await automatic('available');const secondPopup=await waitPopup();assert((await secondPopup.locator('#reminderTitle').textContent()).includes(secondVersion));
 await secondPopup.locator('[data-update-reminder=view]').click();await ui.waitForFunction(()=>view==='global');await ui.locator('#updateDownload').waitFor({state:'visible'});pass('A subsequent version gets its own popup; View update opens the working download entry');await close();
 mode='offline';await launch();await automatic('error');assert.equal(popup(),undefined);assert(await ui.locator('#toast').isHidden());assert(await ui.locator('#updateAvailable').isHidden());await sleep(1200);assert.equal(checks,4);pass('Network failure stays quiet and does not retry during the run');await close();
 mode='current';await launch();await automatic('current');assert.equal(popup(),undefined);assert(await ui.locator('#updateAvailable').isHidden());pass('Current version checks once without a popup');await close();
 mode='available';offered=parts[0]+'.'+parts[1]+'.'+(parts[2]+3);feedDelay=1200;await launch();await ui.evaluate(()=>openModal('new'));await automatic('available');assert.equal(popup(),undefined);assert(!JSON.parse(fs.readFileSync(settings)).updateRemindedVersions.includes(offered));
 await ui.evaluate(()=>closeModal());const deferred=await waitPopup();assert((await deferred.locator('#reminderTitle').textContent()).includes(offered));await wait(()=>JSON.parse(fs.readFileSync(settings)).updateRemindedVersions.includes(offered),'deferred acknowledgement');const escaped=deferred.waitForEvent('close');await deferred.keyboard.press('Escape').catch(error=>{if(!deferred.isClosed())throw error;});await escaped;await wait(()=>!popup(),'escape close');pass('Existing editor dialog is preserved; popup is deferred until it closes and Escape dismisses it');await close();
}

main().catch(error=>{errors.push(error.message);console.error(error.message);}).finally(async()=>{
 try{await close();}catch(error){errors.push(error.message);if(child&&child.exitCode===null)child.kill();}server?.close();
 const report={data,executable,version,passed:results.length,results,errors,checks,firstCheckAt,startupCheckElapsedMs,feed:'Local controlled release metadata; real electron-updater and popup; no fixture installer is downloaded or installed'};fs.writeFileSync(path.join(data,'verification.json'),JSON.stringify(report,null,2));console.log('Verification: '+path.join(data,'verification.json'));process.exit(errors.length?1:0);
});
