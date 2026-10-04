'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto');
const {spawnCore,hostPath,writeProcessMarker,removeProcessMarker}=require('./process-host.cjs');const http=require('node:http');
const dgram=require('node:dgram');const reservedPorts=new Set(),retiredPorts=new Map();
const {networkError}=require('./network-error.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function port(){for(const [p,until]of retiredPorts)if(until<Date.now())retiredPorts.delete(p);for(let i=0;i<150;i++){const p=crypto.randomInt(20000,49000);if(reservedPorts.has(p)||retiredPorts.has(p))continue;reservedPorts.add(p);const tcp=net.createServer(),udp=dgram.createSocket('udp4');try{await new Promise((resolve,reject)=>{tcp.once('error',reject);tcp.listen({port:p,host:'127.0.0.1',exclusive:true},resolve);});await new Promise((resolve,reject)=>{udp.once('error',reject);udp.bind({port:p,address:'127.0.0.1',exclusive:true},resolve);});return p;}catch{reservedPorts.delete(p);retiredPorts.set(p,Date.now()+30000);}finally{await new Promise(resolve=>{if(tcp.listening)tcp.close(resolve);else resolve();});try{await new Promise(resolve=>udp.close(resolve));}catch{}}}throw Error('无法分配独立代理端口');}

function coreVersion(port,secret,signal){return new Promise((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port,path:'/version',agent:false,headers:{Authorization:'Bearer '+secret,Connection:'close'},signal},res=>{let text='';res.on('data',chunk=>{text+=chunk;if(text.length>16384)req.destroy(Error('内核响应过大'));});res.on('error',reject);res.on('end',()=>{try{if(res.statusCode!==200)throw Error('内核未就绪');const data=JSON.parse(text);if(!data.version)throw Error('内核响应无效');resolve(data.version);}catch(e){reject(e);}});});req.on('error',reject);req.setTimeout(350,()=>req.destroy(Error('内核响应超时')));});}

function listenerReady(port){return new Promise((resolve,reject)=>{const socket=net.connect({host:'127.0.0.1',port});socket.setTimeout(350,()=>socket.destroy(Error('代理监听尚未就绪')));socket.once('error',reject);socket.once('connect',()=>{socket.destroy();resolve();});});}
function configuration(node,proxyPort,controllerPort,secret){return {'mixed-port':proxyPort,'allow-lan':false,'bind-address':'127.0.0.1',ipv6:true,mode:'rule','log-level':'warning','external-controller':`127.0.0.1:${controllerPort}`,secret,'external-ui':'','external-controller-cors':{'allow-origins':[],'allow-private-network':false},dns:{enable:false},tun:{enable:false},profile:{'store-selected':false,'store-fake-ip':false},proxies:[{...node,name:'arena-upstream'}],rules:['MATCH,arena-upstream']};}
class Mihomo {
 constructor(binary,dir,onUnexpected){this.binary=binary;this.dir=dir;this.onUnexpected=onUnexpected;this.child=null;this.expected=false;}
 async start(node,signal){for(let attempt=0;attempt<3;attempt++){try{return await this.startAttempt(node,signal);}catch(e){if(signal?.aborted||attempt===2||!this.lastIssue?.message.startsWith('本地端口绑定失败'))throw e;}}}
 async startAttempt(node,signal){signal?.throwIfAborted();if(this.child)throw Error('内核已运行');if(!fs.existsSync(this.binary))throw Error('内置 Mihomo 缺失，请先运行 npm run setup:core；不会调用其他客户端');this.proxyPort=await port();this.controllerPort=await port();while(this.controllerPort===this.proxyPort)this.controllerPort=await port();signal?.throwIfAborted();this.secret=crypto.randomBytes(32).toString('hex');fs.mkdirSync(this.dir,{recursive:true});this.config=path.join(this.dir,'runtime.json');fs.writeFileSync(this.config,JSON.stringify(configuration(node,this.proxyPort,this.controllerPort,this.secret)),{mode:0o600});this.expected=false;this.lastIssue=null;let spawnError;
 let child;try{child=spawnCore(this.binary,this.dir,this.config);}catch(e){this.clean();throw e;}this.child=child;
 if(process.platform==='win32'){
  const marker=()=>({hostPid:child.pid,corePid:child.corePid||null,hostBinary:hostPath(),coreBinary:path.resolve(this.binary),config:path.resolve(this.config),proxyPort:this.proxyPort,controllerPort:this.controllerPort,createdAt:new Date().toISOString()});
  child.on('facet-core-pid',()=>{try{writeProcessMarker(this.dir,marker());}catch{} });
  try{writeProcessMarker(this.dir,marker());}catch(e){try{child.kill();}catch{}this.clean();throw Error('进程保护租约写入失败，已阻止代理启动');}
 }
 // Drain output without persisting proxy credentials or unrestricted engine log lines.
 const classify=chunk=>{const message=networkError(chunk.toString('utf8').slice(-8192));if(message){this.lastIssue={message,at:Date.now()};try{this.onIssue?.(message);}catch{}}};child.stdout.on('data',classify);child.stderr.on('data',classify);child.on('error',e=>{spawnError=e;if(!child.pid){this.child=null;this.clean();}});
 child.once('exit',()=>{if(this.child!==child)return;this.child=null;this.clean();if(!this.expected)this.onUnexpected?.('代理内核意外退出，实例已断开；未切回直连');});
 try{const deadline=Date.now()+12000;for(;Date.now()<deadline;){signal?.throwIfAborted();if(spawnError)throw spawnError;if(this.lastIssue?.message.startsWith('本地端口绑定失败'))throw Error(this.lastIssue.message);if(child.exitCode!==null||child.signalCode!==null)throw Error('Mihomo 启动失败，请检查节点参数');try{const version=await coreVersion(this.controllerPort,this.secret,signal);await listenerReady(this.proxyPort);if(this.child!==child||child.exitCode!==null||child.signalCode!==null)throw Error('内核已退出');if(process.platform==='win32'&&!child.corePid)throw Error('进程保护未确认内核 PID');return {port:this.proxyPort,pid:this.pid,version};}catch{}await delay(80);}throw Error('Mihomo 启动超时');}catch(e){await this.stop();throw e;}}
 get pid(){return this.child?.corePid||this.child?.pid||null;}
 recentIssue(){return this.lastIssue&&Date.now()-this.lastIssue.at<60000?this.lastIssue.message:'';}
 clean(){for(const p of [this.proxyPort,this.controllerPort])if(p){reservedPorts.delete(p);retiredPorts.set(p,Date.now()+120000);}removeProcessMarker(this.dir);if(this.config&&fs.existsSync(this.config))fs.unlinkSync(this.config);}
 async stop(){this.expected=true;const child=this.child;if(!child){this.clean();return;}if(child.exitCode===null&&child.signalCode===null){child.kill();for(let i=0;i<40&&child.exitCode===null&&child.signalCode===null;i++)await delay(50);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');for(let i=0;i<40&&child.exitCode===null&&child.signalCode===null;i++)await delay(50);}}
 if(child.exitCode===null&&child.signalCode===null)throw Error('代理内核未退出，保留进程引用等待重试');if(this.child===child)this.child=null;this.clean();}
}
module.exports={Mihomo,configuration};
