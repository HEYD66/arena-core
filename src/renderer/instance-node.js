'use strict';
function mountInstanceNodeActions(){
 const link=$('#environmentForm [data-view="proxies"]');if(!link)return;
 const actions=document.createElement('div');actions.className='subscription-actions';link.replaceWith(actions);actions.append(link);
 actions.insertAdjacentHTML('beforeend','<button class="btn soft" type="button" data-instance-node="latency">测延迟</button><button class="btn soft" type="button" data-instance-node="ip">测 IP</button><button class="btn soft" type="button" data-instance-node="speed">测速</button><button class="btn" type="button" data-instance-node="change">更换节点</button>');
 const results=document.createElement('div');results.id='instanceNodeResults';results.className='instance-node-results';results.setAttribute('role','status');actions.after(results);renderInstanceNodeActions();
}
function renderInstanceNodeActions(){
 const root=$('#instanceNodeResults'),x=current();if(!root||!x)return;
 syncDiagnosticHistory();
 const name=$('#proxyNodeName')?.value||'',key=x.nodeDiagnosticKeys?.[name],job=state.diagnostics?.job;
 root.previousElementSibling.querySelectorAll('[data-instance-node]').forEach(b=>{b.disabled=b.dataset.instanceNode==='change'?savingEnvironments.has(x.id):!key||!!job;});
 const rows=['latency','ip','speed'].map(kind=>{
  const queued=job?.kind===kind&&job.items?.find(i=>i.sourceId===key&&i.name===name);
  const {r,saved}=key?nodeOutcome(key,name,kind):{r:null,saved:false};
  let text='尚未检测';if(queued&&['queued','running'].includes(queued.state))text=job.cancelling?'取消中…':queued.state==='queued'?'等待中…':'检测中…';
  else if(r)text=r.ok?(kind==='ip'?r.ip:kind==='latency'?r.latencyMs+' ms':r.mbps+' Mbps'):'失败：'+r.error;
  const detail=r?[new Date(r.at).toLocaleString(),r.provider,r.country,r.region,r.city,r.isp,saved?'上次保存的结果':''].filter(Boolean).join(' · '):'';
  return '<div data-instance-result="'+kind+'"><strong>'+{latency:'延迟',ip:'出口 IP',speed:'下载速度'}[kind]+'</strong><span title="'+esc(detail)+'">'+esc(text)+'</span></div>';
 }).join('');
 root.innerHTML='<p class="actions-note">检测此实例所选节点的已保存副本；临时内核执行，不停止实例。下载测速每次约 5 MB，结果为检测时刻的数据。</p><div class="instance-node-result-grid">'+rows+'</div>'+(job?'<p class="actions-note">检测任务 '+job.done+' / '+job.total+' <button class="btn tiny subtle" type="button" data-instance-node="cancel">取消检测</button></p>':'');
}
function openInstanceNodePicker(){
 const x=current();if(!x)return;captureEnvironmentDraft();openModal('library-confirm',x.id);modal.nodePicker={id:x.id};
 $('#modalTitle').textContent='更换「'+x.name+'」的节点';
 $('#modal .description').textContent='选择实例已有副本或全局节点源。确认后保存网络配置并停止此实例；其他环境草稿保留，其他实例不受影响。';
 $('#modal .description').insertAdjacentHTML('afterend','<label class="field"><span>节点来源</span><select id="instanceNodeSource"><option value="local">实例已有节点副本</option>'+ (state.library||[]).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('')+'</select></label><label class="field"><span>搜索节点</span><input id="instanceNodeSearch" placeholder="节点名称 / 协议"></label><label class="field"><span>选择节点</span><select id="instanceNodeChoice"></select></label><p id="instanceNodePickerNote" class="actions-note"></p>');
 $('#modal .modal-actions').innerHTML='<button class="btn subtle" type="button" data-action="modal-close">取消</button><button class="btn primary" type="button" data-instance-node="apply">更换并停止</button><button class="btn soft" type="button" data-instance-node="apply-restart">更换并重启</button>';
 if(state.library?.some(s=>s.id===x.assignment?.sourceId))$('#instanceNodeSource').value=x.assignment.sourceId;
 renderInstanceNodeChoices();
}
function renderInstanceNodeChoices(){
 const picker=modal?.nodePicker;if(!picker)return;
 const x=state.instances.find(i=>i.id===picker.id),source=$('#instanceNodeSource').value,search=$('#instanceNodeSearch').value.toLowerCase(),previous=$('#instanceNodeChoice').value;
 const nodes=source==='local'?(x?.nodes||[]).map(name=>({name})):(state.library?.find(s=>s.id===source)?.nodes||[]).filter(n=>!n.hint);
 picker.choices=nodes.filter(n=>(n.name+' '+(n.type||'')).toLowerCase().includes(search));
 $('#instanceNodeChoice').innerHTML=picker.choices.map(n=>'<option value="'+esc(n.name)+'">'+esc(n.name)+(n.type?' · '+esc(n.type):'')+'</option>').join('')||'<option value="">没有匹配的可用节点</option>';
 const preferred=previous||x?.network.nodeName;if(picker.choices.some(n=>n.name===preferred))$('#instanceNodeChoice').value=preferred;
 $('#instanceNodePickerNote').textContent=source==='local'?'使用实例已保存的配置。':'将所选节点复制到此实例并切换为代理模式。以后订阅变化不会自动替换实例副本。';
 $('#modal').querySelectorAll('[data-instance-node^="apply"]').forEach(b=>b.disabled=!picker.choices.length);
}
async function applyInstanceNode(restart){
 const picker=modal?.nodePicker;if(!picker||modal.busy)return;
 const name=$('#instanceNodeChoice').value,sourceId=$('#instanceNodeSource').value,id=picker.id;
 if(!picker.choices.some(n=>n.name===name)){toast('请选择有效节点');return;}
 const old=state.instances.find(x=>x.id===id),draft=environmentDrafts.get(id),oldKey=savedEnvironmentKey(old);
 modal.busy=true;$('#modal').querySelectorAll('button,input,select').forEach(b=>b.disabled=true);
 try{
  if(sourceId==='local')await request('instance-node-select',{id,name});
  else await request('library-assign',{id,sourceId,name});
  state=await request('snapshot');const x=state.instances.find(x=>x.id===id);
  // Rebase only the intended network change; preserve pending environment values and any pre-existing conflict.
  if(draft&&draft.base===oldKey){draft.base=savedEnvironmentKey(x);draft.value.network={...x.network};}
  closeModal(true);render(true);toast('节点已保存；当前实例已停止，环境草稿保留');
  if(restart){try{await request('start',{id});toast('节点已更换，当前实例已重新启动');}catch(e){toast('节点已保存，但启动失败：'+e.message);}}
 }catch(e){if(modal?.nodePicker===picker){modal.busy=false;$('#nameError').textContent=e.message;$('#modal').querySelectorAll('button,input,select').forEach(b=>b.disabled=false);renderInstanceNodeChoices();}else toast(e.message);}
}
document.addEventListener('click',async event=>{
 const b=event.target.closest('[data-instance-node]');if(!b||b.disabled)return;
 const action=b.dataset.instanceNode;
 try{
  if(action==='change'){openInstanceNodePicker();return;}
  if(action==='apply'||action==='apply-restart'){await applyInstanceNode(action==='apply-restart');return;}
  if(action==='cancel'){await request('diagnostic-cancel');return;}
  const x=current(),name=$('#proxyNodeName')?.value;if(!x?.nodeDiagnosticKeys?.[name])throw Error('请选择实例已有节点');
  confirmDiagnostic(action,[{instanceId:x.id,name}]);
 }catch(e){toast(e.message);}
});
document.addEventListener('change',event=>{if(event.target.id==='proxyNodeName'||event.target.id==='networkMode')renderInstanceNodeActions();if(event.target.id==='instanceNodeSource')renderInstanceNodeChoices();});
document.addEventListener('input',event=>{if(event.target.id==='instanceNodeSearch')renderInstanceNodeChoices();});
