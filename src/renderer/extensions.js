'use strict';
// 扩展中心（以扩展为主）+ 浏览页地址栏右侧的扩展图标与拼图菜单。
// 启用/停用会停止目标实例：先勾选，再在同一条待应用栏里一次确认。
let extensionConfirm=null,extensionBusy=false,extensionTargetId=null,extensionMenuFor=null;
const extensionPending=new Map();// extensionId -> Map(instanceId -> enabled)

function extensionInfo(row,id){return row.instances.find(i=>i.id===id)||{enabled:false,loaded:false,error:''};}
function extensionIconHTML(row,cls='ext-icon'){const letter=esc((row.name.trim()[0]||'?').toUpperCase());return row.icon?`<img class="${cls}" src="${esc(row.icon)}" alt="" draggable="false">`:`<span class="${cls} ext-letter" aria-hidden="true">${letter}</span>`;}
function extensionWanted(row,id){const p=extensionPending.get(row.id);return p?.has(id)?p.get(id):extensionInfo(row,id).enabled;}
function extensionChangeList(row){const p=extensionPending.get(row.id);if(!p)return [];return [...p].map(([id,enabled])=>({id,enabled,instance:state.instances.find(x=>x.id===id)})).filter(x=>x.instance);}
function pruneExtensionPending(){for(const [key,p] of extensionPending){const row=(state.extensions||[]).find(x=>x.id===key);if(!row){extensionPending.delete(key);continue;}for(const [id,enabled] of p){if(!state.instances.some(x=>x.id===id)||extensionInfo(row,id).enabled===enabled)p.delete(id);}if(!p.size)extensionPending.delete(key);}}

