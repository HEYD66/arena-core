'use strict';
// Synthetic website data only; never attaches to a user's browser or profile.
exports.write=`(async()=>{
 localStorage.setItem('marker','fixture-'+location.search);localStorage.setItem('large','L'.repeat(512*1024));
 await new Promise((resolve,reject)=>{const q=indexedDB.open('probe',1);q.onupgradeneeded=()=>q.result.createObjectStore('records');q.onerror=()=>reject(Error('open'));q.onsuccess=()=>{const db=q.result,t=db.transaction('records','readwrite'),s=t.objectStore('records');for(let i=0;i<64;i++)s.put({i,text:'D'.repeat(32768)},i);s.put(new Blob(['B'.repeat(256*1024)]),'blob');t.oncomplete=()=>{db.close();resolve()};t.onerror=()=>reject(Error('write'))}});
 const cache=await caches.open('probe-cache');await cache.put('/probe-resource',new Response('C'.repeat(1024*1024)));
 const dir=await navigator.storage.getDirectory(),f=await dir.getFileHandle('probe.bin',{create:true}),out=await f.createWritable();await out.write('O'.repeat(1024*1024));await out.close();
 document.cookie='probeSession=synthetic-session; path=/';return true;
})()`;
exports.read=`(async()=>{
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('probe');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(Error('db-open'))});
 const records=await new Promise((resolve,reject)=>{try{const t=db.transaction('records'),q=t.objectStore('records').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(Error('db-read'))}catch(e){reject(e)}});db.close();
 const rows=records.filter(x=>!(x instanceof Blob)),blob=records.find(x=>x instanceof Blob),cache=await(await caches.open('probe-cache')).match('/probe-resource');
 const dir=await navigator.storage.getDirectory(),file=await(await dir.getFileHandle('probe.bin')).getFile();
 return {marker:localStorage.getItem('marker'),localLength:localStorage.getItem('large')?.length,rows:rows.length,rowsValid:rows.every((x,i)=>x.i===i&&x.text==='D'.repeat(32768)),blobValid:blob&&(await blob.text())==='B'.repeat(256*1024),cacheValid:cache&&(await cache.text())==='C'.repeat(1024*1024),opfsValid:(await file.text())==='O'.repeat(1024*1024),session:document.cookie.includes('probeSession=synthetic-session'),login:(await(await fetch('/login')).text())==='authenticated'};
})()`;
