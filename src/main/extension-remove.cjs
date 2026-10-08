'use strict';
// Caller holds the shared extensions queue; instance queues remain held until
// the catalog commit so a concurrent start cannot reload the removed package.
async function removeExtension(controller,key,confirmedIds){
 const catalog=controller.extensions.catalog,row=catalog.get(key);
 const ids=[...new Set([...controller.store.list().map(x=>x.id),...controller.runtimes.keys()])].sort();
 const lock=index=>index===ids.length?perform():controller.queue(ids[index],()=>lock(index+1));
 async function perform(){
  if(controller.disposing)throw Error('应用正在退出');
  const users=ids.filter(id=>catalog.enabled(id).includes(key)||controller.runtimes.get(id)?.loadedExtensions?.has(key));
  if(!Array.isArray(confirmedIds)||confirmedIds.some(id=>typeof id!=='string')||new Set(confirmedIds).size!==confirmedIds.length||JSON.stringify([...confirmedIds].sort())!==JSON.stringify(users))throw Error('扩展启用范围已变化，请重新点击移除并确认受影响实例');
  const stopped=[];
  for(const id of users){const runtime=controller.runtimes.get(id);if(runtime&&(runtime.status!=='stopped'||runtime.view||runtime.loadedExtensions?.has(key))){await controller.stopInner(id);stopped.push(controller.store.list().find(x=>x.id===id)?.name||id);}}
  // Any unload failure above leaves the package and bindings intact.
  const result=catalog.remove(key,{disableAll:true});controller.extensions.forget(key);
  controller.workspace.log('application',`扩展「${row.name}」已移除；实例及扩展存储保留`+(result.cleanupPending?'；程序临时副本未能清理':''),result.cleanupPending?'WARN':'INFO');controller.emit();
  return {...result,stopped};
 }
 return lock(0);
}
module.exports={removeExtension};
