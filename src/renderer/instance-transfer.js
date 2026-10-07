'use strict';
let transferDraft=null,seenTransferOutcome='';
function transferModal(type,title,body){
 if(modal){toast('请先完成或关闭当前窗口');return false;}
 lastFocus=document.activeElement;rememberModalFocus();modal={type};
 $('#modal').innerHTML=`<div class="modal-head"><h2 id="modalTitle">${esc(title)}</h2><button class="icon-btn" data-action="modal-close" aria-label="关闭">×</button></div>${body}<p id="transferError" class="error" role="alert"></p>`;
 $('#modalBackdrop').hidden=false;layout();requestAnimationFrame(()=>$('#modal textarea,#modal input,#modal select,#modal button')?.focus());return true;
}
function showInstanceNotes(id){
 const x=state.instances.find(x=>x.id===id);if(!x)return;
 if(transferModal('instance-notes',x.name+' · 备忘录',`<p class="actions-note">自由记录此实例的用途、待办和提醒。保存立即生效，不会停止实例；导出备份时一起保留。</p><label class="field"><span>实例备注</span><textarea id="instanceNotes" rows="12" maxlength="10000" placeholder="写下这个实例的备忘录…">${esc(x.notes||'')}</textarea></label><p class="actions-note" id="notesCount">${(x.notes||'').length} / 10000</p><div class="modal-actions"><button class="btn subtle" data-action="modal-close">取消</button><button class="btn primary" data-transfer="save-notes">保存备注</button></div>`))modal.id=id;
}
function showExport(ids){
 const names=ids.map(id=>state.instances.find(x=>x.id===id)?.name||'实例');
 if(transferModal('instance-export','导出实例',`<section class="transfer-export-summary"><strong>已选择 ${ids.length} 个实例</strong><p>${names.map(esc).join('、')}</p></section><p class="transfer-export-description">包含登录状态、网站数据、环境配置和备注。</p><label class="transfer-export-option"><input id="transferDeleteAfterExport" type="checkbox"><span>导出成功后删除原实例</span></label><p class="actions-note">导出时暂时停止所选实例，其他实例继续运行。请先保存网页内未提交内容。</p><p class="actions-note transfer-security">备份含登录资料，请妥善保管。</p><details class="transfer-export-details"><summary>详细说明</summary><p>备份写完并校验通过后才执行删除。未勾选删除时，完成后恢复原运行状态。导出失败保留原实例，并尝试恢复运行；删除失败会说明保留或待清理状态。</p><p>不导出插件、原代理凭据、浏览器保存的密码或未提交内容。出口国家使用已有记录，不重新联网检测。导入时可重新选择代理。</p><p>备份没有密码保护，仅导入可信文件。两端需使用相同系统和浏览器版本，网站可能要求重新验证登录。</p></details><p id="transferProgressLine" class="transfer-progress" role="status" aria-live="polite" hidden></p><div class="modal-actions"><button class="btn subtle" data-action="modal-close">取消</button><button class="btn primary" data-transfer="export-commit">选择位置并导出</button></div>`))modal.ids=ids;
}
function showExportResult(value){transferModal('instance-export-result','导出完成',`<p>${esc(value.message)}</p><p class="transfer-result-path">${esc(value.destination)}</p><div class="modal-actions"><button class="btn" data-transfer="reveal-export">打开文件位置</button><button class="btn primary" data-action="modal-close">完成</button></div>`);}
function showImportFile(){return transferModal('instance-import-file','导入实例备份',`<p class="actions-note">选择备份后会显示原出口国家，并让你为每个实例重新选择代理；导入为新实例，保留已有数据。</p><p class="guide">备份文件包含登录资料，没有密码保护。请妥善保存并仅导入可信文件。</p><div class="modal-actions"><button class="btn subtle" data-action="modal-close">取消</button><button class="btn primary" data-transfer="inspect">选择备份文件</button></div>`);}
function showImportChoices(draft){
 modal.type='instance-import-choices';transferDraft=draft;
 $('#modal').innerHTML=`<div class="modal-head"><h2 id="modalTitle">选择导入实例的代理</h2><button class="icon-btn" data-transfer="cancel-import" aria-label="关闭">×</button></div><p class="actions-note">${draft.instances.length} 个实例；名称重复会自动添加后缀。原指纹与备注保留，插件不恢复。导入完成后保持停止，请手动启动。更换设备或 IP 后，网站可能要求重新登录。</p><div class="transfer-choices">${draft.instances.map((x,i)=>`<section class="transfer-instance"><h3>${esc(x.name)}</h3><p class="transfer-country">之前的出口国家：<b>${esc(x.previousExit.country||x.previousExit.countryCode||'未知')}</b>${x.previousExit.ip?` · ${esc(x.previousExit.ip)}`:''}</p><p class="actions-note">${x.previousExit.queriedAt?'检测时间：'+esc(new Date(x.previousExit.queriedAt).toLocaleString())+'，此信息不是实时状态':'没有可用检测记录'}</p><details><summary>备注（${x.notes.length} 字）</summary><pre class="transfer-notes">${esc(x.notes||'暂无备注')}</pre></details><label class="field"><span>导入后使用的网络出口</span><select data-transfer-node="${i}"><option value="">请选择代理或明确选择直连</option><option value="direct">本机 IP 直连</option>${draft.nodes.map((n,k)=>`<option value="${k}">${esc(n.sourceName+' · '+n.name+(n.country?' · '+n.country:'')+(n.available?' · 检测可用':n.tested?' · 最近检测失败':' · 未检测'))}</option>`).join('')}</select></label><label><input type="checkbox" data-transfer-locale="${i}"> 按新出口 IP 同步时区和语言（导入后同步，失败保留原设置）</label></section>`).join('')}</div><p id="transferError" class="error" role="alert"></p><div class="modal-actions"><button class="btn subtle" data-transfer="cancel-import">取消</button><button class="btn primary" data-transfer="import-commit">导入为新实例</button></div>`;
 layout();
}
async function cancelTransferDraft(){if(transferDraft){const token=transferDraft.token;transferDraft=null;await request('instance-import-cancel',{token});}}
// The shared modal can also close through Escape/backdrop; release import staging promptly.
const closeBeforeTransfer=closeModal;
closeModal=function(force=false){const before=modal;const result=closeBeforeTransfer(force);if(before&&!modal&&transferDraft)cancelTransferDraft().catch(()=>{});return result;};
document.addEventListener('input',event=>{if(event.target.id==='instanceNotes')$('#notesCount').textContent=event.target.value.length+' / 10000';});
document.addEventListener('click',async event=>{
 const b=event.target.closest('[data-transfer]');if(!b||b.disabled)return;const action=b.dataset.transfer;
 if(action==='notes'){showInstanceNotes(b.dataset.id||activeId);return;}
 if(action==='export'){showExport([b.dataset.id]);return;}
 if(action==='export-many'){showExport([...selected]);return;}
 if(action==='import'){if(showImportFile())$('#modal [data-transfer="inspect"]').click();return;}
 if(action==='reveal-export'){await request('instance-export-reveal');return;}
 if(!modal||modal.busy)return;const target=modal;target.busy=true;
 const inputs=[...$('#modal').querySelectorAll('button,input,select,textarea')];inputs.forEach(x=>x.disabled=true);
 const label=b.textContent;b.textContent='处理中…';$('#transferError').textContent='';
 try{
  if(action==='save-notes'){await request('instance-notes',{id:target.id,notes:$('#instanceNotes').value});closeModal(true);render(true);toast('备注已保存');}
  else if(action==='export-commit'){
   $('#transferProgressLine').hidden=false;$('#transferProgressLine').textContent='正在选择保存位置…';
   const value=await request('instance-export',{ids:target.ids,deleteAfterExport:$('#transferDeleteAfterExport').checked});
   if(value?.status==='success'){closeModal(true);await route('overview');render(true);showExportResult(value);}else if(value?.cancelled){$('#transferProgressLine').hidden=true;toast('已取消导出');}
  }else if(action==='inspect'){
   const value=await request('instance-import-inspect');if(!value?.cancelled)showImportChoices(value);else closeModal(true);
  }else if(action==='cancel-import'){await cancelTransferDraft();closeModal(true);}
  else if(action==='import-commit'){
   const draft=transferDraft,selections=draft.instances.map((x,i)=>{const value=$(`[data-transfer-node="${i}"]`).value;if(value==='')throw Error('请为「'+x.name+'」选择代理或直连');const node=draft.nodes[Number(value)];return {mode:value==='direct'?'direct':'mihomo',sourceId:node?.sourceId,nodeName:node?.name,syncLocale:$(`[data-transfer-locale="${i}"]`).checked};});
   const value=await request('instance-import-commit',{token:draft.token,selections});transferDraft=null;closeModal(true);await route('overview');render(true);toast(`已导入 ${value.count} 个实例，备注已恢复；请手动启动`);if(value.warning||value.localeWarnings?.length)transferModal('instance-import-result','实例已导入',`<p>已导入 ${value.count} 个实例，Cookie、网站存储和备注已保留。</p>${value.warning?`<p class="guide">${esc(value.warning)}</p>`:''}<ul class="transfer-warning-list">${(value.localeWarnings||[]).map(x=>`<li><b>${esc(x.name)}</b>：${esc(x.message)}</li>`).join('')}</ul><div class="modal-actions"><button class="btn primary" data-action="modal-close">完成</button></div>`);
  }
 }catch(error){if(modal===target)$('#transferError').textContent=error.message;else toast(error.message);}
 finally{target.busy=false;if(modal===target){inputs.filter(x=>x.isConnected).forEach(x=>x.disabled=false);if(b.isConnected)b.textContent=label;if($('#transferProgressLine')&&!state.transferProgress?.running)$('#transferProgressLine').hidden=true;}}
});
function showTransferOutcome(){const value=state.transferOutcome;if(!value||seenTransferOutcome===value.at)return;seenTransferOutcome=value.at;toast(value.message+(value.status==='success'?'：'+value.destination:''));}
const transferRender=render;render=function(...args){const result=transferRender(...args);showTransferOutcome();const progress=state.transferProgress,line=$('#transferProgressLine');if(line&&progress?.running){line.hidden=false;line.textContent=progress.phase+' · '+progress.done+' / '+progress.total;}return result;};
