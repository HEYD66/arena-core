'use strict';
// One launch pass per controller. Recheck each flag when its queued start runs.
function startOnLaunch(controller){
 if(controller.startupWork)return controller.startupWork;
 controller.startupWork=(async()=>{
  if(controller.store.recovered){controller.workspace.log('application','实例配置从备份恢复，本次跳过随应用启动；请核对配置后手动启动','WARN');return {skippedRecovery:true,results:[]};}
  const ids=controller.store.list().filter(x=>x.autoStart===true).map(x=>x.id),results=[];
  if(ids.length)controller.workspace.log('application',`随应用启动：准备依次启动 ${ids.length} 个实例`);
  for(const id of ids){
   if(controller.disposing)break;
   try{const started=await controller.start(id,{autoStart:true});results.push({id,status:started?'started':'skipped'});}
   catch(error){results.push({id,status:'failed'});controller.log(id,'随应用启动失败：'+error.message+'；可修复后手动启动','ERROR');}
  }
  if(ids.length&&!controller.disposing)controller.workspace.log('application',`随应用启动结束：${results.filter(x=>x.status==='started').length} 个就绪，${results.filter(x=>x.status==='failed').length} 个失败，${results.filter(x=>x.status==='skipped').length} 个跳过`);
  return {results,cancelled:controller.disposing};
 })();
 return controller.startupWork;
}
module.exports={startOnLaunch};
