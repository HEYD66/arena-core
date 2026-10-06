'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {atomic}=require('./store.cjs');
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function folder(dir){return path.join(dir,'batch-operations');}
function file(dir,id){if(!/^[0-9a-f-]{36}$/.test(String(id)))throw Error('批量操作 ID 无效');return path.join(folder(dir),id+'.json');}
function begin(dir,plan){const id=crypto.randomUUID();const row={version:1,operationId:id,type:'assign-node',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),items:plan.map(x=>({id:x.id,sourceId:x.sourceId,name:x.name,status:'queued',error:null}))};atomic(file(dir,id),row);return row;}
function read(dir,id){try{const row=JSON.parse(fs.readFileSync(file(dir,id),'utf8'));if(row.version!==1||row.type!=='assign-node'||!Array.isArray(row.items))throw Error();return row;}catch{throw Error('批量操作不存在或已损坏');}}
function update(dir,id,index,patch){const row=read(dir,id),item=row.items[index];if(!item)throw Error('批量操作项目不存在');row.items[index]={...item,...patch};row.updatedAt=new Date().toISOString();atomic(file(dir,id),row);return row;}
function list(dir){const out=[];try{for(const entry of fs.readdirSync(folder(dir),{withFileTypes:true})){if(!entry.isFile()||!entry.name.endsWith('.json'))continue;try{out.push(read(dir,path.basename(entry.name,'.json')));}catch{}}}catch{}return out;}
module.exports={folder,file,begin,read,update,list};
