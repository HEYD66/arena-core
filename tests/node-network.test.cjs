'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {NodeNetwork,DEFAULTS,normalize,fakeAddress,pickInterface,readInterfaces}=require('../src/main/node-network.cjs');
const {configuration,Mihomo}=require('../src/main/mihomo.cjs');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'facet-node-network-test-'));
test('new network settings preserve routes and persist with backup',async()=>{
 const dir=temp();try{const n=new NodeNetwork(dir);assert.deepEqual(n.settings,DEFAULTS);assert(!fs.existsSync(n.file));await n.save({dnsMode:'secure',routeMode:'system'});assert.equal(new NodeNetwork(dir).settings.dnsMode,'secure');await n.save({...DEFAULTS});assert.equal(JSON.parse(fs.readFileSync(n.file+'.bak')).dnsMode,'secure');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('invalid settings cannot overwrite existing file',async()=>{
 const dir=temp();try{const n=new NodeNetwork(dir);await n.save({...DEFAULTS});const before=fs.readFileSync(n.file);for(const v of [null,{}, {dnsMode:'bad',routeMode:'system'},{dnsMode:'auto',routeMode:'interface',interfaceName:'WLAN#DIRECT'}])await assert.rejects(n.save(v));assert.deepEqual(fs.readFileSync(n.file),before);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('unreadable settings fail closed for nodes and original data stays intact',async()=>{
 const dir=temp();try{const file=path.join(dir,'node-network.json');fs.writeFileSync(file,'{broken');const n=new NodeNetwork(dir);await assert.rejects(n.prepare({server:'127.0.0.1'}),/重新保存/);assert.equal(fs.readFileSync(file,'utf8'),'{broken');await n.save({...DEFAULTS});assert(!n.warning);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Fake-IP literals fail before any core process or temporary configuration exists',async()=>{
 const dir=temp();try{const n=new NodeNetwork(dir),core=new Mihomo(path.resolve('resources/mihomo/mihomo.exe'),path.join(dir,'runtime'),null,n);for(const ip of ['198.18.1.2','198.19.255.2','::ffff:198.18.2.3']){assert(fakeAddress(ip));await assert.rejects(core.start({server:ip}),/Fake-IP/);assert.equal(core.child,null);assert(!fs.existsSync(path.join(dir,'runtime')));}assert(!fakeAddress('198.20.0.1'));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('physical interface choice requires hardware and default route, adds both route and interface metrics',()=>{
 const rows=[{name:'Meta',index:1,physical:false,defaultRoute:true,metric:0},{name:'WLAN',index:12,physical:true,defaultRoute:true,metric:35},{name:'Ethernet',index:14,physical:true,defaultRoute:true,metric:20},{name:'Disconnected route',index:15,physical:true,defaultRoute:false,metric:0}];
 assert.equal(pickInterface(rows,{routeMode:'physical'}),'Ethernet');assert.equal(pickInterface(rows,{routeMode:'interface',interfaceName:'WLAN'}),'WLAN');assert.throws(()=>pickInterface(rows,{routeMode:'interface',interfaceName:'missing'}),/未回退/);assert.throws(()=>pickInterface(rows.filter(r=>!r.physical),{routeMode:'physical'}),/未回退/);
});
test('secure node DNS preserves domain, SNI, protocol options and destination resolver',async()=>{
 const dir=temp();try{const n=new NodeNetwork(dir);await n.save({dnsMode:'secure',routeMode:'system'});const node={server:'www.cloudflare.com',name:'fixture',type:'http',port:443,tls:true,sni:'custom.tls.test',servername:'other.tls.test',alpn:['h2']},bytes=JSON.stringify(node),prepared=await n.prepare(node),config=configuration(node,1234,1235,'secret',prepared.overrides);assert.equal(JSON.stringify(node),bytes);assert.equal(config.proxies[0].server,node.server);assert.equal(config.proxies[0].sni,node.sni);assert.deepEqual(config.proxies[0].alpn,node.alpn);assert.equal(config.dns.enable,false);assert.deepEqual(Object.keys(config.hosts),[node.server]);assert(config.hosts[node.server].length);assert(config.hosts[node.server].every(require('../src/main/subscription-policy.cjs').isPublicAddress));assert.deepEqual(config.rules,['MATCH,arena-upstream']);assert.equal(config.tun.enable,false);assert(!('interface-name'in config));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('local nodes and internal names keep their original DNS behavior',async()=>{
 const dir=temp();try{const n=new NodeNetwork(dir);await n.save({dnsMode:'secure',routeMode:'system'});for(const server of ['127.0.0.1','::1','10.0.0.1','gateway.lan','localhost'])assert.deepEqual((await n.prepare({server})).overrides,{});}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('aborted preparations never create a core process',async()=>{
 const dir=temp();try{const n=new NodeNetwork(dir),abort=new AbortController();abort.abort();await assert.rejects(n.prepare({server:'www.cloudflare.com'},abort.signal));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('actual Windows interface inventory has stable identifiers and missing selection is rejected',{skip:process.platform!=='win32'},async()=>{
 const dir=temp();try{const rows=await readInterfaces();assert(rows.length);assert(rows.every(r=>Number.isSafeInteger(r.index)&&r.name));const n=new NodeNetwork(dir);await assert.rejects(n.save({dnsMode:'auto',routeMode:'interface',interfaceName:'Facet missing interface test'}),/未回退/);assert(!fs.existsSync(n.file));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
