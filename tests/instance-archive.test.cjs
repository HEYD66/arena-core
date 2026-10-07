'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {writeArchive,readArchive,safeEntry}=require('../src/main/instance-archive.cjs'),{Store}=require('../src/main/store.cjs');
test('notes preserve whitespace, persist and reject oversize without changing original',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'facet-notes-'));try{const s=new Store(root),x=s.create('备忘录');const text='  提醒\n第二行 <script>\n ';s.update(x.id,{notes:text});assert.equal(new Store(root).get(x.id).notes,text);const before=fs.readFileSync(s.file);assert.throws(()=>s.update(x.id,{notes:'a'.repeat(10001)}));assert.deepEqual(fs.readFileSync(s.file),before);}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('password-free streaming archive roundtrip excludes plugins and detects corruption without changing prior output',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'facet-archive-'));try{
  const profile=path.join(root,'profile');fs.mkdirSync(path.join(profile,'IndexedDB'),{recursive:true});const blob=require('node:crypto').randomBytes(2*1024**2);fs.writeFileSync(path.join(profile,'IndexedDB','binary'),blob);
  for(const name of ['Cookies','Login Data','Extension State','Cache']){fs.mkdirSync(path.join(profile,name==='Cookies'||name==='Login Data'?'Network':name),{recursive:true});fs.writeFileSync(path.join(profile,name==='Cookies'||name==='Login Data'?'Network/'+name:name+'/secret'),'excluded');}
  const file=path.join(root,'backup.facetbackup'),meta={notes:'\n笔记\n',fixture:'website-test-value'};await writeArchive(file,meta,[profile]);assert.equal(fs.readFileSync(file).subarray(0,8).toString(),'FACETB02');
  const unpacked=await readArchive(file,path.join(root,'good'));assert.deepEqual(unpacked.metadata,meta);assert.deepEqual(fs.readFileSync(path.join(unpacked.unpacked,'profiles','0','IndexedDB','binary')),blob);assert(!fs.existsSync(path.join(unpacked.unpacked,'profiles','0','Network','Cookies')));
  const bytes=fs.readFileSync(file);bytes[45]^=1;fs.writeFileSync(path.join(root,'tampered'),bytes);await assert.rejects(readArchive(path.join(root,'tampered'),path.join(root,'bad')),/损坏/);assert(!fs.existsSync(path.join(root,'bad')));
  const prior=fs.readFileSync(file);await assert.rejects(writeArchive(file,{notes:'a'.repeat(16*1024**2)},[profile]));assert.deepEqual(fs.readFileSync(file),prior);
  await writeArchive(file,{...meta,notes:'updated'},[profile]);assert.deepEqual(fs.readFileSync(file+'.bak'),prior);
  for(const name of ['../secret','/absolute','C:/windows','profiles/0/../x','profiles\\0\\x','profiles/0/CON.txt','profiles/0/trailing.'])assert.throws(()=>safeEntry(name));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('valid-checksum archives reject traversal and case collisions and remove extraction staging',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'facet-malformed-'));try{
  const crypto=require('node:crypto'),zlib=require('node:zlib');
  function fixture(names){const chunks=[];for(const name of ['metadata.json',...names]){const data=Buffer.from(name==='metadata.json'?'{}':'fixture'),head=Buffer.from(JSON.stringify({path:name,size:data.length})),length=Buffer.alloc(4);length.writeUInt32BE(head.length);chunks.push(length,head,data);}chunks.push(Buffer.alloc(4));const magic=Buffer.from('FACETB02'),packed=zlib.gzipSync(Buffer.concat(chunks));return Buffer.concat([magic,packed,crypto.createHash('sha256').update(magic).update(packed).digest()]);}
  for(const [index,names] of [['profiles/0/../../escaped'],['profiles/0/Local Storage/data','profiles/0/local storage/DATA']].entries()){
   const file=path.join(root,'bad-'+index),staging=path.join(root,'staging-'+index);fs.writeFileSync(file,fixture(names));await assert.rejects(readArchive(file,staging),/不安全|重复/);assert(!fs.existsSync(staging));assert(!fs.existsSync(path.join(root,'escaped')));
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
