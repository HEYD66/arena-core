'use strict';
let appUpdateState={supported:false,status:'loading',currentVersion:'',version:null,progress:0,error:'',restart:true};
let openingUpdateReminder=false;
const shownUpdateNotices=new Set();
function paintUpdateNotice(){
 const u=appUpdateState,available=!!u.version&&['available','downloading','downloaded'].includes(u.status);
 const badge=document.getElementById('updateAvailable');if(badge)badge.hidden=!available;
 if(!available||!u.reminderVersion||shownUpdateNotices.has(u.reminderVersion)||openingUpdateReminder||document.visibilityState!=='visible'||typeof modal!=='undefined'&&modal||!window.facet)return;
 const version=u.reminderVersion;openingUpdateReminder=true;
 window.facet.request('update-reminder-open',{version}).then(async result=>{
  if(!result.ok)throw Error(result.error);
  if(result.value?.shown)shownUpdateNotices.add(version);
  if(result.value?.shown&&result.value.response===0){
   await route('global');document.getElementById('appUpdates')?.scrollIntoView({block:'start'});
   if(appUpdateState.version!==version)return;
   if(['available','error'].includes(appUpdateState.status))acceptUpdateState(await request('update-download'));
   if(appUpdateState.status==='downloaded')confirmUpdateInstall();
  }
 }).catch(error=>toast(error.message)).finally(()=>{openingUpdateReminder=false;});
}
function acceptUpdateState(value){appUpdateState=value;paintUpdateCard();paintUpdateNotice();}
function updateCardHTML(){
 const u=appUpdateState,busy=['loading','checking','downloading','installing'].includes(u.status);
 const labels={loading:'正在读取更新信息…',idle:'点击检查 GitHub Releases 中的最新版本',checking:'正在检查更新…',current:'当前已是最新版本',available:`发现新版本 v${u.version}`,downloading:`正在下载：${Math.round(u.progress)}%`,downloaded:`v${u.version} 已下载并通过校验`,installing:'正在停止实例，随后退出并安装…',unsupported:'当前运行方式不支持在线更新',error:'更新未完成'};
 const canDownload=u.supported&&u.version&&['available','error'].includes(u.status);
 return `<section class="settings-card full" id="appUpdates"><h3>${icon('download')}软件更新</h3><div class="inner"><div class="update-controls"><div><p>当前版本：v${esc(u.currentVersion||state.versions?.app||'—')}</p><p class="update-status" role="status" aria-live="polite">${esc(labels[u.status]||'等待检查')}</p></div><div class="update-buttons"><button class="btn subtle" id="updateCheck" data-update-action="check" ${!u.supported||busy||u.status==='downloaded'?'disabled':''}>检查更新</button>${canDownload?'<button class="btn primary" id="updateDownload" data-update-action="download">下载新版</button>':''}${u.status==='downloaded'?'<button class="btn primary" id="updateInstall" data-update-action="confirm">退出并更新</button>':''}</div></div>${u.status==='downloading'?`<progress class="update-progress" max="100" value="${u.progress}" aria-label="更新下载进度"></progress>`:''}${u.error?`<p class="update-error" role="alert">${esc(u.error)}</p>`:''}<p class="actions-note">启动后检查一次，之后每 30 分钟检查更新；同一新版只弹窗提醒一次。点击“立即更新”开始下载，校验通过后确认退出安装，保留实例配置、登录资料和扩展。</p></div></section>`;
}
function paintUpdateCard(){const old=document.getElementById('appUpdates');if(old)old.outerHTML=updateCardHTML();}
function confirmUpdateInstall(){
 if(appUpdateState.status!=='downloaded'||modal)return;
 lastFocus=document.activeElement;modal={type:'update-install',busy:false};
 const count=state.instances.filter(x=>['running','starting'].includes(x.status)).length;
 document.getElementById('modal').innerHTML=`<div class="modal-head"><h2 id="modalTitle">确认退出并更新到 v${esc(appUpdateState.version)}？</h2><button class="icon-btn" data-action="modal-close" aria-label="取消">×</button></div><p class="description">${count?`将正常停止 ${count} 个运行或启动中的实例，然后退出并安装新版。`:'将退出应用并安装新版。'}配置、登录资料和扩展会保留。</p><p>${appUpdateState.restart?'安装完成后会重新打开应用，实例按“随应用启动”设置启动。':'你使用了自定义数据目录，安装后请通过原入口启动应用。'}</p><p id="updateInstallError" class="error" role="alert"></p><div class="modal-actions"><button class="btn subtle" data-action="modal-close">取消</button><button class="btn primary" data-update-action="install">确认退出并更新</button></div>`;
 document.getElementById('modalBackdrop').hidden=false;layout();document.querySelector('#modal [data-action="modal-close"]').focus();
}
document.addEventListener('DOMContentLoaded',()=>{
 const badge=document.createElement('button');badge.id='updateAvailable';badge.className='btn subtle update-available';badge.hidden=true;badge.type='button';badge.dataset.updateAction='view';badge.textContent='有更新';document.querySelector('.top-actions').prepend(badge);
 if(!window.facet){appUpdateState={...appUpdateState,status:'unsupported',error:'浏览器预览不能执行在线更新'};paintUpdateCard();return;}
 window.facet.onUpdate?.(acceptUpdateState);
 window.facet.request('update-status').then(result=>{if(!result.ok)throw Error(result.error);acceptUpdateState(result.value);}).catch(error=>{appUpdateState={...appUpdateState,status:'error',error:error.message};paintUpdateCard();});
});
document.addEventListener('visibilitychange',paintUpdateNotice);
window.addEventListener('focus',paintUpdateNotice);
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-update-action]');if(!button||button.disabled)return;
 const action=button.dataset.updateAction;if(action==='confirm'){confirmUpdateInstall();return;}
 if(action==='view'){await route('global');document.getElementById('appUpdates')?.scrollIntoView({block:'start'});return;}
 if(action==='install'&&modal?.type!=='update-install')return;
 button.disabled=true;
 if(action==='install'){modal.busy=true;document.querySelectorAll('#modal [data-action="modal-close"]').forEach(b=>b.disabled=true);}
 try{
  const value=await request('update-'+action,action==='install'?{confirmed:true}:{});
  acceptUpdateState(value);
 }catch(error){
  if(action==='install'&&modal?.type==='update-install'){modal.busy=false;document.getElementById('updateInstallError').textContent=error.message;document.querySelectorAll('#modal button').forEach(b=>b.disabled=false);}
  else toast(error.message);
 }finally{if(button.isConnected&&action!=='install')button.disabled=false;}
});
