'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const doh = require('../src/main/subscription-doh.cjs');
const { isFakeIPAddress, isPublicAddress, resolvePublicHost } = require('../src/main/subscription-policy.cjs');
const { downloadSubscription } = require('../src/main/subscription.cjs');
const PUBLIC = [{address:'93.184.216.34',family:4}];
const FAKE = [{address:'198.18.0.42',family:4}];
function systemDns(t, rows=FAKE) { t.mock.method(dns,'lookup',async()=>rows); }
function publicDns(t, result=PUBLIC) {
  const names=[];
  t.mock.method(doh,'queryDohAddresses',async(host,options)=>{names.push(host);assert.deepEqual(Object.keys(options),['signal']);return typeof result==='function'?result(host,options):result;});
  return names;
}
function subscriptionHttp(t, transport=https) {
  const calls=[];
  t.mock.method(transport,'request',(url,options,callback)=>{
    calls.push({url,options});const req=new EventEmitter();req.destroy=()=>{};
    req.end=()=>queueMicrotask(()=>{
      const res=new PassThrough();res.statusCode=200;res.headers={};callback(res);
      res.end(JSON.stringify({proxies:[{name:'Fixture node',type:'http',server:'fixture.example.com',port:8080}]}));
    });return req;
  });return calls;
}

