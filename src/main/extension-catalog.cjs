'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {atomic}=require('./store.cjs');
const LIMIT=100*1024*1024;
function localPage(value){if(typeof value!=='string'||!value||value.length>1024||/[\\%?#\x00-\x1f]/.test(value)||value.startsWith('/')||value.includes(':')||value.split('/').some(x=>x==='..'||x==='.'||!x))throw Error('扩展页面必须是扩展目录内的相对路径');return value;}
function inspect(folder){const file=path.join(folder,'manifest.json');if(!fs.existsSync(file)||fs.statSync(file).size>1024*1024)throw Error('请选择包含manifest.json的解压扩展文件夹（清单上限1MB）');let m;try{m=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('扩展manifest.json不是有效JSON');}if(![2,3].includes(m.manifest_version)||typeof m.name!=='string'||!m.name.trim()||m.name.length>200||typeof m.version!=='string'||m.version.length>50)throw Error('扩展名称、版本或manifest_version无效');
 const entries={};for(const [key,value]of Object.entries({popup:m.action?.default_popup||m.browser_action?.default_popup||m.page_action?.default_popup,options:m.options_ui?.page||m.options_page})){if(value){entries[key]=localPage(value);if(!fs.statSync(path.join(folder,entries[key])).isFile())throw Error('扩展界面文件不存在');}}
 for(const key of ['permissions','host_permissions','optional_permissions','optional_host_permissions','content_scripts'])if(m[key]!==undefined&&!Array.isArray(m[key]))throw Error('扩展权限或脚本清单无效');
 const permissions=[...(m.permissions||[]),...(m.host_permissions||[])];if(permissions.some(x=>typeof x!=='string')||permissions.length>500)throw Error('扩展权限清单无效');const matches=(m.content_scripts||[]).flatMap(x=>x.matches||[]);if(matches.some(x=>typeof x!=='string')||matches.length>500)throw Error('内容脚本范围无效');
 let name=m.name;if(/^__MSG_(.+)__$/.test(name)&&m.default_locale&&/^[a-zA-Z0-9_-]+$/.test(m.default_locale)){try{const messages=JSON.parse(fs.readFileSync(path.join(folder,'_locales',m.default_locale,'messages.json'),'utf8'));name=messages[name.slice(6,-2)]?.message||name;}catch{}}
 const compatibilityNotice=name==='Dark Reader'&&m.version==='4.9.133'?'官方 Dark Reader 4.9.133 在当前 Electron 的 Linux 初测未通过：后台窗口API报错、面板停留在加载中、网页未变暗。Windows仍待实测；不能视为可用。':'';
 return {compatibilityNotice,name:String(name).slice(0,200),version:m.version,manifestVersion:m.manifest_version,permissions:[...new Set(permissions)],optionalPermissions:[...(m.optional_permissions||[]),...(m.optional_host_permissions||[])].map(String).slice(0,500),matches:[...new Set(matches)],entries,key:m.key||null,warnings:['Electron仅支持部分扩展API；已加载不代表功能全部兼容。',...(m.background?.service_worker?['此扩展使用MV3 Service Worker；必须实际验证后台功能。']:[]),...(permissions.includes('nativeMessaging')?['原生程序通信不受支持。']:[])]};}
const ICON_TYPES={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml'},ICON_LIMIT=64*1024;
function extensionIcon(folder){try{const m=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8')),found=[];
 for(const v of [m.icons,m.action?.default_icon,m.browser_action?.default_icon,m.page_action?.default_icon]){if(typeof v==='string')found.push([0,v]);else if(v&&typeof v==='object')for(const [k,p]of Object.entries(v))if(typeof p==='string')found.push([Number(k)||0,p]);}
 const big=found.filter(x=>x[0]>=32).sort((a,b)=>a[0]-b[0]),rest=found.filter(x=>x[0]<32).sort((a,b)=>b[0]-a[0]);
 for(const [,raw]of [...big,...rest]){try{const rel=localPage(raw.replace(/^\.?\//,'')),type=ICON_TYPES[path.extname(rel).slice(1).toLowerCase()];if(!type)continue;const file=path.join(folder,rel),st=fs.lstatSync(file);if(!st.isFile()||st.size>ICON_LIMIT||!st.size)continue;return 'data:'+type+';base64,'+fs.readFileSync(file).toString('base64');}catch{}}
}catch{}return null;}
class ExtensionCatalog{
 constructor(dir){this.base=path.join(dir,'extensions-packages');this.file=path.join(dir,'extensions.json');fs.mkdirSync(this.base,{recursive:true});this.data=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{items:[],enabled:{}};if(!Array.isArray(this.data.items)||!this.data.enabled||this.data.items.some(x=>!/^ext-[a-f0-9-]+$/.test(x.id)))throw Error('扩展目录索引无效');}
 commit(data){atomic(this.file,data);this.data=data;}
 get(id){const row=this.data.items.find(x=>x.id===id);if(!row)throw Error('扩展不存在');return row;}
 folder(id){this.get(id);return path.join(this.base,id);}
 stage(source){if(this.data.items.length>=20)throw Error('扩展上限20个');const id='ext-'+crypto.randomUUID(),dest=path.join(this.base,id);let count=0,bytes=0;const digest=crypto.createHash('sha256');
 const walk=(src,out,rel='')=>{if(++count>10000||rel.split('/').length>64)throw Error('扩展上限10000目录/文件，目录深度64');const st=fs.lstatSync(src);if(st.isSymbolicLink())throw Error('扩展不允许符号链接或目录联接');if(st.isDirectory()){fs.mkdirSync(out);for(const n of fs.readdirSync(src).sort())walk(path.join(src,n),path.join(out,n),rel+'/'+n);}else if(st.isFile()){if((bytes+=st.size)>LIMIT)throw Error('扩展上限100MB/10000文件');const b=fs.readFileSync(src);if(b.length!==st.size)throw Error('扩展文件正在改变，请关闭编辑程序后重试');digest.update(rel).update('\0').update(b);fs.writeFileSync(out,b,{flag:'wx'});}else throw Error('扩展包含不支持的文件类型');};
 try{if(!fs.lstatSync(source).isDirectory())throw Error('请选择解压后的扩展文件夹');const relative=path.relative(fs.realpathSync(source),dest);if(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))throw Error('不能导入包含应用扩展存储目录的父文件夹');walk(source,dest);const info=inspect(dest),sha256=digest.digest('hex');if(this.data.items.some(x=>x.sha256===sha256||info.key&&x.key===info.key))throw Error('此扩展或同一签名的版本已导入；请先停用并移除旧版本');return {id,...info,sha256,bytes,files:count,importedAt:new Date().toISOString()};}catch(e){fs.rmSync(dest,{recursive:true,force:true});throw e;}}
 accept(row){this.commit({...this.data,items:[...this.data.items,row]});}
 discard(row){fs.rmSync(path.join(this.base,row.id),{recursive:true,force:true});}
 setEnabled(instanceId,id,enabled){this.get(id);if(typeof enabled!=='boolean')throw Error('启用状态无效');const set=new Set(this.data.enabled[instanceId]||[]);enabled?set.add(id):set.delete(id);this.commit({...this.data,enabled:{...this.data.enabled,[instanceId]:[...set]}});}
 enabled(id){return this.data.enabled[id]||[];}
 forget(id){const enabled={...this.data.enabled};delete enabled[id];this.commit({...this.data,enabled});}
 remove(id){const row=this.get(id);if(Object.values(this.data.enabled).some(list=>list.includes(id)))throw Error('请先在所有实例中停用此扩展');this.commit({...this.data,items:this.data.items.filter(x=>x.id!==id)});this.discard(row);}
}
module.exports={ExtensionCatalog,inspect,localPage,extensionIcon};
