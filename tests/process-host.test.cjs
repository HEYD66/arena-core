'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {fork,spawn}=require('node:child_process');
const {hostPath,recoverProcessHosts}=require('../src/main/process-host.cjs');
const {Mihomo}=require('../src/main/mihomo.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await delay(50);}assert.fail('process/port did not reach expected state within 5 seconds');}
function listening(port){return new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});const done=v=>{s.destroy();resolve(v);};s.on('error',()=>done(false));s.on('connect',()=>done(true));s.setTimeout(250,()=>done(false));});}
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'facet-job-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
async function owner(t,dir,options={}){
 fs.mkdirSync(dir,{recursive:true});
 const p=fork(path.join(__dirname,'process-host-worker.cjs'),[],{windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],...options,env:{...(options.env||process.env),FACET_HOST_TEST_DIR:dir}});
 let stderr='';p.stderr.on('data',x=>stderr=(stderr+x).slice(-2000));
 let info;
 t.after(async()=>{
  if(p.exitCode===null&&p.signalCode===null)p.kill();
  if(info){await until(()=>!alive(info.host)&&!alive(info.core));}
 });
 info=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('worker startup timeout: '+stderr)),15000);
  let output='';p.stdout.on('data',chunk=>{output+=chunk;for(;;){const end=output.indexOf('\n');if(end<0)break;const line=output.slice(0,end);output=output.slice(end+1);if(line.startsWith('FACET_TEST_READY=')){clearTimeout(timer);resolve(JSON.parse(line.slice('FACET_TEST_READY='.length)));}}});
  p.once('message',m=>{clearTimeout(timer);m.error?reject(Error(m.error)):resolve(m);});
  p.once('error',e=>{clearTimeout(timer);reject(e);});
  p.once('exit',()=>{clearTimeout(timer);reject(Error('worker exited before ready'));});
 });
 assert(info.ready);assert.notEqual(info.host,info.core);assert(alive(info.core));assert(await listening(info.port));
 return {p,info};
}
test('Windows kill-on-close jobs reclaim actual proxy processes and preserve another owner',{skip:process.platform!=='win32',timeout:45000},async t=>{
 const dir=fixture(t),other=await owner(t,path.join(dir,'other'));
 for(const mode of ['owner','host','core','normal']){
  const {p,info}=await owner(t,path.join(dir,mode));
  if(mode==='normal')p.send('stop');else process.kill(info[mode],'SIGKILL');
  await until(()=>!alive(info.core)&&!alive(info.host));
  await until(async()=>!await listening(info.port)&&!await listening(info.controllerPort));
  assert(alive(other.info.core),'another owner must not be terminated');
  assert(await listening(other.info.port));
  if(mode==='normal')await until(()=>!alive(info.owner));
  // A surviving owner notices a killed host/core and can still close normally.
  else if(mode!=='owner'){p.send('stop');await until(()=>!alive(info.owner));}
 }
 other.p.send('stop');await until(()=>!alive(other.info.owner)&&!alive(other.info.core)&&!alive(other.info.host));
});
test('host exits without spawning a core when parent lease is absent',{skip:process.platform!=='win32',timeout:10000},async t=>{
 const dir=fixture(t),binary=path.resolve(__dirname,'../resources/mihomo/mihomo.exe');
 const p=spawn(hostPath(),[binary,dir,path.join(dir,'missing.json')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let output='';p.stdout.on('data',x=>output+=x);p.stderr.resume();
 const exited=new Promise((resolve,reject)=>{p.once('exit',resolve);p.once('error',reject);});p.stdin.end();
 assert.equal(await exited,71);assert(!output.includes('FACET_CORE_PID='));assert.deepEqual(fs.readdirSync(dir),[]);
});
test('forced Electron main-process termination releases the owned core and ports',{skip:process.platform!=='win32',timeout:45000},async t=>{
 const {childEnvironment,resolveRuntime}=require('../scripts/electron-runtime.cjs'),env=childEnvironment();
 const execPath=resolveRuntime({executable:require('electron'),version:require('electron/package.json').version,env,warn(){}});
 const dir=fixture(t),{p,info}=await owner(t,dir,{execPath,env});
 p.kill('SIGKILL');await until(()=>!alive(info.core)&&!alive(info.host));
 await until(async()=>!await listening(info.port)&&!await listening(info.controllerPort));
});
test('core PID is real and normal stop releases it before restart',{skip:process.platform!=='win32',timeout:20000},async t=>{
 const dir=fixture(t),core=new Mihomo(path.resolve(__dirname,'../resources/mihomo/mihomo.exe'),dir);
 t.after(()=>core.stop());
 for(let i=0;i<3;i++){
  const result=await core.start({name:'loopback',type:'http',server:'127.0.0.1',port:9});
  const pid=result.pid;assert.equal(pid,core.pid);assert.notEqual(pid,core.child.pid);
  await core.stop();await until(()=>!alive(pid));assert(!fs.existsSync(path.join(dir,'runtime.json')));
 }
});
test('startup recovery removes an owned lease and leaves unrelated processes alone',{skip:process.platform!=='win32',timeout:30000},async t=>{
 const base=fixture(t),{p,info}=await owner(t,path.join(base,'instance'));
 const marker=path.join(base,'instance','process-host.json');assert(fs.existsSync(marker));
 const recovered=recoverProcessHosts(base);assert.equal(recovered.scanned,1);assert(recovered.terminated>=1);assert.equal(recovered.removed,1);
 await until(()=>!alive(info.host)&&!alive(info.core));assert(!fs.existsSync(marker));
 p.send('stop');await until(()=>!alive(info.owner));
});
