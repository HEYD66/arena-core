'use strict';
// Launch the production entry point, then normally close and restart the real app.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{chromium}=require('playwright'),{Store}=require('../src/main/store.cjs');
const runtime=require('../scripts/electron-runtime.cjs'),source=!process.argv[2];
const executable=source?runtime.resolveRuntime({executable:require('electron'),version:require('electron/package.json').version,env:runtime.childEnvironment()}):path.resolve(process.argv[2]);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'facet-autostart-')),report={root,executable,source,results:[],errors:[]};
let server,child,browser,ui;const hits=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),pass=name=>{report.results.push(name);console.log('PASS '+name);};
async function wait(fn,label,ms=40000){const until=Date.now()+ms;while(Date.now()<until){if(await fn())return;await sleep(60);}throw Error('Timeout '+label);}
async function call(action,payload={}){const r=await ui.evaluate(({action,payload})=>window.facet.request(action,payload),{action,payload});assert.equal(r.ok,true,r.error);return r.value;}
async function launch(){
 fs.rmSync(path.join(root,'DevToolsActivePort'),{force:true});
 child=spawn(executable,[...(source?[path.resolve(__dirname,'..')]:[]),'--user-data-dir='+root,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'],{env:runtime.childEnvironment(),stdio:'ignore',windowsHide:false});
 await wait(()=>{if(child.exitCode!==null)throw Error('App exited '+child.exitCode);return fs.existsSync(path.join(root,'DevToolsActivePort'));},'app launch');
 const port=Number(fs.readFileSync(path.join(root,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0]);browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 await wait(()=>{ui=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/src/renderer/index.html'));return !!ui;},'controls');
 await ui.waitForFunction(()=>typeof route==='function'&&state.instances.length===4);if(!source)assert(ui.url().includes('app.asar'));
 await ui.evaluate(()=>route('overview'));
}
async function close(){
 if(!child||child.exitCode!==null)return;
 const closer=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`if(-not (Get-Process -Id ${child.pid}).CloseMainWindow()){exit 1}`],{windowsHide:true,stdio:'ignore'});
 await new Promise((resolve,reject)=>{closer.on('error',reject);closer.on('exit',code=>code===0?resolve():reject(Error('CloseMainWindow failed')));});
 await wait(()=>child.exitCode!==null,'normal exit',20000);assert.equal(child.exitCode,0);await browser?.close();browser=null;ui=null;
}
async function toggle(id,enabled){
 await ui.locator('[data-autostart="'+id+'"]').click();
 await ui.waitForFunction(({id,enabled})=>{const b=document.querySelector('[data-autostart="'+id+'"]');return b&&!b.disabled&&b.getAttribute('aria-checked')===String(enabled);},{id,enabled});
 assert.equal(new Store(root).get(id).autoStart,enabled);
}
async function loaded(id,base){await wait(()=>browser.contexts().flatMap(c=>c.pages()).some(p=>p.url()===base+id),'instance page');const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url()===base+id);await page.waitForLoadState('domcontentloaded');assert.equal(await page.title(),'Auto-start '+id);return page;}
async function main(){
 server=http.createServer((req,res)=>{hits.push(req.url);res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>Auto-start '+req.url.slice(1)+'</title><h1>Real startup page</h1>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port+'/',store=new Store(root),a=store.create('自动启动 A'),b=store.create('失败实例 B',{mode:'mihomo',nodeName:'不存在节点'}),c=store.create('自动启动 C'),d=store.create('保持关闭 D');
 for(const x of store.list())store.update(x.id,{url:base+x.id});const legacy=JSON.parse(fs.readFileSync(store.file));for(const x of legacy.instances)delete x.autoStart;fs.writeFileSync(store.file,JSON.stringify(legacy));
 fs.writeFileSync(path.join(root,'app-settings.json'),JSON.stringify({confirmExit:false}));
 await launch();assert((await call('snapshot')).instances.every(x=>x.status==='stopped'&&x.autoStart===false));assert.equal(hits.length,0);assert.equal(await ui.locator('[role=switch][data-autostart]').count(),4);pass('Legacy profiles default to disabled and real main startup opens no instance pages');
 for(const x of [a,b,c])await toggle(x.id,true);assert((await call('snapshot')).instances.every(x=>x.status==='stopped'));assert.equal(await ui.locator('[data-select]:checked').count(),0);pass('Real row switches persist immediately without starting instances or changing row selection');
 await call('start',{id:a.id});const pageA=await loaded(a.id,base);await pageA.evaluate(()=>localStorage.setItem('autostart-preserved','KEEP'));
 await toggle(a.id,false);await toggle(a.id,true);assert.equal((await call('snapshot')).instances.find(x=>x.id===a.id).status,'running');assert.equal(await pageA.evaluate(()=>localStorage.getItem('autostart-preserved')),'KEEP');
 const before=fs.readFileSync(store.file),invalid=await ui.evaluate(id=>window.facet.request('instance-autostart',{id,enabled:'true'}),a.id);assert.equal(invalid.ok,false);assert.deepEqual(fs.readFileSync(store.file),before);pass('Toggling a running instance preserves its live page; malformed IPC cannot change persisted data');
 await close();await launch();await wait(async()=>{const s=await call('snapshot');return s.instances.find(x=>x.id===a.id).status==='running'&&s.instances.find(x=>x.id===b.id).status==='error'&&s.instances.find(x=>x.id===c.id).status==='running';},'startup pass');
 const s=await call('snapshot');assert.equal(s.instances.find(x=>x.id===d.id).status,'stopped');assert.equal(s.instances.find(x=>x.id===b.id).network.mode,'mihomo');assert(!browser.contexts().flatMap(c=>c.pages()).some(p=>p.url()===base+b.id));assert(hits.includes('/'+a.id));await loaded(c.id,base);
 assert.equal(await (await loaded(a.id,base)).evaluate(()=>localStorage.getItem('autostart-preserved')),'KEEP');pass('Normal restart automatically loads enabled real pages; a missing proxy node fails without direct fallback and later enabled instances still start; session storage survives');
 for(const [width,height]of [[1440,960],[1024,768]]){await ui.setViewportSize({width,height});await ui.evaluate(()=>route('overview'));const rect=await ui.locator('[data-autostart="'+a.id+'"]').boundingBox();assert(rect&&rect.x>=0&&rect.x+rect.width<=width,'Switch clipped at '+width);assert(await ui.locator('[data-ux=instance-config]').first().isVisible());}
 await ui.setViewportSize({width:1440,height:960});await ui.screenshot({path:path.join(root,'autostart-overview.png')});pass('Switches and original row actions remain reachable at normal and minimum desktop widths');
 await toggle(a.id,false);assert.equal((await call('snapshot')).instances.find(x=>x.id===a.id).status,'running');await close();await launch();await wait(async()=>{const s=await call('snapshot');return s.instances.find(x=>x.id===b.id).status==='error'&&s.instances.find(x=>x.id===c.id).status==='running';},'second startup pass');assert.equal((await call('snapshot')).instances.find(x=>x.id===a.id).status,'stopped');assert.equal((await call('snapshot')).instances.find(x=>x.id===d.id).status,'stopped');pass('Disabling a running instance leaves it running now but excludes it from the next real launch');
 await close();
}
main().catch(error=>{report.errors.push(error.stack||String(error));console.error(error);}).finally(async()=>{try{await close();}catch(error){report.errors.push(error.message);child?.kill();}server?.close();fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log('REPORT '+path.join(root,'report.json'));process.exit(report.errors.length?1:0);});
