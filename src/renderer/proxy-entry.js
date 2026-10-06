'use strict';
function openProxyEntry(source = null) {
  openModal('library-confirm');
  modal.proxyEntry = { sourceId: source?.id, protocol: 'subscription', version: 0 };
  $('#modal').classList.add('proxy-entry-modal');
  $('#modal').innerHTML = `<div class="modal-head"><div><h2 id="modalTitle">${source ? '编辑节点源' : '添加节点源'}</h2><p class="actions-note">添加订阅或单个代理服务器配置</p></div><button class="icon-btn" data-action="modal-close" aria-label="取消">×</button></div>
  <form id="proxyEntryForm"><span class="entry-label">节点源类型</span><div class="proxy-type-options" role="group" aria-label="节点源类型">${[['subscription','订阅链接','link'],['http','HTTP','globe'],['https','HTTPS','lock'],['socks5','SOCKS5','shield']].map(([type,label,image]) => `<button class="proxy-type-option ${type === 'subscription' ? 'active' : ''}" type="button" data-proxy-entry="type" data-type="${type}" aria-pressed="${type === 'subscription'}">${icon(image)}<span>${label}</span></button>`).join('')}</div>
  <label class="field"><span>名称（可选）</span><input id="proxyEntryName" maxlength="80" autocomplete="off" placeholder="例如：日本线路 / 备用订阅" value="${esc(source?.name || '')}"></label>
  <div id="proxySubscriptionFields"><label class="field"><span>Clash / Mihomo 订阅链接</span><input id="proxyEntryURL" type="password" autocomplete="off" spellcheck="false" placeholder="${source ? '留空仅改名；输入新链接替换' : 'https://…（默认隐藏）'}"></label><p class="actions-note">支持包含 proxies 的 YAML/JSON；也可在这里直接粘贴 socks5:// 节点链接。</p></div>
  <div id="proxySingleFields" hidden><div class="proxy-field-grid"><label class="field"><span>主机地址 <b class="required">*</b></span><input id="proxyEntryHost" autocomplete="off" spellcheck="false" placeholder="例如：203.0.113.9"></label><label class="field"><span>端口 <b class="required">*</b></span><input id="proxyEntryPort" inputmode="numeric" maxlength="5" autocomplete="off" placeholder="8080"></label><label class="field"><span>用户名（可选）</span><input id="proxyEntryUsername" autocomplete="off" placeholder="可选"></label><label class="field"><span>密码（可选）</span><div class="proxy-password"><input id="proxyEntryPassword" type="password" autocomplete="off" placeholder="可选"><button type="button" class="btn ghost tiny" data-proxy-entry="password" aria-label="显示密码">显示</button></div></label></div><div class="proxy-test-row"><span id="proxyEntryTestResult" role="status">可在添加前测试代理连接</span><button class="btn" type="button" data-proxy-entry="test">${icon('bolt')}测试连接</button></div><p class="actions-note">HTTPS 使用 TLS 连接代理服务器并校验证书。连接测试访问 Cloudflare，成功表示已通过代理取得有效响应。</p></div>
  <p id="proxyEntryError" class="error" role="alert" hidden></p><p class="actions-note">节点凭证仅保存在本机，尚未加密；保存后可分配给实例。</p><div class="proxy-entry-footer"><div><button class="btn" type="button" data-proxy-entry="clipboard">${icon('copy')}从剪贴板导入</button><button class="btn ghost" type="button" data-proxy-entry="file">导入本地文件</button></div><div><button class="btn subtle" type="button" data-action="modal-close">取消</button><button class="btn primary" type="submit" data-proxy-entry="save">${source ? '保存' : '添加'}</button></div></div></form>`;
  $('#proxyEntryForm').addEventListener('submit', event => { event.preventDefault(); saveProxyEntry(); });
  $('#proxyEntryForm').addEventListener('input', () => {
    if (!modal?.proxyEntry) return;
    modal.proxyEntry.version++;
    $('#proxyEntryTestResult').textContent = '配置已更改，请重新测试';
    $('#proxyEntryError').hidden = true;
  });
  $('#proxyEntryURL').addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text')?.trim();
    if (/^socks5:\/\//i.test(text || '')) { event.preventDefault(); fillProxyEntryUri(text); }
  });
  setTimeout(() => $('#proxyEntryName')?.focus(), 0);
}

