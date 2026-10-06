'use strict';
// Actual packaged updater + UI, with local controlled release metadata and isolated data.
// The caller must provide a disposable copy of the production directory, never an installed user copy.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{chromium}=require('playwright'),{Store}=require('../src/main/store.cjs');
const executable=path.resolve(process.argv[2]),version=process.argv[3]||require('../package.json').version;
assert(path.basename(path.dirname(executable)).startsWith('FacetReminderValidation-'),'A disposable validation copy is required');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'facet-startup-update-')),results=[],errors=[];
let server,child,browser,ui,page,id,checks=0,mode='available';
const parts=version.split('.').map(Number),firstVersion=`${parts[0]}.${parts[1]}.${parts[2]+1}`,secondVersion=`${parts[0]}.${parts[1]}.${parts[2]+2}`;
let offered=firstVersion;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),pass=name=>{results.push(name);console.log('PASS: '+name);};
async function wait(fn,label,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await sleep(80);}throw Error('Timeout: '+label);}
async function call(action,payload={}){const r=await ui.evaluate(({action,payload})=>bridge.request(action,payload),{action,payload});assert(r.ok,r.error);return r.value;}
async function launch(){
 const portFile=path.join(data,'DevToolsActivePort');fs.rmSync(portFile,{force:true});const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 child=spawn(executable,['--user-data-dir='+data,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'],{env,stdio:'ignore',windowsHide:false});
 await wait(()=>{if(child.exitCode!==null)throw Error('App exited '+child.exitCode);return fs.existsSync(portFile);},'debugger');
 const port=Number(fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0]);browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 await wait(()=>{ui=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/src/renderer/index.html'));return !!ui;},'control page');
 await ui.waitForFunction(()=>typeof bridge!=='undefined'&&state.instances.length===1);assert.equal((await call('snapshot')).versions.app,version);assert(ui.url().includes('app.asar'));
}
async function close(){
 if(!child||child.exitCode!==null)return;
 for(const x of (await call('snapshot')).instances)if(['running','starting'].includes(x.status))await call('stop',{id:x.id});
 const closer=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$p=Get-Process -Id ${child.pid}; if(-not $p.CloseMainWindow()){exit 1}`],{windowsHide:true,stdio:'ignore'});
 await new Promise((resolve,reject)=>{closer.once('error',reject);closer.once('exit',code=>code===0?resolve():reject(Error('Close failed '+code)));});await wait(()=>child.exitCode!==null,'normal exit');ui=null;
}
async function automatic(status){await ui.waitForFunction(s=>appUpdateState.status===s,status,{timeout:25000});}
async function main(){
 server=http.createServer((req,res)=>{
  if(req.url.startsWith('/latest.yml')){checks++;if(mode==='offline'){res.writeHead(503);res.end('Unavailable');return;}
   const v=mode==='current'?version:offered;const digest=Buffer.alloc(64).toString('base64');res.end(`version: ${v}\nfiles:\n  - url: Facet-Fixture-${v}.exe\n    sha512: ${digest}\n    size: 128\npath: Facet-Fixture-${v}.exe\nsha512: ${digest}\nreleaseDate: '2026-10-07T00:00:00Z'\n`);return;}
  if(req.url==='/page'){res.end('<!doctype html><title>Startup check live page</title><h1>Live page</h1><script>window.ticks=0;function tick(){window.ticks++;requestAnimationFrame(tick)}tick();</script>');return;}
  res.writeHead(404);res.end();
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 fs.writeFileSync(path.join(path.dirname(executable),'resources','app-update.yml'),`provider: generic\nurl: ${url}/\nupdaterCacheDirName: facet-startup-validation-updater\n`);
 const store=new Store(data),a=store.create('启动更新验证');id=a.id;store.update(id,{url:url+'/page'});
 const settings=path.join(data,'app-settings.json');fs.writeFileSync(settings,JSON.stringify({confirmExit:false,marker:'preserve'}));
 await launch();assert.equal(checks,0,'Startup check waits until after UI startup');await call('start',{id});
 await wait(()=>{page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url()===url+'/page');return !!page;},'live browser');await page.waitForFunction(()=>window.ticks>0);
 const ticks=await page.evaluate(()=>window.ticks);await automatic('available');await ui.locator('.update-notice').waitFor({state:'visible'});
 assert(await page.evaluate(()=>window.ticks)>ticks);assert.equal((await call('snapshot')).instances[0].status,'running');
 const geometry=await ui.evaluate(()=>({noticeBottom:document.querySelector('.update-notice').getBoundingClientRect().bottom,bodyTop:document.querySelector('.body-grid').getBoundingClientRect().top}));assert(Math.abs(geometry.noticeBottom-geometry.bodyTop)<1,'Reminder reserves space above the browser');
 await wait(()=>JSON.parse(fs.readFileSync(settings)).updateRemindedVersions?.includes(firstVersion),'reminder persistence');
 await ui.screenshot({path:path.join(data,'startup-reminder.png')});pass('Startup performs one delayed real HTTP check and displays a reminder while the live browser continues');
 await ui.locator('[data-update-action="later"]').click();assert.equal(await ui.locator('.update-notice').count(),0);assert(await ui.locator('#updateAvailable').isVisible());
 await sleep(2200);assert.equal(checks,1);const saved=JSON.parse(fs.readFileSync(settings));assert.equal(saved.confirmExit,false);assert.equal(saved.marker,'preserve');pass('Dismissal leaves an update entry, preserves other settings, and does not start a polling loop');await close();
 await launch();await automatic('available');assert.equal(checks,2);assert.equal(await ui.locator('.update-notice').count(),0);assert(await ui.locator('#updateAvailable').isVisible());pass('Real process restart checks again but does not remind for the same version');await close();
 offered=secondVersion;await launch();await automatic('available');await ui.locator('.update-notice').waitFor({state:'visible'});assert((await ui.locator('.update-notice').textContent()).includes(secondVersion));
 await ui.locator('.update-notice [data-update-action="view"]').click();await ui.waitForFunction(()=>view==='global');await ui.locator('#updateDownload').waitFor({state:'visible'});pass('A subsequent version gets its own reminder and View update opens the working download entry');await close();
 mode='offline';await launch();await automatic('error');assert.equal(await ui.locator('.update-notice').count(),0);assert(await ui.locator('#toast').isHidden());assert(await ui.locator('#updateAvailable').isHidden());await sleep(2200);assert.equal(checks,4);pass('Startup network failure stays quiet and does not retry during the run');await close();
 mode='current';await launch();await automatic('current');assert.equal(await ui.locator('.update-notice').count(),0);assert(await ui.locator('#updateAvailable').isHidden());pass('Current version checks once without showing a new-version notice');await close();
}
main().catch(error=>{errors.push(error.message);console.error(error.message);}).finally(async()=>{
 try{await close();}catch(error){errors.push(error.message);if(child&&child.exitCode===null)child.kill();}server?.close();
 const report={data,executable,version,passed:results.length,results,errors,checks,feed:'Local controlled release metadata; no fixture installer is downloaded or installed'};fs.writeFileSync(path.join(data,'verification.json'),JSON.stringify(report,null,2));console.log('Verification: '+path.join(data,'verification.json'));process.exit(errors.length?1:0);
});
