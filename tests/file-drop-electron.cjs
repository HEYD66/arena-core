'use strict';
// 拖入文件上传：网页能收到拖入的文件，并能通过 FileSystemHandle.getFile() 读取（react-dropzone 等上传组件的做法）；写入权限仍被拒绝。
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'arena-file-drop-'));app.setPath('userData',root);app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');if(process.platform==='linux')app.commandLine.appendSwitch('disable-gpu');
const {Controller}=require('../src/main/controller.cjs'),{installIPC}=require('../src/main/ipc.cjs');
let win,c,server;const results=[],errors=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(fn,label,n=200)=>{for(let i=0;i<n;i++){if(await fn())return;await sleep(50);}throw Error('Timeout '+label);};const ok=name=>{results.push(name);console.log('PASS '+name);};setTimeout(()=>app.exit(2),90000).unref();
const page=`<!doctype html><title>drop</title><body style="margin:0;height:100vh"><script>window.events=[];for(const t of ['dragenter','dragover','drop'])document.addEventListener(t,e=>{e.preventDefault();window.events.push(t);if(t!=='drop')return;window.files=[...e.dataTransfer.files].map(f=>f.name+'/'+f.size);const item=e.dataTransfer.items[0];window.handle=item.getAsFileSystemHandle().then(async h=>{const f=await h.getFile();const read=f.name+'/'+(await f.text());let write='allowed';try{await h.createWritable();}catch(err){write=err.name;}return {read,write};}).catch(err=>({error:err.name+': '+err.message}));});</script></body>`;
app.whenReady().then(async()=>{try{
 server=http.createServer((_q,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
 const file=path.join(root,'上传测试.txt');fs.writeFileSync(file,'hello facet');
 win=new BrowserWindow({width:1280,height:860,show:true,webPreferences:{preload:path.join(__dirname,'../src/main/preload.cjs'),sandbox:true,contextIsolation:true}});
 c=new Controller(win,root,path.join(__dirname,'../resources/mihomo',process.platform==='win32'?'mihomo.exe':'mihomo'));installIPC(win,c);
 const a=c.store.list()[0]||c.store.create('拖放');c.store.update(a.id,{url,environment:{...c.store.get(a.id).environment,fingerprint:{...c.store.get(a.id).environment.fingerprint,enabled:true}}});
 await win.loadFile(path.join(__dirname,'../src/renderer/index.html'));const ui=code=>win.webContents.executeJavaScript(code);await wait(()=>ui('typeof current==="function"&&!!current()'),'initialize');
 await c.start(a.id);await ui(`localOpen.add(${JSON.stringify(a.id)});route('browser',${JSON.stringify(a.id)})`);const wc=c.runtimes.get(a.id).view.webContents;await wait(()=>wc.getURL()===url&&!wc.isLoading(),'page loaded');await sleep(300);
 const data={items:[],files:[file],dragOperationsMask:1};for(const type of ['dragEnter','dragOver','drop']){await wc.debugger.sendCommand('Input.dispatchDragEvent',{type,x:200,y:200,data});await sleep(80);}
 await wait(()=>wc.executeJavaScript('!!window.handle'),'drop handled');
 assert.deepEqual(await wc.executeJavaScript('window.files'),['上传测试.txt/11']);ok('A file dragged into the page arrives in the drop event');
 const h=await wc.executeJavaScript('window.handle');assert.equal(h.error,undefined,h.error);assert.equal(h.read,'上传测试.txt/hello facet');assert.equal(h.write,'NotAllowedError');
 ok('Upload widgets can read the dropped file through its handle; writing stays blocked');
}catch(e){errors.push(e.stack||String(e));console.error(e);}finally{try{await c?.closeAll();}catch(e){errors.push(e.message);}win?.destroy();server?.close();const report={platform:process.platform,electron:process.versions.electron,passed:results.length,results,errors};fs.writeFileSync(path.join(__dirname,`file-drop-${process.platform}.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));app.exit(errors.length?1:0);}});
