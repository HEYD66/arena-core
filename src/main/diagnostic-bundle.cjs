'use strict';
const os = require('node:os');
const crypto = require('node:crypto');
const { atomic } = require('./json-storage.cjs');
const { safeLine, readRuntimeOutput } = require('./runtime-output.cjs');

// Explicit fields only: never serialize the full snapshot, profiles or nodes.
function buildDiagnosticBundle(snapshot, events, runtime, now = new Date()) {
  const text = value => safeLine(String(value ?? ''));
  return {
    format: 'facet-diagnostics', version: 1, time: now.toISOString(),
    application: { app: text(snapshot.versions?.app), electron: text(snapshot.versions?.electron), platform: os.platform(), architecture: os.arch(), osRelease: os.release() },
    nodeNetwork: { dnsMode: text(snapshot.nodeNetwork?.settings?.dnsMode), routeMode: text(snapshot.nodeNetwork?.settings?.routeMode), warning: text(snapshot.nodeNetwork?.warning) },
    instances: (snapshot.instances || []).map(x => ({
      id: text(x.id), status: text(x.status), network: text(x.network?.mode),
      page: text(x.pageState), core: text(x.coreVersion), error: text(x.error),
      environment: { language: text(x.environment?.language), timezone: text(x.environment?.timezone), customUA: !!x.environment?.userAgent, customPlatform: !!x.environment?.platform }
    })),
    events: (events || []).slice(0, 1000).map(x => ({
      time: text(x.time), scope: text(x.scope), level: text(x.level),
      instanceId: x.instanceId ? text(x.instanceId) : null, sourceId: x.sourceId ? text(x.sourceId) : null,
      taskId: x.taskId ? text(x.taskId) : null, nodeName: x.nodeName ? text(x.nodeName) : null, text: text(x.text)
    })),
    debug: { warning: text(runtime.warning), rows: (runtime.rows || []).slice(-1000).map(x => ({ time: text(x.time), channel: x.channel === 'stderr' ? 'stderr' : 'stdout', text: text(x.text) })) },
    coverage: { operations: '最近最多 1000 条操作记录，包含跨重启历史', debug: '本次运行最近最多 1000 行标准输出和错误输出；不含完整网页控制台或代理内核日志', privacy: '按字段筛选并隐藏可识别的网址及凭据；不收集 Cookie、密码、订阅配置、网页内容或实例备注' }
  };
}

async function exportDiagnosticBundle(controller, window, dialog) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const pick = await dialog.showSaveDialog(window, {
    title: '保存问题诊断包', defaultPath: `Facet-diagnostics-${stamp}-${crypto.randomUUID().slice(0, 6)}.json`,
    filters: [{ name: '问题诊断包（JSON）', extensions: ['json'] }]
  });
  if (pick.canceled || !pick.filePath || controller.disposing) return { cancelled: true };
  const bundle = buildDiagnosticBundle(controller.snapshot(), controller.workspace.events, readRuntimeOutput());
  try { atomic(pick.filePath, bundle, { backup: false }); }
  catch { throw Error('诊断包保存失败，请检查保存位置和磁盘空间后重试'); }
  return { cancelled: false, eventCount: bundle.events.length, debugLineCount: bundle.debug.rows.length, debugWarning: bundle.debug.warning };
}
module.exports = { buildDiagnosticBundle, exportDiagnosticBundle };
