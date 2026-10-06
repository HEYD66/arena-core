'use strict';
// Run the packaged application with isolated data; verify first use and persisted user choices.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const executable=path.resolve(process.argv[2]),version=process.argv[3]||require('../package.json').version;
const data=fs.mkdtempSync(path.join(os.tmpdir(),'facet-theme-')),report={data,executable,passed:0,results:[],errors:[]};
let child,browser,ui;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(fn,label,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await sleep(80);}throw Error('Timeout: '+label);}
const pass=name=>{report.results.push(name);report.passed++;console.log('PASS: '+name);};
async function appearance(){return ui.evaluate(()=>({mode:document.documentElement.dataset.theme,light:document.documentElement.dataset.lightPalette,dark:document.documentElement.dataset.darkPalette,background:getComputedStyle(document.body).backgroundColor}));}
async function launch(){
 const portFile=path.join(data,'DevToolsActivePort');fs.rmSync(portFile,{force:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 child=spawn(executable,['--user-data-dir='+data,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'],{env,windowsHide:false,stdio:'ignore'});
 let error;child.once('error',e=>error=e);
 await wait(()=>{if(error)throw error;if(child.exitCode!==null)throw Error('App exited '+child.exitCode);return fs.existsSync(portFile);},'debugger');
 const port=Number(fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0]);browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 await wait(()=>{ui=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/src/renderer/index.html'));return !!ui;},'control window');
 await ui.waitForFunction(()=>typeof bridge!=='undefined'&&state.instances.length>0);
 assert(ui.url().includes('app.asar'),'Must exercise packaged code');assert.equal(await ui.evaluate(()=>state.versions.app),version);
}
async function close(){
 if(child&&child.exitCode===null){
  const closer=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-Process -Id ${child.pid}).CloseMainWindow() | Out-Null`],{windowsHide:true,stdio:'ignore'});
  await new Promise(resolve=>closer.once('exit',resolve));await wait(()=>child.exitCode!==null,'normal application exit',15000);
 }
}
async function main(){
 await launch();assert.deepEqual(await appearance(),{mode:'light',light:'solar',dark:'gold',background:'rgb(253, 246, 227)'});
 await ui.locator('#sidebar .nav[data-view="settings"]').click();
 assert.equal(await ui.locator('[data-palette-mode="light"][data-palette="solar"]').getAttribute('aria-checked'),'true');
 assert.equal(await ui.locator('[data-palette-mode="dark"][data-palette="gold"]').getAttribute('aria-checked'),'true');
 await ui.screenshot({path:path.join(data,'default-day.png')});pass('Fresh packaged app uses Solar day and Gold night defaults with matching selection');
 await ui.locator('#themeToggle').click();assert.deepEqual(await appearance(),{mode:'dark',light:'solar',dark:'gold',background:'rgb(24, 23, 21)'});
 await ui.screenshot({path:path.join(data,'default-night.png')});await close();await launch();assert.equal((await appearance()).mode,'dark');assert.equal((await appearance()).dark,'gold');
 pass('Day/night toggle uses Gold and survives a real process restart');
 await ui.locator('#sidebar .nav[data-view="settings"]').click();await ui.locator('[data-palette-mode="light"][data-palette="navy"]').click();await ui.locator('[data-palette-mode="dark"][data-palette="moss"]').click();
 await close();await launch();assert.deepEqual(await ui.evaluate(()=>({mode:document.documentElement.dataset.theme,light:document.documentElement.dataset.lightPalette,dark:document.documentElement.dataset.darkPalette,storedLight:localStorage.getItem('arena.ui.palette.light'),storedDark:localStorage.getItem('arena.ui.palette.dark')})),{mode:'dark',light:'navy',dark:'moss',storedLight:'navy',storedDark:'moss'});
 pass('Existing user palette selections remain intact after a real process restart');
 await ui.evaluate(()=>{localStorage.setItem('arena.ui.palette.light','invalid');localStorage.setItem('arena.ui.palette.dark','invalid');});await ui.reload();await ui.waitForFunction(()=>typeof bridge!=='undefined'&&state.instances.length>0);
 const fallback=await appearance();assert.equal(fallback.light,'solar');assert.equal(fallback.dark,'gold');assert.equal(fallback.mode,'dark');pass('Invalid palette IDs fall back to Solar/Gold while preserving the saved day/night mode');
}
main().catch(error=>{report.errors.push(error.message);console.error(error.message);}).finally(async()=>{
 try{await close();}catch(error){report.errors.push(error.message);if(child&&child.exitCode===null)child.kill();}
 fs.writeFileSync(path.join(data,'verification.json'),JSON.stringify(report,null,2));console.log('Verification: '+path.join(data,'verification.json'));process.exit(report.errors.length?1:0);
});
