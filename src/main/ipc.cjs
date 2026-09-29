'use strict';
const {ipcMain,dialog,clipboard,shell}=require('electron');const {refreshOne,refreshAll,reveal}=require('./extension-refresh.cjs');const fs=require('node:fs'),path=require('node:path');const {sizeText}=require('./extension-catalog.cjs');
function installIPC(window,controller){
 // 扩展菜单原生浮层：只接受浮层自身页面发来的消息。
 const overlay=new (require('./menu-overlay.cjs').MenuOverlay)(window,message=>{if(!window.isDestroyed()&&!window.webContents.isDestroyed())window.webContents.send('core:overlay',message);});controller.overlay=overlay;
 const onOverlay=(event,message)=>overlay.receive(event.sender,message);ipcMain.on('overlay:event',onOverlay);
 const assignNode=(id,sourceId,name)=>controller.queue(id,async()=>{controller.store.get(id);const node=controller.library.node(sourceId,name);await controller.stopInner(id);controller.store.saveNodes(id,[node],null,{sourceId,name:node.name});controller.store.update(id,{network:{mode:'mihomo',nodeName:node.name}});controller.log(id,'已从全局库分配节点；当前实例已停止，请手动启动');});
 ipcMain.handle('core:request',async(event,message)=>{
  try{if(window.isDestroyed()||controller.disposing)return {ok:false,error:'应用正在关闭'};const controls=window.webContents;if(!controls||controls.isDestroyed())return {ok:false,error:'控制窗口已关闭'};if(event.sender!==controls||event.senderFrame!==controls.mainFrame)throw Error('拒绝非控制界面调用');
  if(!message||typeof message.action!=='string')throw Error('请求无效');const {action,id}=message;
   switch(action){
    case 'fingerprint-preset':return {ok:true,value:require('./environment.cjs').environment(require('./fingerprint.cjs').preset(message.preset,require('./environment.cjs').environment(message.environment)))};
    case 'environment-timezone':return {ok:true,value:await controller.diagnostics.timezone(id,message.network)};
    case 'quick-link-save':controller.workspace.saveQuickLink(message.link||{});controller.emit();break;
    case 'quick-link-remove':controller.workspace.removeQuickLink(message.linkId);controller.emit();break;
    case 'quick-link-move':controller.workspace.moveQuickLink(message.linkId,message.direction);controller.emit();break;
    case 'quick-link-open':await controller.navigate(id,controller.workspace.quickLink(message.linkId).url);break;
    case 'extension-import':return {ok:true,value:await controller.queue('extensions',async()=>{const pick=await dialog.showOpenDialog(window,{title:'选择包含manifest.json的解压扩展文件夹',properties:['openDirectory']});if(pick.canceled)return {cancelled:true};if(controller.disposing)throw Error('应用正在退出');const catalog=controller.extensions.catalog,row=catalog.stage(pick.filePaths[0]);try{const answer=await dialog.showMessageBox(window,{type:'warning',title:'确认导入浏览器扩展',message:row.name+' · '+row.version,detail:'扩展可能读取或修改网页内容。只导入可信来源；导入后默认不启用。\n声明权限：'+row.permissions.join(', ')+'\n可选权限：'+row.optionalPermissions.join(', ')+'\n内容脚本范围：'+row.matches.join(', ')+'\n大小：'+sizeText(row.bytes)+' · '+row.files+' 个文件和目录'+(row.skipped?.length?'\n已跳过开发用文件夹/文件（扩展运行用不到）：'+row.skipped.map(x=>x.name+'（'+sizeText(x.size)+'）').join('、'):'')+'\n'+row.warnings.join('\n'),buttons:['取消','信任并导入'],defaultId:0,cancelId:0,noLink:true});if(answer.response!==1||controller.disposing){catalog.discard(row);return {cancelled:true};}catalog.accept(row);controller.emit();return {id:row.id};}catch(e){catalog.discard(row);throw e;}})};
    case 'extension-refresh':return {ok:true,value:await controller.queue('extensions',()=>refreshOne(controller,window,dialog,message.extensionId))};
    case 'extension-refresh-all':return {ok:true,value:await controller.queue('extensions',()=>refreshAll(controller,window,dialog))};
    case 'extension-reveal':await reveal(controller,shell,message.extensionId);break;
    case 'extension-configure':if(message.confirmed!==true)throw Error('请确认仅停止目标实例后更改扩展');await controller.queue('extensions',()=>controller.extensions.configure(id,message.extensionId,message.enabled));break;
    case 'extension-remove':if(message.confirmed!==true)throw Error('请确认移除扩展');await controller.queue('extensions',()=>controller.extensions.catalog.remove(message.extensionId));controller.emit();break;
    case 'extension-open':await controller.queue(id,()=>controller.extensions.open(id,message.extensionId,message.kind));break;
    case 'snapshot':return {ok:true,value:controller.snapshot()};
    case 'favorite-node':if(!controller.workspace.data.nodes.some(n=>n.sourceId===message.sourceId&&n.name===message.name))controller.library.node(message.sourceId,message.name);controller.workspace.favorite(message.sourceId,message.name);controller.emit();break;
    case 'set-ip-favorite':controller.workspace.setIPFavorite(message.ip,message.selected,message.note);controller.emit();break;
    case 'remove-ips':controller.workspace.removeIPs(message.bookmarkIds);controller.emit();break;
    case 'copy-ips':{const rows=controller.workspace.selectedIPs(message.bookmarkIds);if(!rows.length)throw Error('请先选择IP');await clipboard.writeText(rows.map(x=>x.ip).join('\n'));return {ok:true,value:{count:rows.length}};}
    case 'save-ip':controller.workspace.saveIP(String(message.ip||''),message.note);controller.emit();break;
    case 'remove-ip':controller.workspace.removeIP(message.bookmarkId);controller.emit();break;
    case 'copy-summary':{const value={time:new Date().toISOString(),app:'0.2.0',electron:process.versions.electron,instances:controller.snapshot().instances.map(x=>({id:x.id,status:x.status,network:x.network.mode,page:x.pageState,core:x.coreVersion,environment:{language:x.environment.language,timezone:x.environment.timezone,customUA:!!x.environment.userAgent,customPlatform:!!x.environment.platform},error:require('./workspace.cjs').redact(x.error)})),events:controller.workspace.events.slice(0,100)};await clipboard.writeText(JSON.stringify(value,null,2));return {ok:true,value:{copied:true}};}
    case 'export-logs':{const result=await dialog.showSaveDialog(window,{title:'导出脱敏全局日志',defaultPath:'arena-core-events.json',filters:[{name:'JSON',extensions:['json']}]});if(!result.canceled&&result.filePath)fs.writeFileSync(result.filePath,JSON.stringify(controller.workspace.events,null,2));return {ok:true,value:{cancelled:result.canceled}};}

    case 'library-hint':case 'library-delete-nodes':case 'library-restore-nodes':case 'library-save':case 'library-rename':case 'library-remove':case 'library-file':return {ok:true,value:await controller.queue('global-library',async()=>{
     if(controller.disposing)throw Error('应用正在退出');
     let value;
     if(action==='library-hint')controller.library.toggleHint(message.sourceId,message.name);
     if(action==='library-delete-nodes'){const groups=Array.isArray(message.groups)?message.groups:[{sourceId:message.sourceId,names:message.names}];if(!groups.length||groups.length>30)throw Error('节点源数量无效');for(const g of groups){const src=controller.library.get(g.sourceId);if(!Array.isArray(g.names)||!g.names.length||g.names.some(n=>!src.nodes.some(x=>x.name===n)))throw Error('请选择有效节点');}for(const g of groups)controller.library.removeNodes(g.sourceId,g.names);}
     if(action==='library-restore-nodes')controller.library.restoreNodes(message.sourceId);
     if(action==='library-save')value=await controller.library.save({id:message.sourceId,name:message.name,url:message.url});
     if(action==='library-rename')controller.library.rename(message.sourceId,message.name);
     if(action==='library-remove'){controller.library.remove(message.sourceId);controller.diagnostics.history.clear(message.sourceId);}
     if(action==='library-file'){const picked=await dialog.showOpenDialog(window,{title:'导入到全局代理库',properties:['openFile'],filters:[{name:'Clash YAML / JSON',extensions:['yaml','yml','json']}]});if(picked.canceled)return {cancelled:true};const file=picked.filePaths[0];if(fs.statSync(file).size>2*1024*1024)throw Error('配置文件上限2MB');value=await controller.library.save({name:message.name||'本地节点',text:fs.readFileSync(file,'utf8')});}
     if(!['library-rename','library-hint'].includes(action)){const changed=new Set(Array.isArray(message.groups)?message.groups.map(g=>g.sourceId):[message.sourceId||value]);for(const [key,r]of controller.diagnostics.results)if(changed.has(r.sourceId))controller.diagnostics.results.delete(key);}controller.workspace.log('subscription','节点源操作完成：'+action);controller.emit();return value;
    })};
    case 'library-assign':return {ok:true,value:await assignNode(id,message.sourceId,message.name)};
    // 批量分配：先校验全部实例和节点，任何一项无效都不改动；之后逐个实例（各自排队）停止并写入节点。
    case 'library-assign-many':{const list=Array.isArray(message.assignments)?message.assignments:[];if(!list.length||list.length>15)throw Error('请选择 1–15 个实例');const ids=new Set();const plan=list.map(item=>{const target=String(item?.id||'');if(ids.has(target))throw Error('同一实例不能重复分配');ids.add(target);controller.store.get(target);const sourceId=String(item?.sourceId||message.sourceId||'');return {id:target,sourceId,node:controller.library.node(sourceId,String(item?.name||''))};});
     const results=await Promise.allSettled(plan.map(p=>assignNode(p.id,p.sourceId,p.node.name)));const failed=results.filter(r=>r.status==='rejected').length;controller.workspace.log('subscription',`批量分配节点：${plan.length-failed} 个实例成功${failed?`，${failed} 个失败`:''}；已停止的实例需手动启动`,failed?'WARN':'INFO');controller.emit();if(failed)throw Error(`${failed} 个实例分配失败：`+results.find(r=>r.status==='rejected').reason.message);return {ok:true,value:{count:plan.length}};}
    case 'diagnostic-start':return {ok:true,value:controller.diagnostics.run(message.items,message.kind,message.concurrency??3)};
    case 'diagnostic-history':return {ok:true,value:{version:controller.diagnostics.history.version,rows:controller.diagnostics.history.list()}};
    case 'diagnostic-history-clear':{if(typeof message.sourceId!=='string'||!message.sourceId)throw Error('请选择节点源');const cleared=controller.diagnostics.history.clear(message.sourceId);controller.diagnostics.history.flush();controller.emit();return {ok:true,value:{cleared}};}
    case 'diagnostic-cancel':controller.diagnostics.cancel();break;

    case 'create':{const value=await require('./operations.cjs').createInstance(controller,message);return {ok:true,value:message.detailed?value:value.id};}
    case 'rename':controller.store.update(id,{name:message.name});controller.emit();break;
    case 'activate':controller.choose(id??null);break;
    case 'layout':controller.layout(id,message.bounds);break;
    case 'overlay-show':return {ok:true,value:await overlay.show(message)};
    case 'overlay-hide':overlay.hide('request');return {ok:true};
    case 'browser-snapshot':return {ok:true,value:await controller.capturePageFrame(id)};
    case 'start':await controller.start(id);break;
    case 'stop':await controller.stop(id);break;
    case 'remove':await controller.remove(id);break;
    case 'navigate':await controller.navigate(id,message.url);break;
    case 'back':case 'forward':case 'reload':await controller.action(id,action);break;
    case 'settings':return {ok:true,value:await controller.settings(id,message.patch||{})};
    case 'import-subscription':return {ok:true,value:await controller.importSubscription(id,message.url,false)};
    case 'refresh-subscription':return {ok:true,value:await controller.importSubscription(id,null,true)};
    case 'import':{
     controller.store.get(id);const picked=await dialog.showOpenDialog(window,{title:'导入当前实例的 Clash 节点配置',properties:['openFile'],filters:[{name:'Clash YAML / JSON',extensions:['yaml','yml','json']}]});if(picked.canceled)return {ok:true,value:{cancelled:true}};
     const file=picked.filePaths[0];if(fs.statSync(file).size>2*1024*1024)throw Error('配置文件上限2MB');const text=fs.readFileSync(file,'utf8');const nodes=await controller.queue(id,async()=>{await controller.stopInner(id);const names=controller.store.importNodes(id,text);controller.log(id,`已导入 ${names.length} 个节点；请保存网络模式后启动`);return names;});return {ok:true,value:{nodes}};}
    default:throw Error('不支持的操作');
   }return {ok:true};
  }catch(e){controller.workspace.log('application','操作失败：'+require('./workspace.cjs').redact(e.message),'ERROR');controller.emit();return {ok:false,error:e.message};}finally{controller.flushEmit?.();}
 });
return ()=>{ipcMain.removeHandler('core:request');ipcMain.removeListener('overlay:event',onOverlay);overlay.destroy();};
}
module.exports={installIPC};