function setProxyEntryType(type) {
  if (!modal?.proxyEntry || !['subscription','http','https','socks5'].includes(type)) return;
  modal.proxyEntry.protocol = type;
  modal.proxyEntry.version++;
  document.querySelectorAll('.proxy-type-option').forEach(button => {
    const active = button.dataset.type === type;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  $('#proxySubscriptionFields').hidden = type !== 'subscription';
  $('#proxySingleFields').hidden = type === 'subscription';
  $('#proxyEntryPort').placeholder = { http: '8080', https: '443', socks5: '1080' }[type] || '8080';
  $('#proxyEntryTestResult').textContent = '可在添加前测试代理连接';
  $('#proxyEntryError').hidden = true;
}
function proxyEntryFields() {
  return { protocol: modal.proxyEntry.protocol, name: $('#proxyEntryName').value.trim(), host: $('#proxyEntryHost').value.trim(), port: $('#proxyEntryPort').value.trim(), username: $('#proxyEntryUsername').value, password: $('#proxyEntryPassword').value };
}
function proxyEntryBusy(busy) {
  if (!modal?.proxyEntry) return;
  modal.busy = busy;
  $('#modal').querySelectorAll('button,input').forEach(element => element.disabled = busy);
}
function proxyEntryError(error) {
  if (!modal?.proxyEntry) return;
  $('#proxyEntryError').textContent = error.message; $('#proxyEntryError').hidden = false;
}
function fillProxyEntry(fields) {
  setProxyEntryType(fields.protocol);
  if (fields.protocol === 'subscription') { $('#proxyEntryURL').value = fields.url; return; }
  for (const [key, id] of [['host','Host'],['port','Port'],['username','Username'],['password','Password']]) $('#proxyEntry' + id).value = fields[key] ?? '';
  if (!$('#proxyEntryName').value.trim()) $('#proxyEntryName').value = fields.name || '';
}
async function fillProxyEntryUri(text) {
  const entry = modal?.proxyEntry;
  if (!entry || modal.busy) return;
  proxyEntryBusy(true);
  try {
    const fields = await request('library-proxy-parse', { url: text });
    if (modal?.proxyEntry === entry) fillProxyEntry(fields);
  } catch (error) { proxyEntryError(error); }
  finally { if (modal?.proxyEntry === entry) proxyEntryBusy(false); }
}
async function saveProxyEntry() {
  if (!modal?.proxyEntry || modal.busy) return;
  const entry = modal.proxyEntry;
  proxyEntryBusy(true);
  try {
    let id;
    if (entry.protocol === 'subscription') {
      const url = $('#proxyEntryURL').value.trim(), name = $('#proxyEntryName').value.trim();
      if (!url && entry.sourceId) { await request('library-rename', { sourceId: entry.sourceId, name }); id = entry.sourceId; }
      else {
        if (!url) throw Error('请粘贴订阅链接');
        let title = name;
        if (!title && !/^socks5:\/\//i.test(url)) { try { title = new URL(url).hostname; } catch { throw Error('链接格式无效'); } }
        id = await request('library-save', { sourceId: entry.sourceId, name: title, url });
      }
    } else id = await request('library-proxy-save', { sourceId: entry.sourceId, proxy: proxyEntryFields() });
    librarySource = id;
    librarySearch = ''; libraryRegion = ''; libraryProtocol = ''; libraryPageIndex = 0; librarySelected.clear();
    closeModal(true);
    state = await request('snapshot'); render(true); toast('节点源已保存，可选择节点分配给实例');
  } catch (error) { proxyEntryError(error); }
  finally { if (modal?.proxyEntry === entry) proxyEntryBusy(false); }
}
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-proxy-entry]');
  if (!button || button.disabled || !modal?.proxyEntry) return;
  const entry = modal.proxyEntry, action = button.dataset.proxyEntry;
  if (action === 'type') { setProxyEntryType(button.dataset.type); return; }
  if (action === 'password') {
    const input = $('#proxyEntryPassword'), reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password'; button.textContent = reveal ? '隐藏' : '显示'; button.setAttribute('aria-label', reveal ? '隐藏密码' : '显示密码'); return;
  }
  if (action === 'save') return;
  proxyEntryBusy(true);
  try {
    if (action === 'clipboard') {
      if (entry.protocol === 'subscription') {
        // Read through the trusted bridge; control window clipboard permissions stay disabled.
        const result = await request('library-proxy-clipboard'); fillProxyEntry(result);
      } else fillProxyEntry(await request('library-proxy-clipboard', { singleOnly: true }));
    } else if (action === 'test') {
      $('#proxyEntryTestResult').textContent = '正在通过代理测试连接…';
      const result = await request('library-proxy-test', { proxy: proxyEntryFields() });
      $('#proxyEntryTestResult').textContent = `连接成功 · ${result.latencyMs} ms · ${result.provider}`;
    } else if (action === 'file') {
      const id = await request('library-file', { name: $('#proxyEntryName').value.trim() || '本地节点' });
      if (typeof id === 'string') { librarySource = id; closeModal(true); state = await request('snapshot'); render(true); toast('本地节点源已导入'); }
    }
  } catch (error) { if (action === 'test' && modal?.proxyEntry === entry) $('#proxyEntryTestResult').textContent = '连接测试未通过'; proxyEntryError(error); }
  finally { if (modal?.proxyEntry === entry) proxyEntryBusy(false); }
});
