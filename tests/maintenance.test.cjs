'use strict';
// 检测统计持久化、已删除实例残留清理、退出确认偏好、节点文件缓存、日志合并写盘、并发上限。
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DiagnosticHistory}=require('../src/main/diagnostic-history.cjs'),{orphans,cleanOrphans,cleanInstance}=require('../src/main/cleanup.cjs');
const {readSettings,writeSettings,busyInstances,confirmExit}=require('../src/main/exit-guard.cjs'),{Store}=require('../src/main/store.cjs'),{Workspace}=require('../src/main/workspace.cjs');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'arena-maint-'));
const A='11111111-2222-4333-8444-555555555555',B='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',C='01234567-89ab-4cde-8f01-23456789abcd';
test('diagnostic history counts success/total per node, keeps last and last successful results, and persists',()=>{
 const dir=tmp(),h=new DiagnosticHistory(dir);const base={sourceId:'s1',name:'香港 01',at:'2026-09-28T01:00:00.000Z'};
 assert.equal(h.record({...base,kind:'latency',ok:true,latencyMs:120,provider:'gstatic'}),true);
 assert.equal(h.record({...base,kind:'latency',ok:false,error:'连接超时',at:'2026-09-28T02:00:00.000Z'}),true);
 assert.equal(h.record({...base,kind:'latency',ok:false,error:'已取消'}),false);
 assert.equal(h.record({...base,kind:'latency',ok:false,error:'节点源已更新，请重新检测'}),false);
 assert.equal(h.record({...base,kind:'speed',ok:true,mbps:9}),false);
 h.record({...base,kind:'ip',ok:true,ip:'203.0.113.9',country:'HK',city:'Hong Kong',timezone:'Asia/Hong_Kong'});
 const row=h.list()[0];assert.equal(h.list().length,1);assert.deepEqual([row.latency.ok,row.latency.total,row.ip.ok,row.ip.total],[1,2,1,1]);
 assert.equal(row.latency.lastOk.latencyMs,120);assert.equal(row.latency.last.error,'连接超时');assert.equal(row.ip.lastOk.ip,'203.0.113.9');
 assert.equal(fs.existsSync(path.join(dir,'diagnostic-history.json')),false,'writes are coalesced');h.flush();
 const again=new DiagnosticHistory(dir);assert.deepEqual(again.list(),h.list());
 again.record({...base,sourceId:'s2',kind:'latency',ok:true,latencyMs:80});assert.equal(again.clear('s1'),1);assert.deepEqual(again.list().map(r=>r.sourceId),['s2']);again.flush();
 assert.deepEqual(new DiagnosticHistory(dir).list().map(r=>r.sourceId),['s2']);
 fs.writeFileSync(path.join(dir,'diagnostic-history.json'),'{broken');assert.deepEqual(new DiagnosticHistory(dir).list(),[]);
});
test('orphan cleanup removes only leftovers of deleted instances and never the control partition',()=>{
 const dir=tmp(),mk=(...p)=>fs.mkdirSync(path.join(dir,...p),{recursive:true});
 mk('Partitions','arena-core-'+A,'Local Storage');mk('Partitions','arena-core-'+B,'Cache');mk('Partitions','arena-core-controls');mk('Partitions','arena-core-diagnostics-0');mk('Partitions','arena-core-'+B.toUpperCase());mk('Partitions','other');
 mk('core-runtime',A);mk('core-runtime',B);mk('proxy-sources');fs.writeFileSync(path.join(dir,'proxy-sources',A+'.json'),'{}');fs.writeFileSync(path.join(dir,'proxy-sources',B+'.json'),'{}');mk('diagnostic-runtime',C);
 const found=orphans(dir,[A]).map(p=>path.relative(dir,p).split(path.sep).join('/')).sort();
 assert.deepEqual(found,['Partitions/arena-core-'+B,'core-runtime/'+B,'diagnostic-runtime/'+C,'proxy-sources/'+B+'.json'].sort());
 assert.deepEqual(cleanOrphans(dir,[A]),{removed:4,failed:0});
 for(const keep of ['Partitions/arena-core-'+A,'Partitions/arena-core-controls','Partitions/arena-core-diagnostics-0','Partitions/other','core-runtime/'+A,'proxy-sources/'+A+'.json'])assert(fs.existsSync(path.join(dir,keep)),keep);
 assert.deepEqual(orphans(dir,[A]),[]);assert.deepEqual(orphans(path.join(dir,'missing'),[]),[]);
 mk('core-runtime',A);assert.equal(cleanInstance(dir,A),true);assert.equal(fs.existsSync(path.join(dir,'core-runtime',A)),false);assert.equal(fs.existsSync(path.join(dir,'Partitions','arena-core-'+A)),true,'live browser data waits for next start');assert.deepEqual(orphans(dir,[]).filter(p=>p.includes('Partitions')).map(p=>path.basename(p)),['arena-core-'+A]);
 assert.equal(cleanInstance(dir,'../Partitions'),false);assert.equal(cleanInstance(null,A),false);
});
test('exit confirmation asks only while instances run and remembers "do not ask again"',async()=>{
 const dir=tmp(),status=new Map([['a','running'],['b','stopped'],['c','starting']]);
 const ctl={store:{list:()=>[{id:'a',name:'甲'},{id:'b',name:'乙'},{id:'c',name:'丙'}]},runtimes:{get:id=>({status:status.get(id)})}};
 assert.deepEqual(busyInstances(ctl),['甲','丙']);assert.deepEqual(readSettings(dir),{});
 const asked=[];const dialog=answer=>({showMessageBox:async(_w,o)=>{asked.push(o);return answer;}});
 assert.equal(await confirmExit(ctl,null,dialog({response:0,checkboxChecked:true}),dir),false);assert.deepEqual(readSettings(dir),{},'cancel never stores the checkbox');
 assert.match(asked[0].message,/2 个实例/);assert.deepEqual(asked[0].buttons,['取消','退出']);assert.equal(asked[0].checkboxLabel,'不再提示');
 assert.equal(await confirmExit(ctl,null,dialog({response:1,checkboxChecked:false}),dir),true);assert.deepEqual(readSettings(dir),{});
 assert.equal(await confirmExit(ctl,null,dialog({response:1,checkboxChecked:true}),dir),true);assert.equal(readSettings(dir).confirmExit,false);
 assert.equal(await confirmExit(ctl,null,dialog({response:0}),dir),true);assert.equal(asked.length,3,'no prompt after opting out');
 const idle={...ctl,runtimes:{get:()=>({status:'stopped'})}};const d2=tmp();assert.equal(await confirmExit(idle,null,dialog({response:0}),d2),true);assert.equal(asked.length,3);
 writeSettings(d2,{other:1});fs.writeFileSync(path.join(d2,'app-settings.json'),'[1]');assert.deepEqual(readSettings(d2),{});
});
test('node source reads are cached and invalidated by saves and external changes',()=>{
 const dir=tmp(),store=new Store(dir),id=(store.list()[0]||store.create('缓存测试')).id;assert.deepEqual(store.nodes(id),[]);
 store.saveNodes(id,[{name:'n1',type:'ss',server:'a.example',port:1}],null);const first=store.source(id);assert.equal(store.source(id),first,'second read comes from cache');
 store.saveNodes(id,[{name:'n2',type:'ss',server:'b.example',port:2}],null);assert.deepEqual(store.nodes(id).map(n=>n.name),['n2']);
 fs.writeFileSync(store.proxyFile(id),JSON.stringify({version:1,nodes:[{name:'external-longer-name',type:'ss',server:'c.example',port:3}],subscription:null}));assert.deepEqual(store.nodes(id).map(n=>n.name),['external-longer-name']);
 fs.rmSync(store.proxyFile(id));assert.deepEqual(store.nodes(id),[]);
});
test('global log writes are coalesced and flushed on demand',async()=>{
 const dir=tmp(),w=new Workspace(dir);w.log('application','一');w.log('application','二');
 const disk=()=>{try{return JSON.parse(fs.readFileSync(w.logFile,'utf8'));}catch{return null;}};const before=disk();
 assert(!before||!before.some?.(r=>r.text==='二'),'not written synchronously');await new Promise(r=>setTimeout(r,500));
 assert.equal(new Workspace(dir).events[0].text,'二','debounced write lands');w.log('application','三');w.flush();assert.equal(new Workspace(dir).events[0].text,'三');
});
test('batch diagnostics accept up to 16 parallel workers',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/main/diagnostics.cjs'),'utf8'),ui=fs.readFileSync(path.join(__dirname,'../src/renderer/library.js'),'utf8'),habits=fs.readFileSync(path.join(__dirname,'../src/renderer/ux-habits.js'),'utf8');
 assert(src.includes('count>16')&&src.includes('并发数须为1–16'));assert(ui.includes('[1, 2, 3, 4, 5, 6, 8, 10, 12, 16]'));assert(habits.includes('[1,2,3,4,5,6,8,10,12,16]'));
});