test('Fake-IP recognition never changes whether those addresses are public',()=>{
  for(const value of ['198.18.0.0','198.19.255.255','::ffff:198.18.0.1','::ffff:c613:ffff']){assert.equal(isFakeIPAddress(value),true,value);assert.equal(isPublicAddress(value),false,value);}
  for(const value of ['198.17.255.255','198.20.0.0','127.0.0.1','10.0.0.1','fc00::1','::1','example.com'])assert.equal(isFakeIPAddress(value),false,value);
});
test('Fake-IP compatibility works across different public domains, paths and tokens',async t=>{
  systemDns(t);const names=publicDns(t);
  for(const host of ['source-a.example.com','feed-b.example.net','another-vendor.example.org']){
    assert.equal(await resolvePublicHost(new URL(`https://${host}/different/path?token=never-send-to-dns`)),'93.184.216.34');
  }
  assert.deepEqual(names,['source-a.example.com','feed-b.example.net','another-vendor.example.org']);
  assert(!names.some(name=>name.includes('token')||name.includes('/')));
});
test('mapped Fake-IP answers and mixed public/Fake-IP answers are re-resolved',async t=>{
  systemDns(t,[{address:'::ffff:c612:1',family:6},...PUBLIC]);const names=publicDns(t);
  assert.equal(await resolvePublicHost(new URL('https://mapped.example.com/sub')),'93.184.216.34');assert.equal(names.length,1);
});
test('ordinary public DNS never contacts the external resolver',async t=>{
  systemDns(t,PUBLIC);const names=publicDns(t);
  assert.equal(await resolvePublicHost(new URL('https://normal.example.com/sub')),'93.184.216.34');assert.deepEqual(names,[]);
});
test('private or metadata addresses mixed with Fake-IP are not reinterpreted as safe',async t=>{
  systemDns(t,[...FAKE,{address:'169.254.169.254',family:4}]);const names=publicDns(t);
  await assert.rejects(resolvePublicHost(new URL('https://mixed.example.com/sub')),/本机或内网/);assert.deepEqual(names,[]);
});
test('ordinary private addresses still fail without a public DNS fallback',async t=>{
  systemDns(t,[{address:'10.0.0.1',family:4}]);const names=publicDns(t);
  await assert.rejects(resolvePublicHost(new URL('https://internal.example.com/sub')),/本机或内网/);assert.deepEqual(names,[]);
});
test('literal Fake-IP URLs remain blocked because no origin hostname can be verified',async t=>{
  const names=publicDns(t);
  for(const host of ['198.18.0.42','[::ffff:198.18.0.42]'])await assert.rejects(resolvePublicHost(new URL(`https://${host}/sub`)),/本机或内网/);
  assert.deepEqual(names,[]);
});
test('local and reserved names are never disclosed to public DoH providers',async t=>{
  systemDns(t);const names=publicDns(t);
  for(const host of ['router','printer.local','private.home.arpa','internal.test','a.localhost'])await assert.rejects(resolvePublicHost(new URL(`https://${host}/sub`)),/公共 DNS/);
  assert.deepEqual(names,[]);
});
test('all DoH answers must be public, even when the first address is safe',async t=>{
  systemDns(t);publicDns(t,[...PUBLIC,{address:'127.0.0.1',family:4}]);const calls=subscriptionHttp(t);
  await assert.rejects(downloadSubscription('https://mixed.example.com/sub'),/本机或内网/);assert.equal(calls.length,0);
});
test('a DoH answer containing another Fake-IP address does not create a retry loop',async t=>{
  systemDns(t);const names=publicDns(t,FAKE);const calls=subscriptionHttp(t);
  await assert.rejects(downloadSubscription('https://loop.example.com/sub'),/已阻止/);assert.equal(names.length,1);assert.equal(calls.length,0);
});
test('resolver failure preserves fail-closed behavior rather than using system Fake-IP',async t=>{
  systemDns(t);publicDns(t,()=>{throw Error('private resolver payload token=do-not-echo');});const calls=subscriptionHttp(t);
  await assert.rejects(downloadSubscription('https://unavailable.example.com/sub'),error=>/安全公网解析暂不可用/.test(error.message)&&!error.message.includes('do-not-echo'));assert.equal(calls.length,0);
});
test('empty or malformed secure DNS results are rejected',async t=>{
  systemDns(t);publicDns(t,[]);const calls=subscriptionHttp(t);
  await assert.rejects(downloadSubscription('https://empty.example.com/sub'),/已阻止/);assert.equal(calls.length,0);
});
test('the final subscription request retains the hostname and TLS identity but pins a real public address',async t=>{
  systemDns(t);const names=publicDns(t),calls=subscriptionHttp(t);
  const url='https://provider.example.com/a/b?token=fixture-secret';
  const result=await downloadSubscription(url);
  assert.equal(result.url,url);assert.equal(calls.length,1);assert.deepEqual(names,['provider.example.com']);
  const {options}=calls[0];assert.equal(calls[0].url.hostname,'provider.example.com');assert.equal(options.servername,'provider.example.com');
  assert.equal(options.agent.options.rejectUnauthorized,true);assert.equal(options.family,4);
  assert.deepEqual(await new Promise(resolve=>options.lookup('provider.example.com',{all:true},(_e,rows)=>resolve(rows))),PUBLIC);
  assert.equal(await new Promise(resolve=>options.lookup('provider.example.com',{},(_e,address)=>resolve(address))),'93.184.216.34');
});
test('supported HTTP subscriptions use the same public-address checks',async t=>{
  systemDns(t);const names=publicDns(t),calls=subscriptionHttp(t,http);
  const result=await downloadSubscription('http://http-feed.example.com/sub');
  assert(result.text.includes('proxies'));assert.equal(calls.length,1);assert.deepEqual(names,['http-feed.example.com']);
});
test('IPv6-only real answers can be pinned without using an IPv4 Fake-IP',async t=>{
  systemDns(t);publicDns(t,[{address:'2606:4700:4700::1111',family:6}]);const calls=subscriptionHttp(t);
  await downloadSubscription('https://v6.example.com/sub');assert.equal(calls[0].options.family,6);
  assert.equal(await new Promise(resolve=>calls[0].options.lookup('v6.example.com',{},(_e,address)=>resolve(address))),'2606:4700:4700::1111');
});
test('the original overall deadline covers a stalled public-DNS recovery',async t=>{
  systemDns(t);publicDns(t,()=>new Promise(()=>{}));const calls=subscriptionHttp(t);
  await assert.rejects(downloadSubscription('https://slow.example.com/sub',{timeoutMs:25}),/超时/);assert.equal(calls.length,0);
});
test('Library import and refresh share the same generic path for three different providers',async t=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const {Store}=require('../src/main/store.cjs'),{Library}=require('../src/main/library.cjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facet-fakeip-library-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  systemDns(t);const names=publicDns(t),calls=subscriptionHttp(t);
  const lib=new Library(dir,new Store(dir));
  const hosts=['subscription-one.example.com','different-two.example.net','other-three.example.org'],ids=[];
  for(const [i,host]of hosts.entries())ids.push(await lib.save({name:'Fixture '+i,url:`https://${host}/feed-${i}?token=fixture-${i}`}));
  for(const id of ids)await lib.save({id});
  assert.deepEqual(names,[...hosts,...hosts]);assert.equal(calls.length,6);assert.equal(lib.summaries().length,3);
  assert(lib.summaries().every(source=>source.nodes.length===1));assert(!JSON.stringify(lib.summaries()).includes('token='));
  for(const [i,id]of ids.entries())assert.equal(lib.get(id).url,`https://${hosts[i]}/feed-${i}?token=fixture-${i}`);
});
