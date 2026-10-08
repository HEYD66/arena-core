'use strict';
// Real production Electron UI and native browser views with isolated profiles.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {_electron}=require('playwright'),{Store}=require('../src/main/store.cjs'),runtime=require('../scripts/electron-runtime.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'facet-toast-layout-')),report={root,results:[],errors:[]};let app,ui,server;
const pass=name=>{report.results.push(name);console.log('PASS '+name);};
async function call(action,payload={}){const r=await ui.evaluate(({action,payload})=>window.facet.request(action,payload),{action,payload});assert(r.ok,r.error);return r.value;}
async function geometry(){return ui.evaluate(()=>Object.fromEntries(['.body-grid','#sidebar','#workspaceHead','#content','#browserHost'].map(s=>{const e=document.querySelector(s);if(!e)return[s,null];const r=e.getBoundingClientRect();return[s,{x:r.x,y:r.y,width:r.width,height:r.height}];})));}
async function hide(){await ui.evaluate(()=>{clearTimeout(toastTimer);document.querySelector('#toast').hidden=true;});}
async function main(){
 server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Toast live page</title><input id="entry"><script>window.ticks=0;setInterval(()=>window.ticks++,100);</script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}/`,store=new Store(root),instance=store.create('通知验证');store.update(instance.id,{url});fs.writeFileSync(path.join(root,'app-settings.json'),JSON.stringify({confirmExit:false}));
 const env=runtime.childEnvironment(),executable=runtime.resolveRuntime({executable:require('electron'),version:require('electron/package.json').version,env});
 app=await _electron.launch({executablePath:executable,args:[path.resolve(__dirname,'..'),'--user-data-dir='+root],env,timeout:40000});ui=await app.firstWindow();await ui.waitForFunction(()=>typeof toast==='function'&&state.instances.length===1);
 await ui.evaluate(()=>route('global-logs'));await hide();
 for(const width of [1800,1024]){
  await ui.setViewportSize({width,height:900});await hide();const before=await geometry();
  await ui.evaluate(()=>toast('诊断包保存失败，请检查保存位置和磁盘空间后重试'));
  assert.deepEqual(await geometry(),before);const box=await ui.locator('#toast').boundingBox();assert(box&&box.x>=0&&box.x+box.width<=width&&box.height<=40);
  await ui.screenshot({path:path.join(root,`toast-${width}.png`)});await hide();assert.deepEqual(await geometry(),before);
 }
 pass('Toast show and hide leave workspace, sidebar and log layout unchanged at 1800 and 1024 widths');
 await ui.evaluate(()=>toast('长错误提示：'+('需要检查节点网络。'.repeat(100))));assert((await ui.locator('#toast').textContent()).includes('需要检查节点网络。'));assert((await ui.locator('#toast').boundingBox()).height<=40);assert(await ui.locator('#toast').evaluate(e=>e.scrollHeight>e.clientHeight&&e.querySelector('span').getBoundingClientRect().top>=e.getBoundingClientRect().top));await hide();pass('Long messages stay in a bounded scrollable overlay with escaped full text retained');
 await call('start',{id:instance.id});await ui.evaluate(id=>route('browser',id),instance.id);await ui.waitForFunction(()=>!!document.querySelector('#browserHost'));
 const pages=app.context().pages();let webpage=pages.find(p=>p.url()===url);for(let i=0;!webpage&&i<100;i++){await new Promise(r=>setTimeout(r,50));webpage=app.context().pages().find(p=>p.url()===url);}assert(webpage);await webpage.waitForFunction(()=>typeof window.ticks==='number');
 await hide();const before=await geometry(),viewport=await webpage.evaluate(()=>({width:innerWidth,height:innerHeight}));
 await ui.evaluate(()=>toast('通知不会改变页面视口'));
 assert.deepEqual(await geometry(),before);assert.deepEqual(await webpage.evaluate(()=>({width:innerWidth,height:innerHeight})),viewport);const box=await ui.locator('#toast').boundingBox();assert(box.y+box.height<=before['#browserHost'].y);
 await ui.waitForFunction(()=>document.querySelector('#toast').hidden,{timeout:8000});assert.deepEqual(await geometry(),before);
 await webpage.locator('#entry').fill('仍可正常输入');assert.equal(await webpage.locator('#entry').inputValue(),'仍可正常输入');pass('Running native webpage keeps its viewport and input; notification stays above it and automatic dismissal leaves page bounds unchanged');
 await ui.evaluate(()=>{gridPrefs.mode='live';route('grid');});await ui.waitForFunction(()=>view==='grid'&&!gridInFlight&&!gridFrame);await hide();const gridBefore=await geometry();await ui.evaluate(()=>toast('宫格通知测试'));assert.deepEqual(await geometry(),gridBefore);await ui.screenshot({path:path.join(root,'toast-grid.png')});await hide();pass('Live native grid retains its geometry while notification is visible');
 await call('stop',{id:instance.id});
}
main().catch(e=>{report.errors.push(String(e.stack||e));console.error(e.message);}).finally(async()=>{
 try{if(app){const closed=app.waitForEvent('close',{timeout:20000});await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('/src/renderer/index.html')).close());await closed;}}catch(e){report.errors.push(String(e.message));if(app)await app.close();}
 server?.close();fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log('REPORT '+path.join(root,'report.json'));process.exit(report.errors.length?1:0);
});
