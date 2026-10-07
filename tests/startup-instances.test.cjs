'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../src/main/store.cjs'),{startOnLaunch}=require('../src/main/startup-instances.cjs');
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facet-startup-unit-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,store:new Store(dir)};}
test('startup flags default off, persist independently, and reject non-booleans without writing',t=>{
 const {dir,store}=setup(t),a=store.create('A'),b=store.create('B');assert.equal(a.autoStart,false);store.update(a.id,{autoStart:true});assert.equal(new Store(dir).get(a.id).autoStart,true);assert.equal(new Store(dir).get(b.id).autoStart,false);
 const before=fs.readFileSync(store.file);for(const value of [null,'true',1,{},[]])assert.throws(()=>store.update(a.id,{autoStart:value}));assert.deepEqual(fs.readFileSync(store.file),before);
 const legacy=JSON.parse(before);delete legacy.instances[0].autoStart;fs.writeFileSync(store.file,JSON.stringify(legacy));assert.equal(new Store(dir).get(a.id).autoStart,false);
 legacy.instances[0].autoStart='true';fs.writeFileSync(store.file,JSON.stringify(legacy));assert.throws(()=>new Store(dir),/布尔值/);
});
test('launch scheduler has no fixed profile cap, runs serially, continues failures and is called once',async t=>{
 const {store}=setup(t),ids=[];for(let i=0;i<137;i++){const x=store.create('A'+i);store.update(x.id,{autoStart:true});ids.push(x.id);}store.create('Disabled');let active=0,peak=0;const calls=[];
 const c={store,workspace:{log(){}},log(){},async start(id,options){assert.equal(options.autoStart,true);calls.push(id);peak=Math.max(peak,++active);await new Promise(r=>setImmediate(r));active--;if(id===ids[12])throw Error('startup failed');return true;}};
 const work=startOnLaunch(c);assert.equal(startOnLaunch(c),work);const result=await work;assert.deepEqual(calls,ids);assert.equal(peak,1);assert.equal(result.results.filter(x=>x.status==='failed').length,1);assert.equal(result.results.filter(x=>x.status==='started').length,136);assert.equal(startOnLaunch(c),work);
});
test('launch scheduler stops when exiting and leaves remaining enabled flags intact',async t=>{
 const {store}=setup(t),ids=[];for(let i=0;i<3;i++){const x=store.create('A'+i);store.update(x.id,{autoStart:true});ids.push(x.id);}const calls=[];
 const c={store,workspace:{log(){}},log(){},async start(id){calls.push(id);c.disposing=true;return true;}};const result=await startOnLaunch(c);assert.deepEqual(calls,[ids[0]]);assert.equal(result.cancelled,true);assert(store.list().every(x=>x.autoStart===true));
});
test('recovered configuration skips automatic startup for this launch',async t=>{
 const {store}=setup(t);const x=store.create('A');store.update(x.id,{autoStart:true});store.recovered=true;let called=false;
 const result=await startOnLaunch({store,workspace:{log(){}},start(){called=true;}});assert.equal(result.skippedRecovery,true);assert.equal(called,false);assert.equal(store.get(x.id).autoStart,true);
});