function extensionCard(row){
 const instances=state.instances||[],used=row.instances.filter(i=>i.enabled),changes=extensionChangeList(row);
 const chips=instances.map(inst=>{const info=extensionInfo(row,inst.id),on=extensionWanted(row,inst.id),changed=on!==info.enabled;const state_=info.error?'error':info.loaded?'loaded':info.enabled?'waiting':'off';const hint=info.error?info.error:info.loaded?'已加载':info.enabled?`已启用 · 等待启动（${statusText(inst)}）`:'未启用';
  return `<button type="button" class="ext-chip ${on?'on':''} ${changed?'changed':''}" aria-pressed="${on}" data-extension="toggle" data-extension-id="${esc(row.id)}" data-instance-id="${esc(inst.id)}" title="${esc(inst.name)} · ${esc(changed?(on?'待启用':'待停用'):hint)}"><span class="ext-check" aria-hidden="true">${on?'✓':''}</span><span class="ext-chip-name">${esc(inst.name)}</span><i class="ext-state ${state_}" aria-hidden="true"></i></button>`;}).join('');
 const running=changes.filter(x=>x.instance.status==='running'||x.instance.status==='starting');
 const pending=changes.length?`<div class="ext-pending" role="group" aria-label="待应用的更改"><div><strong>${changes.filter(x=>x.enabled).length?'将启用：'+changes.filter(x=>x.enabled).map(x=>esc(x.instance.name)).join('、'):''}${changes.filter(x=>x.enabled).length&&changes.filter(x=>!x.enabled).length?'；':''}${changes.filter(x=>!x.enabled).length?'将停用：'+changes.filter(x=>!x.enabled).map(x=>esc(x.instance.name)).join('、'):''}</strong><small>${running.length?`会停止运行中的 ${running.map(x=>esc(x.instance.name)).join('、')}，`:'涉及的实例都未运行，'}保存后需手动启动；其他实例不受影响。</small></div><div class="subscription-actions"><button class="btn subtle tiny" data-extension="cancel" data-extension-id="${esc(row.id)}" ${extensionBusy?'disabled':''}>撤销</button><button class="btn primary tiny" data-extension="confirm" data-mode="apply" data-extension-id="${esc(row.id)}" ${extensionBusy?'disabled':''}>${extensionBusy?'正在应用…':'应用更改（'+changes.length+'）'}</button></div></div>`:'';
 const loaded=instances.filter(inst=>extensionInfo(row,inst.id).loaded&&inst.status==='running');
 const panels=loaded.length&&(row.entries.popup||row.entries.options)?`<div class="ext-loaded"><span class="ext-label">已加载</span>${loaded.map(inst=>`<span class="ext-open-group"><b>${esc(inst.name)}</b>${[['popup','面板'],['options','设置']].filter(([k])=>row.entries[k]).map(([k,label])=>`<button class="btn subtle tiny" data-extension="open" data-extension-id="${esc(row.id)}" data-instance-id="${esc(inst.id)}" data-kind="${k}">${label}</button>`).join('')}</span>`).join('')}</div>`:'';
 const errors=instances.map(inst=>({inst,info:extensionInfo(row,inst.id)})).filter(x=>x.info.error).map(x=>`<p class="extension-error">${esc(x.inst.name)}：${esc(x.info.error)}</p>`).join('');
 const removing=extensionConfirm?.action==='extension-remove'&&extensionConfirm.payload.extensionId===row.id;
 return `<article class="ext-card" data-extension-card="${esc(row.id)}"><div class="ext-card-head">${extensionIconHTML(row)}<div class="ext-title"><h4>${esc(row.name)}</h4><small>${esc(row.version)} · MV${row.manifestVersion} · ${Math.max(1,Math.round(row.bytes/1024))} KB · 已启用 ${used.length}/${instances.length} 个实例</small></div><button class="btn ghost tiny ext-refresh" data-extension="refresh" data-extension-id="${esc(row.id)}" ${extensionBusy?'disabled':''} title="${row.source?esc('从原文件夹重新读取并检查新版本：'+row.source):'选择原解压文件夹并检查新版本（之后会记住位置）'}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>刷新</button><button class="btn danger tiny" data-extension="remove" data-extension-id="${esc(row.id)}" ${used.length||extensionBusy?'disabled':''} title="${used.length?'请先在所有实例中停用':'移除扩展程序文件'}">移除</button></div>${row.compatibilityNotice?`<p class="extension-error">${esc(row.compatibilityNotice)}</p>`:''}
  <div class="ext-instances"><span class="ext-label">启用于</span><div class="ext-chips">${chips||'<span class="library-muted">还没有实例</span>'}</div></div>${pending}${removing?`<div class="ext-pending danger"><div><strong>${esc(extensionConfirm.text)}</strong></div><div class="subscription-actions"><button class="btn subtle tiny" data-extension="cancel">取消</button><button class="btn danger tiny" data-extension="confirm" ${extensionBusy?'disabled':''}>确认移除</button></div></div>`:''}${panels}${errors}
  <details class="ext-details"><summary>权限、范围与兼容性提示</summary><p>声明权限：${esc(row.permissions.join('、')||'无')}</p><p>可选权限：${esc(row.optionalPermissions.join('、')||'无')}</p><p>内容脚本范围：${esc(row.matches.join('、')||'无')}</p>${(row.warnings||[]).map(w=>`<p>${esc(w)}</p>`).join('')}</details></article>`;
}
function extensionPage(){
 pruneExtensionPending();
 const rows=state.extensions||[],focus=document.activeElement,key=focus?.dataset?.extension?[focus.dataset.extension,focus.dataset.extensionId||'',focus.dataset.instanceId||'',focus.dataset.kind||'']:null;
 $('#content').innerHTML=`<section class="settings-card extension-center"><div class="ext-center-head"><div><h3>${icon('box')} 扩展中心</h3><p>导入本地解压扩展，勾选要启用的实例后点「应用更改」。每个实例独立存储、沿用该实例的网络；更改会停止目标实例，需手动启动。仅支持部分 Chrome 扩展 API，不支持商店和 CRX 直装。</p></div><button class="btn primary" data-extension="import" ${extensionBusy?'disabled':''}>${icon('plus')} 导入解压扩展</button></div>
  <div class="ext-list">${rows.map(extensionCard).join('')||'<div class="empty-list">尚未导入扩展。选择包含 manifest.json 的文件夹开始，导入后在这里勾选要启用的实例。</div>'}</div><p class="actions-note">只安装可信来源。扩展可读取或修改其权限范围内的网页；停用后重启可清除残留内容脚本，扩展已保存的数据会保留。</p></section>`;
 if(key){const el=[...document.querySelectorAll('#content [data-extension]')].find(b=>b.dataset.extension===key[0]&&(b.dataset.extensionId||'')===key[1]&&(b.dataset.instanceId||'')===key[2]&&(b.dataset.kind||'')===key[3]);if(el&&!el.disabled)el.focus({preventScroll:true});}
}

