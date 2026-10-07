'use strict';
const {app,BrowserWindow,session}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=process.env.FACET_PROBE_ROOT,url=process.env.FACET_PROBE_URL,phase=process.env.FACET_PROBE_PHASE;
if(!root||!url||!phase)throw Error('Use runner.cjs');
const repo=path.resolve(__dirname,'..'),dir=path.join(root,phase==='source'?'source':process.env.FACET_PROBE_PADDING||'',phase==='source'?'':process.env.FACET_PROBE_CASE);
fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
const {Controller}=require(path.join(repo,'src/main/controller.cjs')),{withCookies,profile,validateMetadata}=require(path.join(repo,'src/main/instance-transfer.cjs')),archive=require(path.join(repo,'src/main/instance-archive.cjs')),data=require('./instance-live-export-data.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,limit=200){for(let i=0;i<limit;i++){if(await fn())return;await delay(50)}throw Error('probe timeout')}
function save(file,value){fs.writeFileSync(path.join(root,file),JSON.stringify(value,null,2));}
let c,w;const deadline=setTimeout(()=>app.exit(3),150000);deadline.unref();
async function load(id){await c.start(id);await wait(()=>c.runtimes.get(id).pageState?.startsWith('已完成'));return c.runtimes.get(id).view.webContents}
function digest(id){const files=archive.files(profile(dir,id));return crypto.createHash('sha256').update(files.map(x=>x.path+':'+crypto.createHash('sha256').update(fs.readFileSync(x.file)).digest('hex')).join('\n')).digest('hex')}
async function dump(id,name){
 const ses=session.fromPartition('persist:arena-core-'+id),x=c.store.get(id),begin=Date.now(),item={name,sourcePID:process.pid};
 try{const result=await c.transfer.prepareExport([id],path.join(root,name+'.facetbackup'));const decoded=await archive.readArchive(path.join(root,name+'.facetbackup'),path.join(root,name+'-check'));item.written=result.status==='success';item.bytes=result.bytes;item.files=result.files;item.archiveVerified=decoded.metadata.instances[0].notes===x.notes;item.originalAutomaticallyResumed=c.runtimes.get(id).status==='running';assert(item.originalAutomaticallyResumed);assert(!fs.existsSync(path.join(dir,'instance-export.pending')));}
 catch(e){item.written=false;item.errorCode=e.code||null;item.error=String(e.message).replaceAll(root,'[isolated-test-root]');}
 item.durationMs=Date.now()-begin;return item;
}
app.whenReady().then(async()=>{try{
 w=new BrowserWindow({width:1200,height:800,show:false,webPreferences:{sandbox:true,contextIsolation:true}});await w.loadURL('data:text/html,<h1>Isolated export feasibility probe</h1>');
 c=new Controller(w,dir,path.join(repo,'resources/mihomo/mihomo.exe'));
 if(phase==='source'){
  const selected=c.store.list()[0],keep=c.store.create('Unselected continuity fixture'),worker=c.store.create('Worker fixture');
  for(const [x,label]of [[selected,'normal'],[keep,'keep'],[worker,'worker']])c.store.update(x.id,{url:url+'?'+label,notes:'Synthetic note '+label,network:{mode:'direct',nodeName:''}});
  const wc=await load(selected.id),kwc=await load(keep.id),swc=await load(worker.id);kwc.setBackgroundThrottling(false);
  await kwc.executeJavaScript(`window.probeTicks=0;setInterval(()=>{window.probeTicks++;fetch('/beat?keep').catch(()=>{})},40);true`);
  await kwc.executeJavaScript(`(async()=>{await navigator.serviceWorker.register('/sw.js');const reg=await navigator.serviceWorker.ready;await new Promise(resolve=>{navigator.serviceWorker.addEventListener('message',e=>{if(e.data==='started')resolve()},{once:true});reg.active.postMessage('keep')});return true})()`);const keepSession=kwc.session;assert(Object.keys(keepSession.serviceWorkers.getAllRunning()).length>0);
  let ticks=0;const timer=setInterval(()=>ticks++,20),keepIdentity=kwc.id,pid=process.pid;
  const report={electron:process.versions.electron,sourcePID:pid,scenarios:[],checks:[],dataRoot:root};
  for(const target of [wc,swc]){await target.executeJavaScript(data.write);await target.session.cookies.set({url,name:'probeLogin',value:'synthetic-login',httpOnly:true,expirationDate:Date.now()/1000+3600});await withCookies(target.session,d=>d.sendCommand('Network.setCookies',{cookies:[{url:'https://partition.test',name:'probeCHIPS',value:'synthetic-chips',secure:true,httpOnly:true,sameSite:'None',partitionKey:{topLevelSite:'https://top.test',hasCrossSiteAncestor:true},expires:Date.now()/1000+3600}]}));}
  const keepBefore=await kwc.executeJavaScript('probeTicks');
  report.scenarios.push(await dump(selected.id,'normal'));
  await swc.executeJavaScript(`(async()=>{await navigator.serviceWorker.register('/sw.js');const reg=await navigator.serviceWorker.ready;await new Promise(resolve=>{navigator.serviceWorker.addEventListener('message',e=>{if(e.data==='started')resolve()},{once:true});reg.active.postMessage('start')});return true})()`);
  const workerSes=swc.session;await c.stop(worker.id);
  const beatsBefore=Number(await(await fetch(url+'worker-count')).text());await delay(900);const beatsAfter=Number(await(await fetch(url+'worker-count')).text());
  report.workerAfterViewClose={running:Object.keys(workerSes.serviceWorkers.getAllRunning()).length,backgroundRequestsAfterClose:beatsAfter-beatsBefore};
  await load(worker.id);
  report.scenarios.push(await dump(worker.id,'worker-stopped'));
  assert(Object.keys(keepSession.serviceWorkers.getAllRunning()).length>0,'unselected service worker must remain running');report.checks.push({name:'unselected service worker keeps running during selected export',passed:true});
  report.checks.push({name:'unselected page continues with same WebContents',passed:kwc.id===keepIdentity&&!kwc.isDestroyed()&&c.runtimes.get(keep.id).status==='running'&&(await kwc.executeJavaScript('probeTicks'))>keepBefore});
  report.checks.push({name:'main process remains alive and responsive',passed:pid===process.pid&&ticks>0&&(await w.webContents.executeJavaScript('1+1'))===2});
  save('source-ready.json',report);console.log('SOURCE_READY');await wait(()=>fs.existsSync(path.join(root,'verify-done')),2000);
  await load(selected.id);await load(worker.id);
  for(const id of [selected.id,worker.id]){const got=await c.runtimes.get(id).view.webContents.executeJavaScript(data.read);assert.equal(got.rows,64);for(const key of ['rowsValid','blobValid','cacheValid','opfsValid','session','login'])assert.equal(got[key],true,key);}
  report.checks.push({name:'selected source instances resume with original data',passed:true});report.keepTicksAtEnd=await kwc.executeJavaScript('probeTicks');report.mainTicks=ticks;report.sameSourceProcessThroughDestinationImport=pid===process.pid;
  clearInterval(timer);await c.closeAll();save('source-result.json',report);console.log('PASS isolated source continuity and restoration');app.quit();return;
 }
 const name=process.env.FACET_PROBE_CASE;
 let ids;
 if(phase==='import'){const draft=await c.transfer.inspect(path.join(root,(process.env.FACET_PROBE_ARCHIVE||name)+'.facetbackup'));const imported=await c.transfer.import(draft.token,[{mode:'direct',syncLocale:false}]);ids=imported.ids;save(name+'-ids.json',ids)}else ids=JSON.parse(fs.readFileSync(path.join(root,name+'-ids.json')));
 const rows=[];
 for(const id of ids){const wc=await load(id),got=await wc.executeJavaScript(data.read);const cacheSummary=await wc.executeJavaScript(`(async()=>{const out=[];for(const name of await caches.keys()){const cache=await caches.open(name),keys=await cache.keys();out.push({name,entries:keys.length,paths:keys.map(x=>new URL(x.url).pathname)})}return out})()`);save(name+'-'+phase+'-storage-check.json',{...got,cacheSummary});assert.equal(got.localLength,512*1024);assert.equal(got.rows,64);for(const key of ['rowsValid','blobValid','cacheValid','opfsValid','login'])assert.equal(got[key],true,key);if(phase==='import'){assert.equal(got.session,true);const cookies=await withCookies(wc.session,async d=>(await d.sendCommand('Network.getAllCookies')).cookies);assert(cookies.some(x=>x.name==='probeCHIPS'&&x.partitionKey?.topLevelSite==='https://top.test'))}assert(c.store.get(id).notes.startsWith('Synthetic note'));rows.push({id,storageValid:true,loginValid:true,notesValid:true})}
 await c.closeAll();save(name+'-'+phase+'.json',{status:'passed',rows,processPID:process.pid});console.log('PASS '+name+' '+phase+' actual import/storage/login');app.quit();
}catch(e){save(phase==='source'?'source-failure.json':process.env.FACET_PROBE_CASE+'-'+phase+'.json',{status:'failed',errorCode:e.code||null,error:e.message});console.error('PROBE_FAIL '+e.message);try{await c?.closeAll()}catch{}app.exit(1)}});
