'use strict';
// Real row-menu clicks and production IPC; local-only pages and temporary user data.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'facet-rename-test-'));app.setPath('userData',root);
const {Controller}=require('../src/main/controller.cjs'),{installIPC}=require('../src/main/ipc.cjs'),{Store}=require('../src/main/store.cjs');
const results=[];let win,c,server;const errors=[];
const wait=async(fn,label)=>{for(let i=0;i<250;i++){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('Timeout: '+label);};
const ok=name=>{results.push(name);console.log('PASS '+name);};
setTimeout(()=>{console.error('Rename test timed out');app.exit(2);},90000).unref();
app.whenReady().then(async()=>{try{
 server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Rename fixture</title><body>local</body>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
 win=new BrowserWindow({width:1440,height:960,show:true,webPreferences:{preload:path.join(__dirname,'../src/main/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 c=new Controller(win,root,path.join(__dirname,'../resources/mihomo',process.platform==='win32'?'mihomo.exe':'mihomo'));installIPC(win,c);
 const a=c.store.list()[0],b=c.store.create('要改名的实例');c.store.update(a.id,{url});c.store.update(b.id,{url});
 await win.loadFile(path.join(__dirname,'../src/renderer/index.html'));const ui=async code=>{try{return await win.webContents.executeJavaScript(code);}catch(error){console.error('FAILED UI:',code);throw error;}};win.webContents.on('console-message',(_event,level,message)=>console.log('RENDERER:',typeof level==='object'?level.message:message));
 await wait(()=>ui('typeof route==="function"&&!!current()'),'UI ready');
 await c.start(a.id);await c.start(b.id);const aw=c.runtimes.get(a.id).view.webContents,bw=c.runtimes.get(b.id).view.webContents;
 await wait(()=>aw.getTitle()==='Rename fixture'&&bw.getTitle()==='Rename fixture','instance pages');
 await bw.executeJavaScript("document.cookie='rename_session=keep; path=/';localStorage.setItem('rename_session','keep')");
 await ui(`localOpen.add(${JSON.stringify(a.id)});localOpen.add(${JSON.stringify(b.id)});route('browser',${JSON.stringify(a.id)})`);await ui("route('overview')");
 const previousActive=await ui('activeId'),beforeA=JSON.stringify(c.store.get(a.id)),beforeB=JSON.stringify(c.store.get(b.id));
 const row=`tr:has([data-select="${b.id}"])`,rename=`${row} [data-ux="instance-rename"]`;
 async function click(selector){
  await ui(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest'})`);
  await wait(()=>ui(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;const r=el.getBoundingClientRect();const hit=document.elementFromPoint(Math.round(r.x+r.width/2),Math.round(r.y+r.height/2));return r.width>0&&r.height>0&&!!hit&&el.contains(hit);})()`),'clickable '+selector);
  const point=await ui(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
  win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
 }
 async function openRowRename(){await click(row+' summary');await wait(()=>ui(`!!document.querySelector(${JSON.stringify(row+' details[open]')})`),'menu open');await click(rename);await wait(()=>ui(`modal?.type==='rename'&&modal.id===${JSON.stringify(b.id)}`),'correct rename dialog');}
 await openRowRename();assert.equal(await ui("document.querySelector('#nameInput').value"),'要改名的实例');assert.equal(await ui('activeId'),previousActive);
 await ui("document.querySelector('#nameInput').value='取消不应保存'");await click('#modal .modal-actions [data-action="modal-close"]');await wait(()=>ui('!modal'),'cancel');
 assert.equal(JSON.stringify(c.store.get(b.id)),beforeB);ok('Row menu opens the targeted instance without changing selection; cancel preserves its name');
 await openRowRename();await ui(`document.querySelector('#nameInput').value=${JSON.stringify(a.name)}`);await click('#modal [data-action="confirm"]');
 await wait(()=>ui("document.querySelector('#nameError').textContent.includes('重复')"),'duplicate rejected');assert.equal(c.store.get(b.id).name,'要改名的实例');
 await ui("document.querySelector('#nameInput').value='   '");await click('#modal [data-action="confirm"]');await wait(()=>ui("document.querySelector('#nameError').textContent.includes('1–40')"),'blank rejected');ok('Duplicate and blank names are rejected without changing data');
 const renamed='日本工作区 <A>';await ui(`document.querySelector('#nameInput').value=${JSON.stringify(renamed)}`);await click('#modal [data-action="confirm"]');await wait(()=>ui('!modal'),'saved');
 assert.equal(c.store.get(b.id).name,renamed);assert.equal(new Store(root).get(b.id).name,renamed);assert.equal(JSON.stringify(c.store.get(a.id)),beforeA);
 assert.deepEqual({...c.store.get(b.id),name:JSON.parse(beforeB).name},JSON.parse(beforeB));
 assert.equal(await ui('view'),'overview');assert.equal(await ui('activeId'),previousActive);
 assert.equal(await ui(`document.querySelector(${JSON.stringify(row+' .cell-name b')}).textContent`),renamed);
 assert.equal(await ui(`document.querySelector(${JSON.stringify(row+' .cell-name b')}).children.length`),0);ok('Confirm persists only the target name, escapes HTML, and stays in instance management');
 assert.equal(c.runtimes.get(a.id).view.webContents,aw);assert.equal(c.runtimes.get(b.id).view.webContents,bw);
 assert.equal(c.runtimes.get(a.id).status,'running');assert.equal(c.runtimes.get(b.id).status,'running');
 assert(await bw.executeJavaScript("document.cookie.includes('rename_session=keep')&&localStorage.getItem('rename_session')==='keep'"));ok('Renaming preserves running views, login storage, network and environment');
 await c.stop(b.id);await wait(()=>ui(`state.instances.find(i=>i.id===${JSON.stringify(b.id)}).status==='stopped'`),'stopped snapshot');await openRowRename();await ui("document.querySelector('#nameInput').value='停止的实例新名称'");await click('#modal [data-action="confirm"]');await wait(()=>ui('!modal'),'stopped rename');assert.equal(c.runtimes.get(b.id).status,'stopped');assert.equal(c.store.get(b.id).name,'停止的实例新名称');ok('Stopped instances can be renamed without being started');
 await click('.instance-rename');await wait(()=>ui(`modal?.type==='rename'&&modal.id===${JSON.stringify(a.id)}`),'sidebar rename');await click('#modal .modal-actions [data-action="modal-close"]');ok('Existing sidebar pencil continues to target the current instance');
}catch(error){errors.push(error.stack||String(error));console.error(error);}finally{
 try{await c?.closeAll();}catch(error){errors.push(error.message);}win?.destroy();server?.closeAllConnections();if(server)await new Promise(r=>server.close(r));
 console.log(JSON.stringify({platform:process.platform,passed:results.length,results,errors},null,2));app.exit(errors.length?1:0);
}});