// 浏览页：地址栏右侧的扩展图标 + 拼图按钮。
function extensionToolbarHTML(x){
 const enabled=(state.extensions||[]).filter(row=>extensionInfo(row,x.id).enabled);
 const icons=enabled.map(row=>{const info=extensionInfo(row,x.id),kind=row.entries.popup?'popup':row.entries.options?'options':'';const ready=info.loaded&&x.status==='running';const tip=info.error?`${row.name} · ${info.error}`:ready?(kind?`${row.name} · 点击打开${kind==='popup'?'面板':'设置'}`:`${row.name} · 已加载（无面板）`):`${row.name} · 等待实例启动`;
  return `<button type="button" class="ext-tool ${ready?'':'idle'} ${info.error?'error':''}" data-extension="open" data-extension-id="${esc(row.id)}" data-instance-id="${esc(x.id)}" data-kind="${kind}" title="${esc(tip)}" aria-label="${esc(tip)}">${extensionIconHTML(row,'ext-tool-icon')}${info.error?'<b class="ext-badge">!</b>':''}</button>`;}).join('');
 return `<div class="ext-toolbar" role="toolbar" aria-label="此实例的扩展">${icons}<button type="button" class="ext-tool ext-puzzle" data-extension="menu" data-instance-id="${esc(x.id)}" aria-haspopup="dialog" aria-expanded="${extensionMenuFor===x.id}" title="扩展" aria-label="扩展菜单">${extensionPuzzleSVG()}</button></div>`;
}
function extensionPuzzleSVG(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3.5a2 2 0 0 1 4 0V5h3.5A1.5 1.5 0 0 1 19 6.5V10h-1.5a2 2 0 0 0 0 4H19v3.5a1.5 1.5 0 0 1-1.5 1.5H14v-1.5a2 2 0 0 0-4 0V19H6.5A1.5 1.5 0 0 1 5 17.5V14h1.5a2 2 0 0 0 0-4H5V6.5A1.5 1.5 0 0 1 6.5 5H10z"/></svg>';}
function extensionMenuDialog(){let d=document.getElementById('extensionMenu');if(!d){d=document.createElement('dialog');d.id='extensionMenu';d.className='ext-menu';d.setAttribute('data-browser-overlay','');d.setAttribute('aria-label','此实例的扩展');document.body.append(d);}return d;}
function renderExtensionMenu(){
 const d=document.getElementById('extensionMenu');if(!d?.open)return;const x=state.instances.find(i=>i.id===extensionMenuFor);if(!x||view!=='browser'||x.id!==activeId){closeExtensionMenu();return;}
 const rows=state.extensions||[],enabled=rows.filter(row=>extensionInfo(row,x.id).enabled),others=rows.length-enabled.length;
 d.innerHTML=`<header><strong>扩展</strong><small>${esc(x.name)}</small></header>${enabled.length?`<ul>${enabled.map(row=>{const info=extensionInfo(row,x.id),ready=info.loaded&&x.status==='running';return `<li>${extensionIconHTML(row,'ext-menu-icon')}<div><b>${esc(row.name)}</b><small class="${info.error?'extension-error':''}">${esc(info.error||(ready?'已加载':'等待实例启动'))}</small></div><span class="subscription-actions">${[['popup','面板'],['options','设置']].filter(([k])=>row.entries[k]).map(([k,label])=>`<button class="btn subtle tiny" data-extension="open" data-extension-id="${esc(row.id)}" data-instance-id="${esc(x.id)}" data-kind="${k}" ${ready?'':'disabled'}>${label}</button>`).join('')}</span></li>`;}).join('')}</ul>`:'<p class="ext-menu-empty">此实例还没有启用扩展。</p>'}${x.status!=='running'&&enabled.length?'<p class="ext-menu-note">扩展随实例启动加载；启动后可打开面板和设置。</p>':''}<footer>${others?`<small>另有 ${others} 个扩展未在此实例启用</small>`:'<small></small>'}<button class="btn soft tiny" data-view="extensions">${icon('box')}扩展中心</button></footer>`;
}
function positionExtensionMenu(){const d=document.getElementById('extensionMenu'),b=$('.ext-puzzle');if(!d?.open||!b)return;const r=b.getBoundingClientRect(),w=Math.min(340,innerWidth-16);d.style.width=w+'px';d.style.left=Math.max(8,Math.min(r.right-w,innerWidth-w-8))+'px';d.style.top=(r.bottom+6)+'px';}
function openExtensionMenu(id){const d=extensionMenuDialog();extensionMenuFor=id;if(!d.open)d.show();renderExtensionMenu();positionExtensionMenu();layout();$('.ext-puzzle')?.setAttribute('aria-expanded','true');(d.querySelector('button:not([disabled])'))?.focus();}
function closeExtensionMenu(returnFocus=false){const d=document.getElementById('extensionMenu');const was=d?.open;extensionMenuFor=null;if(was)d.close();$('.ext-puzzle')?.setAttribute('aria-expanded','false');if(was){layout();if(returnFocus)$('.ext-puzzle')?.focus();}}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('extensionMenu')?.open){e.preventDefault();e.stopPropagation();closeExtensionMenu(true);}},true);
document.addEventListener('mousedown',e=>{const d=document.getElementById('extensionMenu');if(d?.open&&!d.contains(e.target)&&!e.target.closest('.ext-puzzle'))closeExtensionMenu();},true);
window.addEventListener('resize',positionExtensionMenu);

