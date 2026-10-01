'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {LANGUAGES,environment}=require('./environment.cjs');
function safeURL(value){let s=String(value||'').trim();if(!s)throw Error('请输入网址');if(!/^[a-z][a-z\d+.-]*:/i.test(s))s='https://'+s;const u=new URL(s);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('仅允许不含用户名密码的 HTTP/HTTPS 网址');return u.href;}
function atomic(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n',{mode:0o600});try{fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
class Store {
 constructor(dir){this.dir=dir;this.file=path.join(dir,'instances.json');this.data={version:1,instances:[]};if(fs.existsSync(this.file)){this.data=JSON.parse(fs.readFileSync(this.file,'utf8'));if(this.data.version!==1||!Array.isArray(this.data.instances))throw Error('配置版本不支持，未覆盖原文件');for(const x of this.data.instances){if(!/^[a-f0-9-]{36}$/.test(x.id))throw Error('实例 ID 无效');x.environment=environment(x.environment);x.url=safeURL(x.url);}}}
 save(){atomic(this.file,this.data);}
 commit(data){atomic(this.file,data);this.data=data;}
 list(){return this.data.instances;}
 get(id){const x=this.list().find(x=>x.id===id);if(!x)throw Error('实例不存在');return x;}
 name(value,id){const name=String(value||'').trim();if(!name||name.length>40)throw Error('名称必须为1–40个字符');if(this.list().some(x=>x.id!==id&&x.name===name))throw Error('实例名称重复');return name;}
 create(name,network){if(this.list().length>=15)throw Error('当前最多15个实例');const x={id:crypto.randomUUID(),name:this.name(name),url:'https://arena.ai/',network:network?{mode:network.mode==='mihomo'?'mihomo':'direct',nodeName:String(network.nodeName||'')}:{mode:'direct',nodeName:''},environment:environment()};this.commit({...this.data,instances:[...this.list(),x]});return x;}
 update(id,patch){const original=this.get(id),x={...original};if(patch.name!==undefined)x.name=this.name(patch.name,id);if(patch.url!==undefined)x.url=safeURL(patch.url);if(patch.environment)x.environment=environment(patch.environment);if(patch.muted!==undefined){if(patch.muted)x.muted=true;else delete x.muted;}if(patch.network){if(!['direct','mihomo'].includes(patch.network.mode))throw Error('不支持的网络模式');x.network={mode:patch.network.mode,nodeName:String(patch.network.nodeName||'')};}this.commit({...this.data,instances:this.list().map(row=>row.id===id?x:row)});return x;}
 // 全部静音（顶部按钮）：存在 instances.json 顶层，重启后保持。
 get muted(){return this.data.muted===true;}
 setMuted(value){const data={...this.data};if(value)data.muted=true;else delete data.muted;this.commit(data);}
 remove(id){this.get(id);this.commit({...this.data,instances:this.list().filter(x=>x.id!==id)});}
 proxyFile(id){this.get(id);return path.join(this.dir,'proxy-sources',id+'.json');}
 importNodes(id,text){const nodes=parseNodes(text);this.saveNodes(id,nodes,null);return nodes.map(n=>n.name);}
 saveNodes(id,nodes,subscription,assignment=null){this.sourceCache?.delete(id);atomic(this.proxyFile(id),{version:1,nodes,subscription,assignment});}
 // 状态推送很频繁：节点文件按修改时间和大小缓存，未变化时不再重复读取解析。
 source(id){const p=this.proxyFile(id);let st;try{st=fs.statSync(p);}catch{this.sourceCache?.delete(id);return {nodes:[],subscription:null};}const hit=this.sourceCache?.get(id);if(hit&&hit.mtime===st.mtimeMs&&hit.size===st.size)return hit.data;const raw=JSON.parse(fs.readFileSync(p,'utf8'));let data;if(Array.isArray(raw))data={nodes:raw,subscription:null};else{if(raw.version!==1||!Array.isArray(raw.nodes))throw Error('节点配置格式无效，请重新导入');data=raw;}(this.sourceCache??=new Map()).set(id,{mtime:st.mtimeMs,size:st.size,data});return data;}
 subscriptionSummary(id){const sub=this.source(id).subscription;if(!sub)return null;return {host:new URL(sub.url).host,updatedAt:sub.updatedAt};}

 nodes(id){return this.source(id).nodes;}
}
function parseNodes(text){if(Buffer.byteLength(text)>2*1024*1024)throw Error('配置文件上限2MB');const yaml=require('js-yaml');let config;try{config=yaml.load(text,{schema:yaml.JSON_SCHEMA});}catch{throw Error('配置 YAML/JSON 无法解析，请检查格式');}if(!config||!Array.isArray(config.proxies)||!config.proxies.length)throw Error('需要含 proxies 节点列表的 Clash YAML/JSON；暂不支持仅 proxy-providers 的订阅文件');if(config.proxies.length>3000)throw Error('节点数量过多');const names=new Set();const nodes=config.proxies.map(p=>{if(!p||typeof p!=='object'||!p.name||!p.type||!p.server||!p.port)throw Error('节点缺少 name/type/server/port');if(typeof p.name!=='string'||names.has(p.name))throw Error('节点名称无效或重复');if(!['http','socks5','ss','ssr','vmess','vless','trojan','hysteria','hysteria2','tuic','wireguard','ssh','snell','anytls','mieru'].includes(p.type))throw Error('节点协议不支持；不能把 DIRECT 或策略组当作代理节点');if(p['dialer-proxy'])throw Error('暂不支持依赖其他节点的 dialer-proxy');names.add(p.name);let count=0;const chain=new Set();function copy(v,depth=0){if(++count>20000||depth>16)throw Error('节点结构过深或过大');if(v===null||typeof v!=='object')return v;if(chain.has(v))throw Error('配置包含循环引用');chain.add(v);const out=Array.isArray(v)?v.map(x=>copy(x,depth+1)):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,copy(x,depth+1)]));chain.delete(v);return out;}const node=copy(p);for(const key of ['password','uuid','username'])if(node[key]!==undefined)node[key]=String(node[key]);return node;});return nodes;}
module.exports={Store,environment,safeURL,atomic,LANGUAGES,parseNodes};
