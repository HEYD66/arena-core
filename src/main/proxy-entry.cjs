'use strict';
const { proxyFields, parseProxyUri } = require('./proxy-uri.cjs');

async function proxyEntry(controller, message, clipboard) {
  if (message.action === 'library-proxy-parse') return parseProxyUri(message.url);
  if (message.action === 'library-proxy-clipboard') {
    const raw = await clipboard.readText();
    const text = Buffer.isBuffer(raw) ? raw.toString('utf8').trim() : String(raw ?? '').trim();
    if (/^https?:\/\//i.test(text)) {
      let url; try { url = new URL(text); } catch { throw Error('剪贴板链接格式无效'); }
      if (!url.username && !url.password && !message.singleOnly) return { protocol: 'subscription', url: text };
    }
    return parseProxyUri(text);
  }
  const node = proxyFields(message.proxy);
  if (message.action === 'library-proxy-save') {
    return controller.queue('global-library', async () => {
      if (controller.disposing) throw Error('应用正在退出');
      const id = await controller.library.save({ id: message.sourceId, name: node.name, text: JSON.stringify({ proxies: [node] }) });
      for (const [key, result] of controller.diagnostics.results) if (result.sourceId === id) controller.diagnostics.results.delete(key);
      controller.workspace.log('subscription', '单个代理节点已保存');
      controller.emit();
      return id;
    });
  }
  if (message.action === 'library-proxy-test') {
    return controller.queue('single-proxy-test', async () => {
      if (controller.disposing) throw Error('应用正在退出');
      try {
        return await controller.diagnostics.probeStandalone(node);
      } catch (error) {
        throw Error((error.safeDiagnostic || '连接测试失败') + '（未回退直连）');
      }
    });
  }
  throw Error('不支持的代理操作');
}
module.exports = { proxyEntry };
