'use strict';
// 实例音量：标签 / 格子 / 放大框的小喇叭打开音量条；按实例缩放网页里视频音频的音量（含跨站子框架、弹出窗口），记住到下次启动；拖到 0 = 静音，静音时拖动取消静音。
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'arena-volume-'));app.setPath('userData',root);app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');if(process.platform==='linux')app.commandLine.appendSwitch('disable-gpu');
const {Controller}=require('../src/main/controller.cjs'),{installIPC}=require('../src/main/ipc.cjs');
let win,c,s1,s2;const results=[],errors=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(fn,label,n=200)=>{let last;for(let i=0;i<n;i++){try{if(last=await fn())return last;}catch{}await sleep(50);}throw Error('Timeout '+label);};const ok=name=>{results.push(name);console.log('PASS '+name);};setTimeout(()=>app.exit(2),150000).unref();
const near=(a,b)=>Math.abs(a-b)<0.01;
app.whenReady().then(async()=>{try{
 s2=http.createServer((q,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>frame</title><video id="v"></video>');});await new Promise(r=>s2.listen(0,'127.0.0.1',r));const frameURL='http://localhost:'+s2.address().port+'/frame';
 s1=http.createServer((q,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(q.url.startsWith('/p')?'<!doctype html><title>popup</title><audio id="v"></audio>':`<!doctype html><title>main</title><video id="v"></video><iframe src="${frameURL}" width="300" height="150"></iframe>`);});await new Promise(r=>s1.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+s1.address().port+'/';
 win=new BrowserWindow({width:1400,height:900,show:true,webPreferences:{preload:path.join(__dirname,'../src/main/preload.cjs'),sandbox:true,contextIsolation:true}});
 c=new Controller(win,root,path.join(__dirname,'../resources/mihomo',process.platform==='win32'?'mihomo.exe':'mihomo'));installIPC(win,c);
 const a=c.store.list()[0]||c.store.create('音量A');c.store.update(a.id,{name:'音量A',url:base});
 await win.loadFile(path.join(__dirname,'../src/renderer/index.html'));const ui=code=>win.webContents.executeJavaScript(code);await wait(()=>ui('typeof current==="function"&&!!current()'),'initialize');
 await c.start(a.id);const A=()=>c.runtimes.get(a.id).view;await ui(`localOpen.add(${JSON.stringify(a.id)});route('browser',${JSON.stringify(a.id)})`);
 const frame=()=>A().webContents.mainFrame.frames.find(f=>f.url.startsWith(frameURL));
 await wait(()=>A().webContents.getURL()===base&&!A().webContents.isLoading()&&frame(),'page + cross-site frame loaded');
 const pageVol=()=>A().webContents.executeJavaScript('document.getElementById("v").volume'),frameVol=()=>frame().executeJavaScript('document.getElementById("v").volume');
 assert.equal(await pageVol(),1);assert.equal(await frameVol(),1);
 // 标签上的喇叭 → 音量条（弹层打开时网页层换成截图，关闭后恢复）。
 assert.ok(await ui(`!!document.querySelector('.tab [data-vol="${a.id}"]')`));await ui(`document.querySelector('.tab [data-vol="${a.id}"]').click()`);await wait(()=>ui(`document.querySelector('#volumePop').open&&view==='browser'`),'popover');await wait(()=>!A().getVisible(),'page hidden under popover');
 const drag=v=>ui(`(()=>{const r=document.querySelector('#volRange');r.value='${v}';r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await drag(40);await wait(async()=>c.store.get(a.id).volume===40&&near(await pageVol(),0.4)&&near(await frameVol(),0.4),'volume 40 applied');assert.equal(await ui(`document.querySelector('#volPct').textContent`),'40%');assert.equal(A().webContents.isAudioMuted(),false);
 ok('Tab speaker opens the volume bar; 40% scales the page video and a cross-site iframe video');
 await A().webContents.executeJavaScript('document.getElementById("v").volume=0.5');await wait(async()=>near(await pageVol(),0.2),'page-set volume rescaled');ok('When the page changes its own volume, the instance volume is applied on top (0.5 × 40%)');
 await drag(0);await wait(async()=>A().webContents.isAudioMuted()&&await ui(`document.querySelector('.tab [data-vol="${a.id}"]').classList.contains('on')&&document.querySelector('#volPct').textContent==='已静音'`),'volume 0 mutes');
 await drag(60);await wait(()=>!A().webContents.isAudioMuted()&&c.store.get(a.id).volume===60,'back to 60');
 await ui(`document.querySelector('#volMute').click()`);await wait(()=>A().webContents.isAudioMuted()&&c.store.get(a.id).muted===true,'mute button');
 await drag(30);await wait(async()=>!A().webContents.isAudioMuted()&&c.store.get(a.id).muted===undefined&&near(await pageVol(),0.15),'drag unmutes');ok('Volume 0 = muted; dragging while muted unmutes; the mute button still toggles');
 await A().webContents.executeJavaScript('{const n=document.createElement("audio");n.id="n";document.body.append(n);}');await drag(50);await wait(async()=>near(await A().webContents.executeJavaScript('document.getElementById("n").volume'),0.5),'new element');ok('Media elements added later follow the volume too');
 await ui(`document.querySelector('#volumePop').close()`);await wait(()=>A().getVisible(),'page back after popover');
 // 弹出窗口：同一实例，同一音量。
 await A().webContents.executeJavaScript(`window.open(${JSON.stringify(base+'p')},'_blank','width=520,height=420');0`,true);const pop=await wait(()=>{const w=[...(c.runtimes.get(a.id).popups||[])][0];return w&&!w.isDestroyed()&&w.webContents.getURL().startsWith(base+'p')&&!w.webContents.isLoading()&&w;},'popup',200);await wait(async()=>near(await pop.webContents.executeJavaScript('document.getElementById("v").volume'),0.5),'popup volume');ok('Popup windows of the instance use the same volume');
 // 记住：重启实例后仍是 50%。
 await c.stop(a.id);await c.start(a.id);await ui(`route('browser',${JSON.stringify(a.id)})`);await wait(()=>A()?.webContents.getURL()===base&&!A().webContents.isLoading()&&frame(),'restarted');await wait(async()=>near(await pageVol(),0.5)&&near(await frameVol(),0.5),'volume after restart');
 const saved=JSON.parse(fs.readFileSync(path.join(root,'instances.json'),'utf8'));assert.equal(saved.instances.find(i=>i.id===a.id).volume,50);ok('Volume is saved per instance and applied again after a restart');
 await ui(`gridPrefs.mode='live';route('grid')`);await wait(()=>ui(`!!document.querySelector('.grid-tile[data-grid-id="${a.id}"] [data-vol]')`),'tile speaker');await ui(`document.querySelector('.grid-tile[data-grid-id="${a.id}"] [data-grid-act="zoom"]').click()`);await wait(()=>ui(`!!document.querySelector('.grid-zoom [data-vol="${a.id}"]')`),'zoom speaker');
 await ui(`document.querySelector('.grid-zoom [data-vol="${a.id}"]').click()`);await wait(()=>ui(`document.querySelector('#volumePop').open&&document.querySelector('#volRange').value==='50'`),'popover from zoom');await ui(`document.querySelector('#volumePop').close()`);await wait(()=>A().getVisible(),'zoom page back');ok('Grid tiles and the zoom dialog have the same speaker / volume bar');
}catch(e){errors.push(e.stack||String(e));console.error(e);}finally{try{await c?.closeAll();}catch(e){errors.push(e.message);}win?.destroy();s1?.close();s2?.close();const report={platform:process.platform,electron:process.versions.electron,passed:results.length,results,errors};fs.writeFileSync(path.join(__dirname,`volume-${process.platform}.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));app.exit(errors.length?1:0);}});
