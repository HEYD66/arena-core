'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {Store}=require('../src/main/store.cjs');
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facet-safety-'));
 const store=new Store(dir),x=store.create('Safety');store.saveNodes(x.id,[{name:'local',type:'http',server:'127.0.0.1',port:12345}],null);
 const calls=[],ses={closeAllConnections:async()=>calls.push('connections'),clearStorageData:async()=>calls.push('storage'),clearCache:async()=>calls.push('cache')};
 const filename=path.resolve(__dirname,'../src/main/controller.cjs'),realRequire=require('node:module').createRequire(filename),module={exports:{}};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,require:n=>n==='electron'?{session:{fromPartition:()=>{calls.push('session');return ses;}}}:realRequire(n),__dirname:path.dirname(filename),setTimeout,clearTimeout,setImmediate});
 const c=Object.create(module.exports.Controller.prototype);
 Object.assign(c,{dir,store,queues:new Map(),runtimes:new Map(),logs:new Map(),activeId:null,stopInner:async()=>calls.push('stop'),emit(){},workspace:{log:()=>calls.push('warning')},extensions:{catalog:{forget:()=>calls.push('extensions')}}});
 return {c,store,x,calls,ses,dir,clean:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('metadata write failure preserves node bytes and never clears session data',async()=>{
 const f=fixture(),file=f.store.proxyFile(f.x.id),before=fs.readFileSync(file),metadata=fs.readFileSync(f.store.file);
 try{f.store.commit=()=>{throw Error('injected disk failure');};await assert.rejects(f.c.remove(f.x.id),/disk failure/);assert.deepEqual(fs.readFileSync(file),before);assert.deepEqual(fs.readFileSync(f.store.file),metadata);assert(new Store(f.dir).get(f.x.id));assert(!f.calls.includes('storage'));assert(!f.calls.includes('cache'));assert(!f.calls.includes('extensions'));}finally{f.clean();}
});
test('post-commit cleanup failure is reported explicitly and restart cleanup removes residual nodes',async()=>{
 const f=fixture(),file=f.store.proxyFile(f.x.id);
 try{f.ses.clearStorageData=async()=>{throw Error('injected session failure');};await assert.rejects(f.c.remove(f.x.id),/部分数据尚未清理/);assert.equal(new Store(f.dir).list().length,0);assert(f.calls.includes('warning'));assert(!fs.existsSync(file));const {cleanOrphans}=require('../src/main/cleanup.cjs');fs.writeFileSync(file,'{}');assert.equal(cleanOrphans(f.dir,[]).failed,0);assert(!fs.existsSync(file));}finally{f.clean();}
});
test('invalid in-memory mode cannot acquire a session or load a page',async()=>{
 const f=fixture();try{f.x.network.mode='mihomO';await assert.rejects(f.c.startInner(f.x.id),/网络配置无效/);assert.deepEqual(f.calls,[]);assert.equal(f.c.runtimes.size,0);}finally{f.clean();}
});
