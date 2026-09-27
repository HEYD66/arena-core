'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {atomic,parseNodes}=require('./store.cjs');
const {downloadSubscription}=require('./subscription.cjs');
function hintNode(name){return /剩余流量|重置剩余|套餐到期|到期时间|官网地址|订阅更新|traffic remaining|expire date/i.test(name);}
function label(value){const s=String(value||'').trim();if(!s||s.length>80)throw Error('名称需要 1–80 个字符');return s;}
class Library {
 constructor(dir,store){this.file=path.join(dir,'proxy-library.json');this.data=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{version:1,sources:[]};if(this.data.version!==1||!Array.isArray(this.data.sources))throw Error('全局代理库格式无效');if(!fs.existsSync(this.file)){const sources=[];for(const instance of store.list()){const source=store.source(instance.id);if(!source.nodes.length)continue;if(source.subscription&&sources.some(s=>s.url===source.subscription.url))continue;sources.push({id:crypto.randomUUID(),name:instance.name+' · 已迁移',url:source.subscription?.url||null,updatedAt:source.subscription?.updatedAt||new Date().toISOString(),nodes:source.nodes});}this.commit(sources);}}
 commit(sources){const next={version:1,sources};atomic(this.file,next);this.data=next;}
 get(id){const source=this.data.sources.find(s=>s.id===id);if(!source)throw Error('订阅或节点源不存在');return source;}
 toggleHint(id,name){const source=this.get(id);if(!source.nodes.some(n=>n.name===name))throw Error('节点不存在');const enabledHints=new Set(source.enabledHints||[]);enabledHints.has(name)?enabledHints.delete(name):enabledHints.add(name);this.commit(this.data.sources.map(s=>s.id===id?{...s,enabledHints:[...enabledHints]}:s));}
 node(id,name){const source=this.get(id);const node=source.nodes.find(n=>n.name===name&&!(source.excluded||[]).includes(n.name));if(!node)throw Error('节点不存在，请刷新列表');return structuredClone(node);}
 summaries(){return this.data.sources.map(s=>({id:s.id,name:s.name,host:s.url?new URL(s.url).host:'本地文件',subscription:!!s.url,updatedAt:s.updatedAt,changes:s.changes||null,excludedCount:(s.excluded||[]).length,nodes:s.nodes.filter(n=>!(s.excluded||[]).includes(n.name)).map(n=>({name:n.name,type:n.type,hint:hintNode(n.name)&&!(s.enabledHints||[]).includes(n.name)}))}));}
 async save({id,name,url,text}){const old=id?this.get(id):null;if(!old&&this.data.sources.length>=30)throw Error('最多保存 30 个订阅或本地节点源');const title=label(name||old?.name);let nodes,target=null;if(text!==undefined){nodes=parseNodes(text);}else{const response=await downloadSubscription(url||old?.url);nodes=parseNodes(response.text);target=response.url;}const previous=new Map((old?.nodes||[]).map(n=>[n.name,n]));const changes={added:nodes.filter(n=>!previous.has(n.name)).length,removed:(old?.nodes||[]).filter(n=>!nodes.some(x=>x.name===n.name)).length,changed:nodes.filter(n=>previous.has(n.name)&&JSON.stringify(previous.get(n.name))!==JSON.stringify(n)).length};const source={changes,enabledHints:old?.enabledHints||[],id:old?.id||crypto.randomUUID(),name:title,url:target,nodes,excluded:old?.excluded||[],updatedAt:new Date().toISOString()};this.commit(old?this.data.sources.map(s=>s.id===id?source:s):[...this.data.sources,source]);return source.id;}
 rename(id,name){this.get(id);const title=label(name);this.commit(this.data.sources.map(s=>s.id===id?{...s,name:title}:s));}
 removeNodes(id,names){const source=this.get(id);if(!Array.isArray(names)||!names.length||names.length>3000||names.some(name=>typeof name!=='string'||!source.nodes.some(n=>n.name===name)))throw Error('请选择有效节点');const excluded=[...new Set([...(source.excluded||[]),...names])];this.commit(this.data.sources.map(s=>s.id===id?{...s,excluded}:s));}
 restoreNodes(id){this.get(id);this.commit(this.data.sources.map(s=>s.id===id?{...s,excluded:[]}:s));}
 remove(id){this.get(id);this.commit(this.data.sources.filter(s=>s.id!==id));}
}
module.exports={Library,hintNode};