document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-extension]');
 if(!b||b.disabled)return;
 const action=b.dataset.extension;
 if(action==='menu'){if(extensionMenuFor===b.dataset.instanceId&&document.getElementById('extensionMenu')?.open)closeExtensionMenu(true);else openExtensionMenu(b.dataset.instanceId);return;}
 if(b.closest('#extensionMenu')&&action!=='open')return;
 if(extensionBusy)return;
 const row=(state.extensions||[]).find(x=>x.id===b.dataset.extensionId);
 const instanceId=b.dataset.instanceId||extensionTargetId||activeId;
 const targetInstance=state.instances.find(x=>x.id===instanceId);
 if(action==='cancel'){if(row)extensionPending.delete(row.id);extensionConfirm=null;extensionTargetId=null;extensionPage();return;}
 if(action==='toggle'&&row&&targetInstance){extensionConfirm=null;const p=extensionPending.get(row.id)||new Map(),next=!extensionWanted(row,targetInstance.id);if(next===extensionInfo(row,targetInstance.id).enabled)p.delete(targetInstance.id);else p.set(targetInstance.id,next);if(p.size)extensionPending.set(row.id,p);else extensionPending.delete(row.id);extensionPage();return;}
 if(action==='remove'&&row){extensionPending.delete(row.id);extensionConfirm={action:'extension-remove',payload:{extensionId:row.id,confirmed:true},text:`移除「${row.name}」的程序文件？不会清除实例登录数据或扩展已保存的数据。`};extensionPage();return;}
 if(action==='open'){
  if(!row||!targetInstance)return;const info=extensionInfo(row,targetInstance.id),kind=b.dataset.kind;
  if(info.error){toast(`「${row.name}」加载失败：${info.error}`);return;}
  if(!info.loaded||targetInstance.status!=='running'){toast(`请先启动「${targetInstance.name}」，扩展会随实例加载`);return;}
  if(!kind){toast(`「${row.name}」没有面板或设置页，已在网页中自动运行`);return;}
  closeExtensionMenu();
  try{await request('extension-open',{id:targetInstance.id,extensionId:row.id,kind});}catch(err){toast(err.message);}
  return;
 }
 if(action==='confirm'&&b.dataset.mode==='apply'&&row){
  const changes=extensionChangeList(row);if(!changes.length)return;extensionBusy=true;extensionPage();const failed=[];
  for(const change of changes){try{await request('extension-configure',{id:change.id,extensionId:row.id,enabled:change.enabled,confirmed:true});extensionPending.get(row.id)?.delete(change.id);}catch(err){failed.push(`${change.instance.name}：${err.message}`);}}
  if(!extensionPending.get(row.id)?.size)extensionPending.delete(row.id);
  try{state=await request('snapshot');}catch{}
  extensionBusy=false;toast(failed.length?'部分实例未能保存：'+failed.join('；'):`已保存「${row.name}」的启用范围；相关实例需手动启动`);if(view==='extensions')extensionPage();else render(true);return;
 }
 if(action==='refresh'&&row){extensionBusy=true;extensionPage();
  try{const r=await request('extension-refresh',{extensionId:row.id});if(r?.unchanged)toast(`「${row.name}」已是最新（${r.version}），原文件夹没有变化`);else if(r?.updated)toast(`已更新「${row.name}」${r.from} → ${r.version}`+(r.stopped?.length?`；已停止 ${r.stopped.join('、')}，请手动启动`:''));state=await request('snapshot');}
  catch(err){toast(err.message);}
  finally{extensionBusy=false;if(view==='extensions')extensionPage();else render(true);}
  return;}
 let op,payload={};
 if(action==='import')op='extension-import';
 else if(action==='confirm'&&extensionConfirm){op=extensionConfirm.action;payload=extensionConfirm.payload;}
 else return;
 extensionBusy=true;
 if(view==='extensions')extensionPage();
 try{await request(op,payload);extensionConfirm=null;extensionTargetId=null;state=await request('snapshot');}
 catch(err){toast(err.message);}
 finally{extensionBusy=false;if(view==='extensions')extensionPage();else if(view==='browser')render(true);}
});
