'use strict';
// Real HTTP downloads and real NSIS upgrade, with a separate app ID/executable and isolated browser data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{chromium}=require('playwright'),yaml=require('js-yaml');
const {Store}=require('../src/main/store.cjs'),{childEnvironment}=require('../scripts/electron-runtime.cjs');
const assets=path.resolve(process.argv[2]),installDir=path.resolve(process.argv[3]);
const data=fs.mkdtempSync(path.join(os.tmpdir(),'facet-update-')),exe=path.join(installDir,'FacetUpdateTest.exe');
const results=[],errors=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
let server,child,browser,ui,mode='current',fileBytes=0,progressSeen=false;
const pass=s=>{results.push(s);console.log('PASS '+s);};
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function wait(fn,label,ms=45000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await sleep(80);}throw Error('Timeout: '+label);}
async function run(file,args){const proc=spawn(file,args,{windowsHide:true,stdio:'ignore'});return new Promise((resolve,reject)=>{proc.once('error',reject);proc.once('exit',code=>code===0?resolve():reject(Error('Process exit '+code)));});}
async function call(action,payload={}){const r=await ui.evaluate(({action,payload})=>bridge.request(action,payload),{action,payload});assert.equal(r.ok,true,r.error);return r.value;}
async function launch(version){
 const portFile=path.join(data,'DevToolsActivePort');fs.rmSync(portFile,{force:true});
 child=spawn(exe,['--user-data-dir='+data,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'],{env:childEnvironment(),stdio:'ignore'});
 await wait(()=>{if(child.exitCode!==null)throw Error('App exited '+child.exitCode);return fs.existsSync(portFile);},'debugger');
 const port=Number(fs.readFileSync(portFile,'utf8').split(/\r?\n/)[0]);browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 await wait(()=>{ui=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/src/renderer/index.html'));return !!ui;},'control page');
 await ui.waitForFunction(()=>typeof bridge!=='undefined'&&state.instances.length===1);
 assert.equal((await call('snapshot')).versions.app,version);
 await ui.locator('#sidebar .nav[data-view="global"]').click();await ui.waitForFunction(()=>appUpdateState.status==='idle');
}
async function close(){
 if(!child||child.exitCode!==null)return;
 if(ui)for(const row of (await call('snapshot')).instances)if(['running','starting'].includes(row.status))await call('stop',{id:row.id});
 await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$p=Get-Process -Id ${child.pid}; if(-not $p.CloseMainWindow()){exit 1}`]);
 await wait(()=>child.exitCode!==null,'normal exit');ui=null;browser=null;
}
function serve(req,res){
 if(req.url==='/page'){res.setHeader('Content-Type','text/html');res.end('<title>Real upgrade session</title><script>window.ticks=0;function tick(){window.ticks++;requestAnimationFrame(tick)}tick();</script>');return;}
 if(req.url.startsWith('/latest.yml')){
  if(mode==='server-error'){res.writeHead(503);res.end('temporary unavailable');return;}
  const version=mode==='current'?'0.2.1':'0.2.2';const meta=yaml.load(fs.readFileSync(path.join(assets,version,'latest.yml'),'utf8'));
  if(mode==='bad-checksum'){meta.sha512=Buffer.alloc(64,1).toString('base64');meta.files[0].sha512=meta.sha512;}
  res.setHeader('Content-Type','application/yaml');res.end(yaml.dump(meta));return;
 }
 const name=path.basename(new URL(req.url,'http://127.0.0.1').pathname);const version=name.includes('0.2.1')?'0.2.1':'0.2.2';const file=path.join(assets,version,name);
 if(!fs.existsSync(file)||!/^Facet-Setup-0\.2\.[12]-x64\.exe(?:\.blockmap)?$/.test(name)){res.writeHead(404);res.end();return;}
 const bytes=fs.readFileSync(file);let start=0,end=bytes.length-1;
 if(req.headers.range){const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!m){res.writeHead(416);res.end();return;}start=Number(m[1]);end=m[2]?Number(m[2]):end;res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':end-start+1});}
 else res.writeHead(200,{'Content-Length':bytes.length});
 let offset=start;const send=()=>{if(res.destroyed)return;if(offset>end){res.end();return;}const next=Math.min(end+1,offset+2*1024*1024);res.write(bytes.subarray(offset,next));fileBytes+=next-offset;offset=next;setTimeout(send,20);};send();
}
async function main(){
 if(fs.existsSync(installDir))throw Error('Validation install target already exists');
 server=http.createServer(serve);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(34279,'127.0.0.1',resolve);});
 await run(path.join(assets,'0.2.1','Facet-Setup-0.2.1-x64.exe'),['/S','/currentuser','/D='+installDir]);
 await wait(()=>fs.existsSync(exe),'bootstrap install');
 const store=new Store(data),a=store.create('更新前实例');store.update(a.id,{url:'http://127.0.0.1:34279/page'});const marker=path.join(data,'preserve.marker');fs.writeFileSync(marker,'real-upgrade-validation');const before=hash(marker);
 await launch('0.2.1');pass('Real bootstrap NSIS install loads the application update UI');
 await ui.locator('#updateCheck').click();await ui.waitForFunction(()=>appUpdateState.status==='current');pass('Same-version feed reports current without downloading');
 mode='server-error';await ui.locator('#updateCheck').click();await ui.waitForFunction(()=>appUpdateState.status==='error');assert.equal(child.exitCode,null);pass('HTTP failure is displayed without exiting the application');
 mode='bad-checksum';await ui.locator('#updateCheck').click();await ui.waitForFunction(()=>appUpdateState.status==='available');await ui.locator('#updateDownload').click();await ui.waitForFunction(()=>appUpdateState.status==='error',null,{timeout:60000});assert.equal(child.exitCode,null);assert.equal(await ui.locator('#updateInstall').count(),0);pass('Corrupted digest prevents installation and leaves the app usable');
 mode='valid';await ui.locator('#updateCheck').click();await ui.waitForFunction(()=>appUpdateState.status==='available');await call('start',{id:a.id});
 await wait(async()=>(await call('snapshot')).instances[0].title==='Real upgrade session','real browser load');
 let page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().endsWith('/page'));await page.evaluate(()=>{localStorage.setItem('upgrade-persistence','test-marker');document.cookie='upgrade_marker=test; path=/; max-age=3600';});
 assert((await page.evaluate(()=>document.cookie)).includes('upgrade_marker=test'));
 await call('rename',{id:a.id,name:'更新后应保留'});
 const ticks=await page.evaluate(()=>window.ticks);await ui.locator('#updateDownload').click();
 await wait(async()=>{const state=await call('update-status');if(state.progress>0&&state.progress<100)progressSeen=true;return state.status==='downloaded';},'real installer download',90000);
 assert(await page.evaluate(()=>window.ticks)>ticks);assert.equal((await call('snapshot')).instances[0].status,'running');assert(fileBytes>100000000);pass('Real installer downloads and verifies while the running browser continues');
 await ui.screenshot({path:path.join(data,'update-downloaded.png')});
 await ui.locator('#updateInstall').click();await ui.waitForFunction(()=>modal?.type==='update-install');await ui.locator('#modal [data-action="modal-close"]').last().click();assert.equal(child.exitCode,null);assert.equal((await call('snapshot')).instances[0].status,'running');pass('Cancelling update confirmation leaves the live instance running');
 const oldAsar=hash(path.join(installDir,'resources','app.asar'));await close();assert.equal(hash(path.join(installDir,'resources','app.asar')),oldAsar);pass('Ordinary application exit does not silently install the downloaded update');
 await launch('0.2.1');await ui.locator('#updateCheck').click();await ui.waitForFunction(()=>appUpdateState.status==='available');await ui.locator('#updateDownload').click();await ui.waitForFunction(()=>appUpdateState.status==='downloaded');await call('start',{id:a.id});
 await ui.locator('#updateInstall').click();await ui.waitForFunction(()=>modal?.type==='update-install');await ui.locator('#modal [data-update-action="install"]').click();await wait(()=>child.exitCode!==null,'confirmed update exits old app');ui=null;browser=null;
 const targetHash=hash(path.join(assets,'0.2.2','win-unpacked','resources','app.asar'));
 await wait(()=>fs.existsSync(path.join(installDir,'resources','app.asar'))&&hash(path.join(installDir,'resources','app.asar'))===targetHash,'real NSIS upgrade',90000);
 const targetExeHash=hash(path.join(assets,'0.2.2','win-unpacked','FacetUpdateTest.exe'));
 await wait(()=>fs.existsSync(exe)&&hash(exe)===targetExeHash,'new executable');
 assert.equal(hash(marker),before);await launch('0.2.2');assert.equal((await call('snapshot')).instances[0].name,'更新后应保留');assert.equal((await call('snapshot')).instances[0].status,'stopped');
 await call('start',{id:a.id});await wait(async()=>(await call('snapshot')).instances[0].title==='Real upgrade session','upgraded browser load');page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().endsWith('/page'));assert.equal(await page.evaluate(()=>localStorage.getItem('upgrade-persistence')),'test-marker');assert((await page.evaluate(()=>document.cookie)).includes('upgrade_marker=test'));pass('Confirmed online NSIS upgrade retains configuration, cookies and localStorage across versions');
 await ui.locator('#updateCheck').click();await ui.waitForFunction(()=>appUpdateState.status==='current');pass('Upgraded application reports the correct version and no further update');
 await close();
}
main().catch(error=>{errors.push(error.stack||String(error));console.error(error.message);}).finally(async()=>{
 try{await close();}catch(error){errors.push(error.message);}if(child&&child.exitCode===null)child.kill();server?.close();
 const report={passed:results.length,results,errors,data,installDir,fileBytes,progressSeen};fs.writeFileSync(path.join(data,'verification.json'),JSON.stringify(report,null,2));console.log('Verification: '+path.join(data,'verification.json'));process.exit(errors.length?1:0);
});
