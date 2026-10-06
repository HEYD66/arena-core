'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{chromium}=require('playwright');
const executable=path.resolve(process.argv[2]),data=fs.mkdtempSync(path.join(os.tmpdir(),'facet-github-update-'));
const expectedVersion=process.argv[3]||require('../package.json').version,expectedStatus=process.argv[4]||'current';
let child,browser,ui;const report={data,executable,checkMode:process.argv.includes('--startup')?'startup':'manual',passed:false,error:null};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(fn,label,ms=45000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await sleep(80);}throw Error('Timeout: '+label);}
async function main(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 child=spawn(executable,['--user-data-dir='+data,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'],{env,stdio:'ignore'});
 const portFile=path.join(data,'DevToolsActivePort');await wait(()=>{if(child.exitCode!==null)throw Error('App exited '+child.exitCode);return fs.existsSync(portFile);},'debugger');
 const port=Number(fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0]);browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 await wait(()=>{ui=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/src/renderer/index.html'));return !!ui;},'control page');
 await ui.waitForFunction(()=>typeof bridge!=='undefined'&&state.instances.length>0);await ui.locator('#sidebar .nav[data-view="global"]').click();
 if(report.checkMode==='manual'){await ui.waitForFunction(()=>appUpdateState.status==='idle');await ui.locator('#updateCheck').click();}
 await ui.waitForFunction(()=>['current','available','error'].includes(appUpdateState.status),null,{timeout:60000});
 report.update=await ui.evaluate(()=>({...appUpdateState}));assert.equal(report.update.status,expectedStatus,report.update.error);assert.equal(report.update.currentVersion,expectedVersion);
 if(expectedStatus==='available')assert.equal(report.update.version,process.argv[5]||require('../package.json').version);
 await ui.screenshot({path:path.join(data,'github-update-current.png')});report.passed=true;console.log('PASS: Production app checks real GitHub Releases: v'+expectedVersion+' '+expectedStatus);
}
main().catch(error=>{report.error=error.message;console.error(error.message);}).finally(async()=>{
 if(child&&child.exitCode===null){const closer=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-Process -Id ${child.pid}).CloseMainWindow() | Out-Null`],{windowsHide:true,stdio:'ignore'});await new Promise(resolve=>closer.once('exit',resolve));try{await wait(()=>child.exitCode!==null,'normal exit',15000);}catch{child.kill();}}
 fs.writeFileSync(path.join(data,'verification.json'),JSON.stringify(report,null,2));console.log('Verification: '+path.join(data,'verification.json'));process.exit(report.passed?0:1);
});
