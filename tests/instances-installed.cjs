'use strict';
// Real packaged application, production IPC, isolated data and local animated pages.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const executable=path.resolve(process.argv[2]),root=fs.mkdtempSync(path.join(os.tmpdir(),'facet-instances-'));
const report={executable,root,results:[],errors:[]};let child,browser,ui,server;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,label,ms=60000){const until=Date.now()+ms;while(Date.now()<until){if(await fn())return;await sleep(60);}throw Error('Timeout '+label);}
const pass=name=>{report.results.push(name);console.log('PASS '+name);};
async function call(action,payload={}){const r=await ui.evaluate(({action,payload})=>bridge.request(action,payload),{action,payload});assert.equal(r.ok,true,r.error);return r.value;}
async function launch(){
 fs.rmSync(path.join(root,'DevToolsActivePort'),{force:true});const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 child=spawn(executable,['--user-data-dir='+root,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'],{env,windowsHide:false,stdio:'ignore'});
 await wait(()=>{if(child.exitCode!==null)throw Error('App exited '+child.exitCode);return fs.existsSync(path.join(root,'DevToolsActivePort'));},'app start');
 const port=Number(fs.readFileSync(path.join(root,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0]);browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 await wait(()=>{ui=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/src/renderer/index.html'));return !!ui;},'packaged controls');
 await ui.waitForFunction(()=>typeof bridge!=='undefined'&&state.instances.length>0);assert(ui.url().includes('app.asar'));
}
async function close(){
 if(!child||child.exitCode!==null)return;
 const snapshot=await call('snapshot');for(const x of snapshot.instances)if(['running','starting'].includes(x.status))await call('stop',{id:x.id});
 const closer=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`if(-not (Get-Process -Id ${child.pid}).CloseMainWindow()){exit 1}`],{windowsHide:true,stdio:'ignore'});
 await new Promise((resolve,reject)=>{closer.on('error',reject);closer.on('exit',code=>code===0?resolve():reject(Error('CloseMainWindow failed')));});
 await wait(()=>child.exitCode!==null,'normal app exit',20000);await browser.close();browser=null;ui=null;
}
async function main(){
 server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Facet animation</title><h1>Live local page</h1><script>window.ticks=0;function tick(){window.ticks++;requestAnimationFrame(tick)}tick()</script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port+'/';await launch();
 let snapshot=await call('snapshot');const ids=snapshot.instances.map(x=>x.id);
 for(let i=ids.length;i<64;i++)ids.push(await call('create',{name:'验证实例 '+(i+1),network:{mode:'direct',nodeName:''}}));
 await ui.waitForFunction(()=>state.instances.length===64);assert.equal(new Set(ids).size,64);
 await ui.evaluate(()=>{filter='all';search='';route('overview');});assert.equal(await ui.locator('.managed-card').count(),64);
 await ui.evaluate(id=>route('browser',id),ids.at(-1));
 await ui.waitForFunction(id=>{const e=document.querySelector('[data-tab="'+id+'"]')?.closest('.tab'),box=document.querySelector('#tabs').getBoundingClientRect();if(!e)return false;const r=e.getBoundingClientRect();return r.left>=box.left-1&&r.right<=box.right+1;},ids.at(-1));
 await call('rename',{id:ids.at(-1),name:'最后一个·Facet'});
 pass('64 instances created through production IPC; all overview rows and last tab are reachable');
 const source=await call('library-proxy-save',{proxy:{name:'本机验证源',protocol:'http',host:'127.0.0.1',port:9}}),sourceId=typeof source==='string'?source:source.id;
 snapshot=await call('snapshot');const node=snapshot.library.find(s=>s.id===sourceId).nodes[0];
 const assignments=ids.map(id=>({id,sourceId,name:node.name}));
 for(const invalid of [[],[assignments[0],assignments[0]],[assignments[0],{...assignments[1],id:'missing'}]]){
  const before=fs.readFileSync(path.join(root,'instances.json'));
  const r=await ui.evaluate(assignments=>bridge.request('library-assign-many',{assignments}),invalid);assert.equal(r.ok,false);assert.deepEqual(fs.readFileSync(path.join(root,'instances.json')),before);
 }
 const assigned=await call('library-assign-many',{assignments});assert.equal(assigned.count,64);assert.equal(assigned.partial,false);assert(assigned.results.every(x=>x.status==='success'));
 const operation=JSON.parse(fs.readFileSync(path.join(root,'batch-operations',assigned.operationId+'.json'),'utf8'));assert.equal(operation.items.length,64);assert(operation.items.every(x=>x.status==='success'));
 assert(JSON.parse(fs.readFileSync(path.join(root,'instances.json'),'utf8')).instances.every(x=>x.network.mode==='mihomo'));
 pass('64 node assignments persist individual success; empty, duplicate and unknown targets fail without changing instance data');
 for(const id of ids)await call('settings',{id,patch:{network:{mode:'direct',nodeName:''}}});
 await close();await launch();snapshot=await call('snapshot');assert.equal(snapshot.instances.length,64);assert.equal(snapshot.instances.at(-1).name,'最后一个·Facet');assert(snapshot.instances.every(x=>x.status==='stopped'&&x.network.mode==='direct'));
 pass('All 64 names and network configurations survive a normal application restart');
 const active=ids.slice(0,24);for(const id of active){await call('start',{id});await call('navigate',{id,url:base+id});}
 await wait(async()=>{const s=await call('snapshot');return s.instances.filter(x=>active.includes(x.id)).every(x=>x.status==='running'&&x.title==='Facet animation'&&!x.error);},'24 real pages loaded',120000);
 await ui.evaluate(()=>{gridPrefs.mode='live';gridPrefs.cols=3;route('grid');});await ui.waitForFunction(()=>!gridInFlight&&!gridFrame&&document.querySelectorAll('.grid-tile').length===64);
 assert.equal(await ui.locator('.grid-thumb').count(),0);
 const pages=browser.contexts().flatMap(c=>c.pages()).filter(p=>p.url().startsWith(base));assert.equal(pages.length,24);
 const before=await Promise.all(pages.map(p=>p.evaluate(()=>window.ticks)));
 await ui.evaluate(async()=>{const e=document.querySelector('#content');for(let i=0;i<30;i++){e.scrollTop=(e.scrollHeight-e.clientHeight)*i/29;await new Promise(requestAnimationFrame);}if(e.scrollTop<=0)throw Error('No grid scroll');});
 await sleep(400);const after=await Promise.all(pages.map(p=>p.evaluate(()=>window.ticks)));assert(after.every((x,i)=>x>before[i]));
 const last=active.at(-1);await ui.locator('.grid-tile[data-grid-id="'+last+'"]').locator('[data-grid-act="zoom"]').click();await ui.waitForFunction(id=>gridZoom===id,last);
 await ui.locator('[data-grid-act="unzoom"]').click();await ui.waitForFunction(()=>gridZoom===null);
 await pages[0].evaluate(()=>localStorage.setItem('facet-test-persistence','kept'));const savedURL=pages[0].url();
 pass('After restart, all 64 configurations remain; 24 actual pages animate in live grid with scrolling and zoom/return');
 await close();await launch();assert.equal((await call('snapshot')).instances.length,64);const savedId=ids.find(id=>base+id===savedURL);await call('start',{id:savedId});
 await wait(()=>browser.contexts().flatMap(c=>c.pages()).some(p=>p.url()===savedURL),'reopened page');const restored=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url()===savedURL);assert.equal(await restored.evaluate(()=>localStorage.getItem('facet-test-persistence')),'kept');
 await ui.evaluate(()=>route('global'));const text=await ui.locator('#content').textContent();assert(text.includes('github.com/HEYD66/facet'));assert(!/Arena Core|arena-core/.test(text));
 pass('Normal exit/restart preserves browser storage; application information displays the new repository name');
}
main().catch(error=>{report.errors.push(error.stack||String(error));console.error(error);}).finally(async()=>{
 try{await close();}catch(error){report.errors.push(error.message);child?.kill();}server?.close();
 fs.writeFileSync(path.join(root,'verification.json'),JSON.stringify(report,null,2));console.log('REPORT '+path.join(root,'verification.json'));process.exit(report.errors.length?1:0);
});
