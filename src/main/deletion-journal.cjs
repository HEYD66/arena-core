'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {atomic}=require('./store.cjs');
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function folder(dir){return path.join(dir,'deletion-journal');}
function file(dir,id){if(!ID.test(String(id)))throw Error('实例 ID 无效');return path.join(folder(dir),id+'.json');}
function begin(dir,id){const now=new Date().toISOString();const row={version:1,operationId:crypto.randomUUID(),instanceId:id,state:'deleting',createdAt:now,updatedAt:now,steps:{stopRuntime:'done',metadata:'pending',browserStorage:'pending',nodeSource:'pending',extensionBinding:'pending',runtimeDirectory:'pending'}};atomic(file(dir,id),row);return row;}
function update(dir,id,patch){const target=file(dir,id);let row;try{row=JSON.parse(fs.readFileSync(target,'utf8'));}catch{throw Error('删除操作记录不存在或已损坏');}row={...row,...patch,updatedAt:new Date().toISOString(),steps:{...row.steps,...patch.steps}};atomic(target,row);return row;}
function list(dir){const out=[];try{for(const entry of fs.readdirSync(folder(dir),{withFileTypes:true})){if(!entry.isFile()||!entry.name.endsWith('.json'))continue;try{const row=JSON.parse(fs.readFileSync(path.join(folder(dir),entry.name),'utf8'));if(ID.test(row.instanceId))out.push(row);}catch{}}}catch{}return out;}
function finish(dir,id){
 const target=file(dir,id);
 // Remove the older generation first. If that fails, keep the current intent.
 try{fs.rmSync(target+'.bak',{force:true});fs.rmSync(target,{force:true});}
 catch{return false;}
 return true;
}
module.exports={ID,folder,file,begin,update,list,finish};
