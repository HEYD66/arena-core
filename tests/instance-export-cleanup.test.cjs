'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Store,atomic}=require('../src/main/store.cjs'),journal=require('../src/main/deletion-journal.cjs'),{deleteExportedInstances}=require('../src/main/instance-export-cleanup.cjs');
test('offline export cleanup removes exactly selected profiles and bindings, keeps shared plugins and unselected data',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facet-export-cleanup-'));try{
  const store=new Store(dir),rows=['first','second','keep'].map(n=>store.create(n));
  for(const row of rows){const profile=path.join(dir,'Partitions','arena-core-'+row.id);fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'website'),'fixture');fs.mkdirSync(path.join(dir,'instance-import-cookies'),{recursive:true});fs.writeFileSync(path.join(dir,'instance-import-cookies',row.id+'.bin'),'fixture');store.saveNodes(row.id,[],null);}
  atomic(path.join(dir,'extensions.json'),{items:[],enabled:Object.fromEntries(rows.map(r=>[r.id,['ext-fixture']]))});const shared=path.join(dir,'extensions-packages','shared');fs.mkdirSync(shared,{recursive:true});fs.writeFileSync(path.join(shared,'plugin'),'fixture');
  const result=deleteExportedInstances(dir,rows.slice(0,2),structuredClone(rows));assert.equal(result.deleted,2);assert.equal(result.deleteFailed,0);assert.equal(result.cleanupPending,0);
  assert.deepEqual(new Store(dir).list().map(x=>x.id),[rows[2].id]);for(const row of rows.slice(0,2)){assert(!fs.existsSync(path.join(dir,'Partitions','arena-core-'+row.id)));assert(!fs.existsSync(path.join(dir,'proxy-sources',row.id+'.json')));assert(!fs.existsSync(path.join(dir,'instance-import-cookies',row.id+'.bin')));}
  assert(fs.existsSync(path.join(dir,'Partitions','arena-core-'+rows[2].id,'website')));assert(fs.existsSync(path.join(shared,'plugin')));assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(dir,'extensions.json'))).enabled),[rows[2].id]);assert.equal(journal.list(dir).length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('changed original instance is retained and interrupted metadata deletion can finish without deleting another instance',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facet-export-recovery-'));try{
  const store=new Store(dir),a=store.create('changed'),b=store.create('interrupted'),keep=store.create('keep'),original=structuredClone(store.list());store.update(a.id,{notes:'changed after export'});
  for(const row of [a,b,keep]){const folder=path.join(dir,'Partitions','arena-core-'+row.id);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'website'),'fixture');}
  journal.begin(dir,b.id);store.remove(b.id);
  const result=deleteExportedInstances(dir,[a,b],original);assert.equal(result.deleteFailed,1);assert.equal(result.deleted,1);assert(fs.existsSync(path.join(dir,'Partitions','arena-core-'+a.id)));assert(!fs.existsSync(path.join(dir,'Partitions','arena-core-'+b.id)));assert(fs.existsSync(path.join(dir,'Partitions','arena-core-'+keep.id)));assert.equal(new Store(dir).get(a.id).notes,'changed after export');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
