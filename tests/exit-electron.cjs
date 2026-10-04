'use strict';
// Real native child dialog, production confirmation/IPC, local fixture, temporary profiles only.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'facet-exit-test-'));app.setPath('userData',root);
const {Controller}=require('../src/main/controller.cjs'),{installIPC}=require('../src/main/ipc.cjs'),{Store}=require('../src/main/store.cjs');
const {confirmExit,readSettings,writeSettings}=require('../src/main/exit-guard.cjs'),{showExitDialog}=require('../src/main/exit-dialog.cjs');
const adapter={showMessageBox:showExitDialog},results=[],errors=[];let win,c,server,dispose;
const wait=async(fn,label)=>{for(let i=0;i<250;i++){if(await fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('Timeout: '+label);};
const ok=name=>{results.push(name);console.log('PASS '+name);};
const exec=(w,code)=>w.webContents.executeJavaScript(code);
async function click(w,selector){const point=await exec(w,`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);if(!e.contains(document.elementFromPoint(x,y)))throw Error('Obscured click');return {x,y};})()`);w.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});w.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});}
function key(w,keyCode){w.webContents.sendInputEvent({type:'keyDown',keyCode});if(keyCode==='Return')w.webContents.sendInputEvent({type:'char',keyCode:'\r'});w.webContents.sendInputEvent({type:'keyUp',keyCode});}
async function open(){const result=confirmExit(c,win,adapter,root);let child;await wait(()=>{child=win.getChildWindows().find(x=>x.isModal());return child?.isVisible();},'visible modal');return {child,result};}
setTimeout(()=>{console.error('Exit test timed out');app.exit(2);},90000).unref();
app.whenReady().then(async()=>{try{
 server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Exit fixture</title><body>Fixture</body>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
 win=new BrowserWindow({width:1440,height:960,show:true,webPreferences:{preload:path.join(__dirname,'../src/main/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 c=new Controller(win,root,path.join(__dirname,'../resources/mihomo',process.platform==='win32'?'mihomo.exe':'mihomo'));dispose=installIPC(win,c);
 const a=c.store.list()[0],b=c.store.create('测试 <img src=x onerror=alert(1)>');c.store.update(a.id,{url});c.store.update(b.id,{url});
 await win.loadFile(path.join(__dirname,'../src/renderer/index.html'));await wait(()=>exec(win,'typeof route==="function"&&!!current()'),'UI ready');
 await c.start(a.id);await c.start(b.id);const aw=c.runtimes.get(a.id).view.webContents,bw=c.runtimes.get(b.id).view.webContents;
 await wait(()=>aw.getTitle()==='Exit fixture'&&bw.getTitle()==='Exit fixture','local instances');
 await bw.executeJavaScript("document.cookie='exit_session=keep; path=/; max-age=86400';localStorage.setItem('exit_session','keep')");
 await exec(win,"document.documentElement.dataset.theme='light';document.documentElement.dataset.lightPalette='solar';route('grid')");
 const before=JSON.stringify(c.store.list()),listeners=ipcMain.listenerCount('facet:exit-answer');
 let {child,result}=await open();assert(child.isModal());assert.equal(child.getParentWindow(),win);assert.equal(win.isEnabled(),false);
 assert.equal(await exec(child,'document.activeElement.id'),'cancel');assert.equal(await exec(child,"document.querySelector('#exit-names img')"),null);
 assert.equal(await exec(child,"document.documentElement.dataset.lightPalette"),'solar');assert.equal(await exec(child,"getComputedStyle(document.body).backgroundColor"),'rgb(255, 251, 239)');
 assert.equal(await exec(child,"typeof window.arenaCore"),'undefined');assert.equal(await exec(child,"typeof require"),'undefined');
 assert.equal(await exec(child,'document.documentElement.scrollHeight<=innerHeight'),true);
 fs.writeFileSync(path.join(root,'exit-light.png'),(await child.webContents.capturePage()).toPNG());
 await click(child,'#remember');await click(child,'#cancel');assert.equal(await result,false);assert.deepEqual(readSettings(root),{});assert(win.isEnabled());
 assert.equal(JSON.stringify(c.store.list()),before);assert.equal(c.runtimes.get(a.id).view.webContents,aw);assert.equal(c.runtimes.get(b.id).view.webContents,bw);assert.equal(c.runtimes.get(b.id).status,'running');
 assert(await bw.executeJavaScript("document.cookie.includes('exit_session=keep')&&localStorage.getItem('exit_session')==='keep'"));ok('Themed native modal stays above the grid; cancel preserves instances, storage, settings and focus safety');
 ({child,result}=await open());key(child,'Escape');assert.equal(await result,false);ok('Escape cancels without quitting');
 ({child,result}=await open());await click(child,'#dismiss');assert.equal(await result,false);
 ({child,result}=await open());child.close();assert.equal(await result,false);ok('Close icon and native window close both cancel');
 await exec(win,"document.documentElement.dataset.theme='dark';document.documentElement.dataset.darkPalette='gold'");
 ({child,result}=await open());assert.equal(await exec(child,"getComputedStyle(document.body).backgroundColor"),'rgb(33, 31, 29)');
 fs.writeFileSync(path.join(root,'exit-dark.png'),(await child.webContents.capturePage()).toPNG());
 ipcMain.emit('facet:exit-answer',{sender:win.webContents,senderFrame:win.webContents.mainFrame},{response:1,checkboxChecked:true});
 ipcMain.emit('facet:exit-answer',{sender:child.webContents,senderFrame:{}},{response:1});
 ipcMain.emit('facet:exit-answer',{sender:child.webContents,senderFrame:child.webContents.mainFrame},{response:'1'});
 assert(!child.isDestroyed());await click(child,'#cancel');assert.equal(await result,false);assert.deepEqual(readSettings(root),{});ok('Dark palette follows the shell; foreign senders, subframes and malformed consent cannot confirm');
 const opts={message:'有 12 个实例正在运行，退出会全部停止',detail:Array.from({length:6},(_,i)=>'长名字工作区'+i+'测试').join('、')+' 等 12 个\n保留资料'};
 const p1=showExitDialog(win,opts),p2=showExitDialog(win,opts);assert.equal(p1,p2);await wait(()=>{child=win.getChildWindows().find(x=>x.isModal());return child?.isVisible();},'deduplicated modal');assert.equal(win.getChildWindows().filter(x=>x.isModal()).length,1);
 assert.equal(await exec(child,"document.getElementById('confirm').getBoundingClientRect().bottom<=innerHeight"),true);await click(child,'#cancel');assert.equal((await p1).response,0);ok('Repeated close requests share one dialog; long instance names keep actions visible');
 ({child,result}=await open());key(child,'Return');assert.equal(await result,false);ok('Enter on the default focused button cancels');
 ({child,result}=await open());await click(child,'#confirm');assert.equal(await result,true);assert.deepEqual(readSettings(root),{});assert.equal(c.runtimes.get(b.id).status,'running');ok('Explicit confirm returns consent without changing preferences or deleting data');
 ({child,result}=await open());await click(child,'#remember');await click(child,'#confirm');assert.equal(await result,true);assert.equal(readSettings(root).confirmExit,false);
 assert.equal(await confirmExit(c,win,adapter,root),true);assert.equal(win.getChildWindows().filter(x=>x.isModal()).length,0);ok('Do-not-ask persists only after confirming and suppresses the next prompt');
 await c.closeAll();assert.equal(JSON.stringify(new Store(root).list()),before);assert.equal(ipcMain.listenerCount('facet:exit-answer'),listeners);ok('Confirmed shutdown completes, configuration persists and dialog listeners are cleaned up');
 writeSettings(root,{confirmExit:true});const stopped={store:c.store,runtimes:new Map()};assert.equal(await confirmExit(stopped,win,adapter,root),true);assert.equal(win.getChildWindows().filter(x=>x.isModal()).length,0);ok('No running instances exits without prompting');
 const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await w.loadURL('data:text/html,ready');const p=showExitDialog(w,opts);w.destroy();assert.equal((await p).response,0);assert.equal(ipcMain.listenerCount('facet:exit-answer'),listeners);ok('Parent destruction cancels safely and cleans up pending confirmation');
 console.log('SCREENSHOT_DIR '+root);
}catch(error){errors.push(error.stack||String(error));console.error(error);}finally{
 try{await c?.closeAll();}catch(error){errors.push(error.message);}dispose?.();win?.destroy();server?.closeAllConnections();if(server)await new Promise(r=>server.close(r));
 console.log(JSON.stringify({platform:process.platform,passed:results.length,results,errors},null,2));app.exit(errors.length?1:0);
}});
