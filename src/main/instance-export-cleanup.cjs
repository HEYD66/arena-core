'use strict';
// Runs before any browser sessions open, after a verified export has been committed.
const fs=require('node:fs'),path=require('node:path'),{isDeepStrictEqual}=require('node:util');
const {Store}=require('./store.cjs'),journal=require('./deletion-journal.cjs'),cleanup=require('./cleanup.cjs');
const {commitDeletionMetadata}=require('./deletion-commit.cjs');
function deleteExportedInstances(dir,instances,originalRows){
 if(!fs.existsSync(path.join(dir,'instances.json')))throw Error('原实例配置不存在，未执行删除');
 const store=new Store(dir),catalog=new (require('./extension-catalog.cjs').ExtensionCatalog)(dir);
 const results={deleted:0,deleteFailed:0,cleanupPending:0,items:[]};
 for(const instance of instances){
  const id=instance.id,item={id,name:instance.name,status:'retained'};results.items.push(item);
  try{
   const current=store.list().find(x=>x.id===id),expected=originalRows?.find(x=>x.id===id);
   if(current){
    if(!expected||!isDeepStrictEqual(current,expected))throw Error('实例配置发生变化，保留原实例');
    const warnings=commitDeletionMetadata(store,journal,dir,id);
    if(warnings.length)item.warning=warnings.join('；');
   }
   results.deleted++;item.status='deleted';
   // Known UUID paths only; rm of a link removes the link and never follows its target.
   for(const target of cleanup.journalResiduals(dir,id))fs.rmSync(target,{recursive:true,force:true,maxRetries:2});
   if(Object.hasOwn(catalog.data.enabled,id))catalog.forget(id);
   if(cleanup.journalResiduals(dir,id).length||Object.hasOwn(catalog.data.enabled,id)||!journal.finish(dir,id))throw Error('部分数据清理未完成');
  }catch{
   if(store.list().some(x=>x.id===id)){results.deleteFailed++;item.status='retained';item.warning='原实例保留，请查看导出结果后手动处理';}
   else{results.cleanupPending++;item.status='cleanup-pending';item.warning='原实例已删除，部分数据将在启动时重试清理';}
  }
 }
 return results;
}
module.exports={deleteExportedInstances};
