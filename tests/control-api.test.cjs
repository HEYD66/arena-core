'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {ControlApi, loadSettings} = require('../src/main/control-api.cjs');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'facet-control-api-'));
  const focusEvents = [];
  const controller = {
    focusEvents,
    window: {isDestroyed: () => false, webContents: {isDestroyed: () => false, send: (_channel, value) => focusEvents.push(value)}},
    store: {list: () => [{id: 'one', name: '测试实例'}], get: id => {if (id !== 'one') throw Error('unknown'); return {id, name: '测试实例'};}},
    runtimes: new Map(),
    snapshot: () => ({instances: [{id: 'one', name: '测试实例', status: 'stopped', url: 'https://example.com', network: {mode: 'direct'}}]}),
    start: async id => assert.equal(id, 'one'),
    stop: async id => assert.equal(id, 'one'),
    remove: async id => assert.equal(id, 'created'),
    queue: async (_key, job) => job(),
    action: async () => {},
    navigate: async (_id, url) => assert.equal(url, 'https://example.com/next'),
  };
  return {dir, file: path.join(dir, 'control-api.json'), controller};
}

test('本地控制 API 默认关闭，开启后只允许令牌访问并返回实例', async t => {
  const f = fixture();
  t.after(() => fs.rmSync(f.dir, {recursive: true, force: true}));
  const api = new ControlApi({file: f.file, settings: loadSettings(f.file), controller: f.controller});
  assert.equal(api.uiSnapshot().enabled, false);
  const info = await api.save({enabled: true});
  t.after(() => api.stop());
  assert.equal(info.running, true);
  assert.equal(info.restartRequired, true);
  const denied = await fetch(`http://127.0.0.1:${info.apiPort}/v1/instances`);
  assert.equal(denied.status, 401);
  const response = await fetch(`http://127.0.0.1:${info.apiPort}/v1/instances`, {headers: {Authorization: `Bearer ${info.token}`}});
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).value[0].id, 'one');
  const navigated = await fetch(`http://127.0.0.1:${info.apiPort}/v1/instances/one/navigate`, {method: 'POST', headers: {'content-type': 'application/json', Authorization: `Bearer ${info.token}`}, body: JSON.stringify({url: 'https://example.com/next'})});
  assert.equal(navigated.status, 200);
  const focused = await fetch(`http://127.0.0.1:${info.apiPort}/v1/instances/one/focus`, {method: 'POST', headers: {Authorization: `Bearer ${info.token}`}});
  assert.equal(focused.status, 200);
  assert.equal(f.controller.focusEvents.length, 2);
  const operations = require('../src/main/operations.cjs');
  const originalCreate = operations.createInstance;
  operations.createInstance = async (_controller, message) => ({id: 'created', created: true, started: message.start === true});
  let created;
  try {
    created = await fetch(`http://127.0.0.1:${info.apiPort}/v1/instances`, {method: 'POST', headers: {'content-type': 'application/json', Authorization: `Bearer ${info.token}`}, body: JSON.stringify({name: 'API 创建测试'})});
  } finally { operations.createInstance = originalCreate; }
  assert.equal(created.status, 201);
  assert.equal((await created.json()).value.created, true);
  const invalid = await fetch(`http://127.0.0.1:${info.apiPort}/v1/instances`, {method: 'POST', headers: {'content-type': 'application/json', Authorization: `Bearer ${info.token}`}, body: JSON.stringify({name: ''})});
  assert.equal(invalid.status, 400);
  const removed = await fetch(`http://127.0.0.1:${info.apiPort}/v1/instances/created`, {method: 'DELETE', headers: {Authorization: `Bearer ${info.token}`}});
  assert.equal(removed.status, 200);
  await api.save({enabled: false});
  assert.equal(api.uiSnapshot().running, false);
});

