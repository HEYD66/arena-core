'use strict';
// Three separate real Chromium processes: source shutdown, offline snapshot/import, destination restart.
const {app,BrowserWindow,session,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.FACET_TRANSFER_TEST_ROOT,phase=process.env.FACET_TRANSFER_TEST_PHASE,url=process.env.FACET_TRANSFER_TEST_URL;
if(!root||!phase||!url)throw Error('Use the instance-transfer-runner');
const dir=path.join(root,phase==='source'||phase==='finalize'?'source':'destination');fs.mkdirSync(dir,{recursive:true});app.setPath('userData',dir);
const {Controller}=require('../src/main/controller.cjs'),{installIPC}=require('../src/main/ipc.cjs'),{finalizePending,withCookies}=require('../src/main/instance-transfer.cjs');
const wait=async fn=>{for(let i=0;i<200;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out');};
let c,w;setTimeout(()=>app.exit(2),120000).unref();
app.whenReady().then(async()=>{try{
 if(phase==='finalize'){
  const result=await finalizePending(dir);assert.equal(result.outcome.status,'success');assert(fs.existsSync(path.join(root,'instances.facetbackup')));assert(!fs.existsSync(path.join(dir,'instance-export.pending')));
  fs.writeFileSync(path.join(root,'finalize.json'),JSON.stringify({status:'success',bytes:result.outcome.bytes}));console.log('PASS offline password-free export after source process exits');app.quit();return;
 }
 w=new BrowserWindow({width:1400,height:900,show:true,webPreferences:{preload:path.join(__dirname,'../src/main/preload.cjs'),sandbox:true,contextIsolation:true}});
 c=new Controller(w,dir,path.join(__dirname,'../resources/mihomo/mihomo.exe'));installIPC(w,c);w.webContents.on('console-message',(_event,...args)=>{const text=args.find(x=>typeof x==='string'&&x.includes('Error'));if(text)console.error(text);});
 await w.loadFile(path.join(__dirname,'../src/renderer/index.html'));const ui=code=>w.webContents.executeJavaScript(code);await wait(()=>ui('typeof showInstanceNotes==="function"&&state.instances.length>0'));
 if(phase==='source'){
  const a=c.store.list()[0],b=c.store.create('隔离实例');c.store.update(a.id,{name:'迁移实例',url});c.store.update(b.id,{url});await c.start(a.id);await c.start(b.id);await wait(()=>c.runtimes.get(a.id).pageState.startsWith('已完成'));
  const wc=c.runtimes.get(a.id).view.webContents;
  await wc.executeJavaScript(`(async()=>{localStorage.setItem('memo','website-value');await new Promise((resolve,reject)=>{const r=indexedDB.open('backup-database',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onerror=()=>reject(Error('open'));r.onsuccess=()=>{const db=r.result,t=db.transaction('records','readwrite');t.objectStore('records').put(new Blob(['binary-database-value']),'blob');t.oncomplete=()=>{db.close();resolve()};t.onerror=()=>reject(Error('write'))}});const cache=await caches.open('website-cache');await cache.put('/cached-resource',new Response('cached-website-value'));if(navigator.storage.getDirectory){const d=await navigator.storage.getDirectory(),f=await d.getFileHandle('memo.txt',{create:true}),out=await f.createWritable();await out.write('opfs-value');await out.close();}document.cookie='sessionLogin=session-fixture; path=/';})()`);
  await c.runtimes.get(a.id).session.cookies.set({url,name:'httpOnlyLogin',value:'login-fixture',httpOnly:true,path:'/',expirationDate:Date.now()/1000+86400});
  await withCookies(c.runtimes.get(a.id).session,debug=>debug.sendCommand('Network.setCookies',{cookies:[{url:'https://partition.test',name:'partitioned',value:'chips-fixture',secure:true,httpOnly:true,sameSite:'None',partitionKey:{topLevelSite:'https://top.test',hasCrossSiteAncestor:true},expires:Date.now()/1000+86400}]}));
  assert.equal((await c.runtimes.get(b.id).session.cookies.get({})).length,0);assert.equal(await c.runtimes.get(b.id).view.webContents.executeJavaScript('localStorage.getItem("memo")'),null);
  await ui(`route('overview')`);await wait(()=>ui(`!!document.querySelector('.instance-name-line [data-id="${a.id}"]')`));
  assert(await ui(`(()=>{const b=document.querySelector('.instance-name-line [data-id="${a.id}"]'),cell=b.closest('td').getBoundingClientRect(),r=b.getBoundingClientRect(),name=b.previousElementSibling.getBoundingClientRect();return r.x>=name.right&&r.right<=cell.right&&r.width>0})()`));
  await ui(`document.querySelector('.instance-name-line [data-id="${a.id}"]').click();document.querySelector('#instanceNotes').value=${JSON.stringify(' 第一行备忘录\n待办：保留账号 <script>\n ')};document.querySelector('[data-transfer="save-notes"]').click()`);
  await wait(()=>c.store.get(a.id).notes?.includes('待办'));assert.equal(c.runtimes.get(a.id).status,'running');const text=c.store.get(a.id).notes;assert.equal(new (require('../src/main/store.cjs').Store)(dir).get(a.id).notes,text);
  await ui(`route('overview')`);await wait(()=>ui('!!document.querySelector(".instance-note-preview")'));assert((await ui('document.querySelector("#content").textContent')).includes('待办'));assert.equal(await ui('!!document.querySelector("#content script")'),false);
  fs.writeFileSync(path.join(root,'notes-ui.png'),(await w.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(root,'source-result.json'),JSON.stringify({id:a.id,other:b.id,notes:text}));
  // Add real excluded files so archive filtering is checked on the emitted artifact.
  const plugin=path.join(dir,'Partitions','arena-core-'+a.id,'Local Extension Settings','fixture');fs.mkdirSync(plugin,{recursive:true});fs.writeFileSync(path.join(plugin,'state'),'extension-test-value');
  c.store.saveNodes(a.id,[{name:'Source proxy',type:'http',server:'127.0.0.1',port:Number(new URL(url).port),username:'source-user',password:'source-proxy-secret'}],null);c.store.update(a.id,{network:{mode:'mihomo',nodeName:'Source proxy'}});await c.stop(a.id);await c.start(a.id);await wait(()=>c.runtimes.get(a.id).pageState.startsWith('已完成'));require('../src/main/diagnostics.cjs').TARGETS.ip=url+'geo';
  c.transferRestart=()=>{setTimeout(()=>app.quit(),500);};dialog.showSaveDialog=async()=>({canceled:false,filePath:path.join(root,'instances.facetbackup')});
  await ui(`showExport([${JSON.stringify(a.id)}]);document.querySelector('#transferQueryExit').checked=true;document.querySelector('#transferRestart').checked=true;document.querySelector('[data-transfer="export-commit"]').click()`);
  await wait(()=>fs.existsSync(path.join(dir,'instance-export.pending')));const pending=fs.readFileSync(path.join(dir,'instance-export.pending'));assert(!pending.includes(Buffer.from('session-fixture')));console.log('PASS actual notes UI, isolation, session/HttpOnly/partitioned cookies and encrypted pending export');return;
 }
 if(phase==='import'){
  const source=JSON.parse(fs.readFileSync(path.join(root,'source-result.json'))),prior=fs.readFileSync(c.store.file),before=c.store.list().length;
  const bad=fs.readFileSync(path.join(root,'instances.facetbackup'));bad[70]^=1;fs.writeFileSync(path.join(root,'tampered.facetbackup'),bad);await assert.rejects(c.transfer.inspect(path.join(root,'tampered.facetbackup')));assert.equal(c.store.list().length,before);
  await c.library.save({name:'目标设备节点',text:JSON.stringify({proxies:[{name:'New proxy',type:'http',server:'127.0.0.1',port:Number(new URL(url).port),username:'new-user',password:'new-proxy-secret'}]})});require('../src/main/diagnostics.cjs').TARGETS.ip=url+'geo';
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(root,'instances.facetbackup')]});
  await ui("route('overview')");await wait(()=>ui('!!document.querySelector("[data-transfer=import]")'));
  await ui(`document.querySelector('[data-transfer="import"]').click()`);await wait(()=>ui('modal?.type==="instance-import-choices"&&!modal.busy'));
  assert((await ui('document.querySelector(".transfer-country").textContent')).includes('United States'));assert((await ui('document.querySelector(".transfer-notes").textContent')).includes('待办'));
  await ui(`document.querySelector('[data-transfer="import-commit"]').click()`);await wait(()=>ui('document.querySelector("#transferError").textContent.includes("选择")'));assert.equal(c.store.list().length,before);
  fs.writeFileSync(path.join(root,'import-ui.png'),(await w.webContents.capturePage()).toPNG());
  await ui(`document.querySelector('[data-transfer-node="0"]').value='0';document.querySelector('[data-transfer-locale="0"]').checked=true;document.querySelector('[data-transfer="import-commit"]').click()`);await wait(()=>ui('!modal'));assert.equal(c.store.list().length,before+1);
  const imported=c.store.list().find(x=>x.name==='迁移实例');assert.notEqual(imported.id,source.id);assert.equal(imported.notes,source.notes);assert.equal(imported.autoStart,false);assert.equal(imported.network.mode,'mihomo');assert.equal(imported.environment.timezone,'America/Los_Angeles');assert.equal(imported.environment.language,'en-US');assert.equal(c.store.nodes(imported.id)[0].password,'new-proxy-secret');assert.equal(c.runtimes.get(imported.id)?.status,undefined);assert.equal(c.extensions.catalog.enabled(imported.id).length,0);
  assert(!fs.existsSync(path.join(dir,'Partitions','arena-core-'+imported.id,'Local Extension Settings')));
  assert(fs.existsSync(c.transfer.cookieFile(imported.id)));fs.writeFileSync(path.join(root,'imported-id.txt'),imported.id);await c.closeAll();console.log('PASS real import UI shows prior country, requires new proxy, syncs locale and preserves stopped imported instance');app.quit();return;
 }
 if(phase==='import-fallback'){
  const source=JSON.parse(fs.readFileSync(path.join(root,'source-result.json'))),before=c.store.list().length;
  require('../src/main/diagnostics.cjs').TARGETS.ip=url+'geo-fail';
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(root,'instances.facetbackup')]});
  await ui(`route('overview');document.querySelector('[data-transfer="import"]').click()`);await wait(()=>ui('modal?.type==="instance-import-choices"&&!modal.busy'));
  const original=await ui('transferDraft.instances[0].environment');
  assert(!(await ui('document.querySelector("#modal").textContent')).includes('取消本次导入'));
  await ui(`document.querySelector('[data-transfer-node="0"]').value='direct';document.querySelector('[data-transfer-locale="0"]').checked=true;document.querySelector('[data-transfer="import-commit"]').click()`);
  await wait(()=>ui('modal?.type==="instance-import-result"'));
  assert.equal(c.store.list().length,before+1);const imported=c.store.list().at(-1);
  assert.equal(imported.notes,source.notes);assert.deepEqual(imported.environment,original);assert.equal(imported.network.mode,'direct');assert.equal(c.runtimes.get(imported.id)?.status,undefined);
  assert.deepEqual(new (require('../src/main/store.cjs').Store)(dir).get(imported.id).environment,original);
  assert((await ui('document.querySelector("#modal").textContent')).includes('已导入'));assert((await ui('document.querySelector(".transfer-warning-list").textContent')).includes('保留原设置'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'fallback-query-state.json'))).importedAtProbe,true);
  assert(fs.existsSync(c.transfer.cookieFile(imported.id)));fs.writeFileSync(path.join(root,'fallback-imported-id.txt'),imported.id);
  fs.writeFileSync(path.join(root,'import-fallback-ui.png'),(await w.webContents.capturePage()).toPNG());
  await c.closeAll();console.log('PASS actual HTTP 503 after import commit retains imported instance, original locale and notes, and shows nonblocking warning');app.quit();return;
 }
 if(phase==='first-start'){
  for(const marker of ['imported-id.txt','fallback-imported-id.txt']){const imported=c.store.get(fs.readFileSync(path.join(root,marker),'utf8'));
  await c.start(imported.id);await wait(()=>c.runtimes.get(imported.id).pageState.startsWith('已完成'));const wc=c.runtimes.get(imported.id).view.webContents;
  assert(!fs.existsSync(c.transfer.cookieFile(imported.id)));
  const data=await wc.executeJavaScript(`(async()=>({memo:localStorage.getItem('memo'),db:await new Promise((resolve,reject)=>{const r=indexedDB.open('backup-database');r.onsuccess=()=>{const db=r.result,q=db.transaction('records').objectStore('records').get('blob');q.onsuccess=async()=>{resolve(await q.result.text());db.close()};q.onerror=reject};r.onerror=reject}),cache:await (await (await caches.open('website-cache')).match('/cached-resource')).text(),opfs:navigator.storage.getDirectory?await (await (await (await navigator.storage.getDirectory()).getFileHandle('memo.txt')).getFile()).text():null,session:document.cookie.includes('session-fixture'),login:await (await fetch('/login')).text()}))()`);
  assert.equal(data.memo,'website-value');assert.equal(data.db,'binary-database-value');assert.equal(data.cache,'cached-website-value');assert.equal(data.opfs,'opfs-value');assert.equal(data.session,true);assert.equal(data.login,'authenticated');
  const cookies=await withCookies(c.runtimes.get(imported.id).session,async d=>(await d.sendCommand('Network.getAllCookies')).cookies);assert(cookies.some(c=>c.name==='partitioned'&&c.partitionKey.topLevelSite==='https://top.test'));
  }
  await c.closeAll();console.log('PASS first start after process restart restores session/HttpOnly/partitioned cookies, login/IndexedDB/blob/CacheStorage/OPFS');app.quit();return;
 }
 if(phase==='restart'){
  const id=fs.readFileSync(path.join(root,'imported-id.txt'),'utf8');assert(c.store.get(id).notes.includes('待办'));await c.start(id);await wait(()=>c.runtimes.get(id).pageState.startsWith('已完成'));assert.equal(await c.runtimes.get(id).view.webContents.executeJavaScript('localStorage.getItem("memo")'),'website-value');assert.equal(await c.runtimes.get(id).view.webContents.executeJavaScript('(async()=>await (await fetch("/login")).text())()'),'authenticated');await c.closeAll();console.log('PASS destination process restart retains notes, website storage and persistent login');app.quit();
 }
}catch(error){console.error(error.stack);try{await c?.closeAll();}catch{}app.exit(1);}});
