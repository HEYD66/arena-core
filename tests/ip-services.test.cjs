'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {IPLookup,PROVIDERS,normalize,retryAfter,identity}=require('../src/main/ip-services.cjs');
const body={ip:'203.0.113.9',country_code:'US',country:'United States',timezone:'America/New_York'};
test('all configured providers normalize complete region fields and invalid locale data is rejected',()=>{
 for(const p of PROVIDERS){const raw=p.id==='ipwho'?{...body,timezone:{id:body.timezone},connection:{isp:'Example ISP'}}:p.id==='ipapi'?{...body,country_name:'United States'}:body;const r=normalize(p,raw,true);assert.equal(r.countryCode,'US');assert.equal(r.timezone,body.timezone);assert.equal(r.provider,p.name);}
 for(const patch of [{ip:'bad'},{country_code:'ZZ'},{country_code:''},{timezone:'Bad/Zone'},{error:true},{success:false}])assert.throws(()=>normalize(PROVIDERS[0],{...body,...patch},true));
 assert.equal(normalize(PROVIDERS[0],{ip:body.ip},false).timezone,'');
});
test('Retry-After supports seconds and HTTP dates; node cache identity changes with credentials',()=>{
 const now=Date.UTC(2026,9,7);assert.equal(retryAfter('90',now),90000);assert.equal(retryAfter(new Date(now+120000).toUTCString(),now),120000);assert.equal(retryAfter(null,now),60000);assert.equal(retryAfter('invalid',now),60000);assert.notEqual(identity({server:'example',password:'a'}),identity({server:'example',password:'b'}));
});
test('actual HTTP 429 switches provider, respects cooldown and resumes after Retry-After',async()=>{
 let now=Date.now();const seen=[];const server=http.createServer((req,res)=>{seen.push(req.url);if(req.url==='/first'){res.writeHead(429,{'Retry-After':'120'});res.end('limited');}else res.end(JSON.stringify(body));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const base='http://127.0.0.1:'+server.address().port,client=new IPLookup({providers:[{...PROVIDERS[0],url:base+'/first'},{...PROVIDERS[1],url:base+'/second'}],interval:0,now:()=>now});const run=key=>client.lookup(key,(url,signal)=>fetch(url,{signal}),new AbortController().signal,{force:true,requireLocale:true});assert.equal((await run('one')).provider,'GeoJS');assert.deepEqual(seen,['/first','/second']);await run('two');assert.deepEqual(seen,['/first','/second','/second']);now+=120001;await run('three');assert.deepEqual(seen.slice(-2),['/first','/second']);}finally{await new Promise(r=>server.close(r));}
});
test('cache preserves query time, expires, cannot cross nodes and force failure invalidates it',async()=>{
 let hits=0,now=Date.now(),fail=false;const client=new IPLookup({providers:[PROVIDERS[0]],interval:0,now:()=>now});const signal=new AbortController().signal,request=async()=>{hits++;return new Response(fail?'error':JSON.stringify(body),{status:fail?503:200});};
 const first=await client.lookup('a',request,signal,{requireLocale:true});now+=1000;const cached=await client.lookup('a',request,signal,{requireLocale:true});assert.equal(hits,1);assert(cached.cached);assert.equal(cached.queriedAt,first.queriedAt);await client.lookup('b',request,signal);assert.equal(hits,2);now+=60000;await client.lookup('a',request,signal);assert.equal(hits,3);fail=true;await assert.rejects(client.lookup('a',request,signal,{force:true}));await assert.rejects(client.lookup('a',request,signal));assert.equal(hits,5);
});
test('missing timezone, invalid JSON and service errors continue to the next provider',async()=>{
 const client=new IPLookup({interval:0});const seen=[];const r=await client.lookup('a',async url=>{seen.push(url);return new Response(seen.length===1?JSON.stringify({...body,timezone:''}):seen.length===2?'invalid':seen.length===3?JSON.stringify({error:true}):JSON.stringify({...body,timezone:{id:body.timezone}}));},new AbortController().signal,{requireLocale:true});assert.equal(r.provider,'ipwho.is');assert.equal(seen.length,4);
});
test('all failures produce provider-specific safe reasons without response secrets',async()=>{
 const client=new IPLookup({interval:0});await assert.rejects(client.lookup('a',async()=>new Response('secret-password',{status:503}),new AbortController().signal),e=>e.safeDiagnostic.includes('IP.SB HTTP 503')&&e.safeDiagnostic.includes('GeoJS HTTP 503')&&!e.safeDiagnostic.includes('secret-password'));
});
test('rate scheduling spaces concurrent requests and cancellation interrupts queued work',async()=>{
 const hits=[],client=new IPLookup({providers:[PROVIDERS[0]],interval:120});const fetcher=async()=>{hits.push(Date.now());return new Response(JSON.stringify(body));};
 await Promise.all(['a','b','c'].map(key=>client.lookup(key,fetcher,new AbortController().signal)));assert(hits[1]-hits[0]>=100);assert(hits[2]-hits[1]>=100);
 const abort=new AbortController(),pending=client.lookup('d',fetcher,abort.signal);abort.abort(Error('cancelled-test'));await assert.rejects(pending,/cancelled-test/);assert.equal(hits.length,3);
});
test('per-provider timeout falls through, abort stops further requests, and cache is bounded',async()=>{
 const client=new IPLookup({interval:0,timeout:20});let hits=0;const result=await client.lookup('a',async(_url,signal)=>{hits++;if(hits===1)await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));return new Response(JSON.stringify(body));},new AbortController().signal);assert.equal(result.provider,'GeoJS');
 const bounded=new IPLookup({providers:[PROVIDERS[0]],interval:0});for(let i=0;i<260;i++)await bounded.lookup(String(i),async()=>new Response(JSON.stringify(body)),new AbortController().signal);assert.equal(bounded.cache.size,256);
});
