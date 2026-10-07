'use strict';
// Password-free streaming archive with a corruption checksum and bounded extraction.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {pipeline}=require('node:stream/promises'),{Readable,Transform}=require('node:stream');
const MAGIC=Buffer.from('FACETB02'),MAX_BYTES=20*1024**3,MAX_FILES=100000;
const OMIT=new Set(['cache','code cache','gpucache','dawncache','dawngraphitecache','dawnwebgpucache','shadercache','grshadercache','cookies','cookies-journal','cookies-wal','cookies-shm','lock','singletonlock','singletoncookie','singletonsocket','login data','login data-journal','extension state','local extension settings','sync extension settings','extension rules','extension scripts','extensions']);
function safeEntry(value){if(typeof value!=='string'||value.length>2048||value.includes('\\')||value.startsWith('/')||/[\x00-\x1f:]/.test(value)||value.split('/').some(x=>!x||x==='.'||x==='..'||/[. ]$/.test(x)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x)))throw Error('备份包含不安全的文件路径');return value;}
function excluded(relative){return relative.split('/').some(x=>OMIT.has(x.toLowerCase())||/^chrome-extension[_:]/i.test(x));}
function files(root,prefix=''){
 const out=[];
 if(!fs.existsSync(root))return out;
 function walk(dir,relative){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const rel=relative?relative+'/'+entry.name:entry.name;if(excluded(rel))continue;
  const file=path.join(dir,entry.name),st=fs.lstatSync(file);if(st.isSymbolicLink())throw Error('实例目录包含链接，无法安全备份');
  if(st.isDirectory())walk(file,rel);else if(st.isFile())out.push({path:safeEntry(prefix+rel),file,size:st.size});
  else throw Error('实例目录包含无法备份的特殊文件');
 }}walk(root,'');return out;
}
function header(entry){const data=Buffer.from(JSON.stringify({path:entry.path,size:entry.size})),len=Buffer.alloc(4);len.writeUInt32BE(data.length);return [len,data];}
async function writeArchive(destination,metadata,profiles){
 const meta=Buffer.from(JSON.stringify(metadata));if(meta.length>16*1024**2)throw Error('实例元数据超过 16MB');
 const entries=profiles.flatMap((root,i)=>files(root,'profiles/'+i+'/'));if(entries.length>MAX_FILES||entries.reduce((sum,x)=>sum+x.size,meta.length)>MAX_BYTES)throw Error('单次备份超过 20GB 或 100000 个文件，请减少所选实例');
 const hash=crypto.createHash('sha256').update(MAGIC),checksum=new Transform({transform(chunk,enc,cb){hash.update(chunk);cb(null,chunk);}});
 const temp=destination+'.'+crypto.randomUUID()+'.partial';let committed=false;
 async function* contents(){yield* header({path:'metadata.json',size:meta.length});yield meta;for(const entry of entries){yield* header(entry);let count=0;for await(const chunk of fs.createReadStream(entry.file)){count+=chunk.length;yield chunk;}if(count!==entry.size)throw Error('实例数据发生变化，备份已取消');}yield Buffer.alloc(4);}
 try{
  const fd=fs.openSync(temp,'wx',0o600);fs.writeSync(fd,MAGIC);fs.closeSync(fd);
  await pipeline(Readable.from(contents()),zlib.createGzip(),checksum,fs.createWriteStream(temp,{flags:'a'}));
  fs.appendFileSync(temp,hash.digest());if(fs.statSync(temp).size>MAX_BYTES)throw Error('压缩后的备份超过 20GB，请减少所选实例');const sync=fs.openSync(temp,'r+');try{fs.fsyncSync(sync);}finally{fs.closeSync(sync);}
  // The save dialog handles overwrite consent; keep an existing export recoverable.
  if(fs.existsSync(destination))fs.copyFileSync(destination,destination+'.bak');
  fs.renameSync(temp,destination);committed=true;return {bytes:fs.statSync(destination).size,files:entries.length};
 }finally{meta.fill(0);if(!committed)fs.rmSync(temp,{force:true});}
}
async function readArchive(file,root){
 const stat=fs.statSync(file);if(stat.size<61||stat.size>MAX_BYTES)throw Error('备份文件大小无效或超过 20GB');
 const fd=fs.openSync(file,'r'),head=Buffer.alloc(8),tag=Buffer.alloc(32);try{fs.readSync(fd,head,0,8,0);fs.readSync(fd,tag,0,32,stat.size-32);}finally{fs.closeSync(fd);}
 if(!head.equals(MAGIC))throw Error('不是受支持的千面实例备份');
 fs.mkdirSync(root,{recursive:false,mode:0o700});const packed=path.join(root,'checked.payload');
 const hash=crypto.createHash('sha256').update(MAGIC),checksum=new Transform({transform(chunk,enc,cb){hash.update(chunk);cb(null,chunk);}});
 try{
  await pipeline(fs.createReadStream(file,{start:8,end:stat.size-33}),checksum,fs.createWriteStream(packed,{flags:'wx',mode:0o600}));
  if(!crypto.timingSafeEqual(hash.digest(),tag))throw Error('备份文件损坏，未导入任何实例');
  const plain=path.join(root,'contents.payload');let inflated=0;
  const guard=new (require('node:stream').Transform)({transform(chunk,enc,cb){inflated+=chunk.length;cb(inflated>MAX_BYTES+32*1024**2?Error('备份解压后超过 20GB'):null,chunk);}});
  await pipeline(fs.createReadStream(packed),zlib.createGunzip(),guard,fs.createWriteStream(plain,{flags:'wx',mode:0o600}));
  const input=fs.openSync(plain,'r');let position=0,count=0,total=0,workBytes=0;const seen=new Set();
  function read(length){const b=Buffer.alloc(length);let done=0;while(done<length){const n=fs.readSync(input,b,done,length-done,position);if(!n)throw Error('备份内容不完整');position+=n;done+=n;}return b;}
  try{for(;;){const length=read(4).readUInt32BE();if(!length){if(position!==fs.statSync(plain).size)throw Error('备份末尾有无效内容');break;}if(length>4096||++count>MAX_FILES+1)throw Error('备份文件条目无效');
   const entry=JSON.parse(read(length).toString('utf8')),name=safeEntry(entry.path);if(name!=='metadata.json'&&!/^profiles\/\d+\//.test(name))throw Error('备份内容不受支持');
   if(name.startsWith('profiles/')&&excluded(name.split('/').slice(2).join('/')))throw Error('备份包含插件或不支持的数据');
   if(seen.has(name.toLowerCase())||!Number.isSafeInteger(entry.size)||entry.size<0||(total+=entry.size)>MAX_BYTES)throw Error('备份条目重复或大小无效');seen.add(name.toLowerCase());
   if(name==='metadata.json'&&entry.size>16*1024**2)throw Error('备份元数据过大');
   const target=path.join(root,'unpacked',...name.split('/'));fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});const output=fs.openSync(target,'wx',0o600);
   try{let remaining=entry.size;while(remaining){const chunk=read(Math.min(remaining,1024**2));fs.writeSync(output,chunk);remaining-=chunk.length;workBytes+=chunk.length;if(workBytes>=8*1024**2){workBytes=0;await new Promise(resolve=>setImmediate(resolve));}}}finally{fs.closeSync(output);}
   if(count%64===0)await new Promise(resolve=>setImmediate(resolve));
  }}finally{fs.closeSync(input);}
  if(!seen.has('metadata.json'))throw Error('备份缺少实例信息');
  const metadata=JSON.parse(fs.readFileSync(path.join(root,'unpacked','metadata.json'),'utf8'));
  return {metadata,unpacked:path.join(root,'unpacked')};
 }catch(error){fs.rmSync(root,{recursive:true,force:true});throw error;}finally{fs.rmSync(packed,{force:true});fs.rmSync(path.join(root,'contents.payload'),{force:true});}
}
module.exports={writeArchive,readArchive,files,safeEntry,excluded};
