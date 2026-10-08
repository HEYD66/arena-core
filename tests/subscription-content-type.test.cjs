'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { downloadSubscription } = require('../src/main/subscription.cjs');
const { Store, parseNodes } = require('../src/main/store.cjs');
const { Library } = require('../src/main/library.cjs');
const config = { proxies: [{ name: 'Fixture', type: 'http', server: '127.0.0.1', port: 9001 }] };
const yaml = 'proxies:\n  - name: Fixture\n    type: http\n    server: 127.0.0.1\n    port: 9001\n';

async function fixture(handler, job) {
  const sockets = new Set();
  const server = http.createServer(handler);
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await job(`http://127.0.0.1:${server.address().port}`); }
  finally { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
}

test('real HTTP: mislabeled YAML, JSON, BOM and compressed node configurations import', () => fixture((req, res) => {
  res.setHeader('Content-Type', req.url === '/json' ? 'application/xhtml+xml' : 'text/html; charset=utf-8');
  const text = req.url === '/json' ? JSON.stringify(config) : '\ufeff' + yaml;
  if (req.url === '/gzip') { res.setHeader('Content-Encoding', 'gzip'); res.end(zlib.gzipSync(text)); }
  else res.end(text);
}, async base => {
  for (const route of ['/yaml', '/json', '/gzip']) {
    const result = await downloadSubscription(base + route, { allowPrivateHosts: true });
    assert.equal(parseNodes(result.text).length, 1);
  }
}));

test('real HTTP: actual webpages are refused with HTML or plain content type', () => fixture((req, res) => {
  res.setHeader('Content-Type', req.url === '/plain' ? 'text/plain' : 'text/html');
  res.end('\ufeff <!DOCTYPE html><html><body>login secret-fixture</body></html>');
}, async base => {
  for (const route of ['/html', '/plain']) await assert.rejects(
    downloadSubscription(base + route, { allowPrivateHosts: true }),
    error => error.subscriptionSafe && /网页/.test(error.message) && !error.message.includes('secret-fixture')
  );
}));

test('real HTTP: HTML-labeled empty, malformed and unsupported node data cannot pass', () => fixture((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(req.url === '/empty' ? 'proxies: []' : req.url === '/invalid' ? 'proxies: [' : JSON.stringify({ proxies: [{ ...config.proxies[0], type: 'direct' }] }));
}, async base => {
  for (const route of ['/empty', '/invalid', '/direct']) await assert.rejects(downloadSubscription(base + route, { allowPrivateHosts: true }), /网页或无效/);
}));

test('real HTTP: mislabeled responses retain decoded size and total deadline limits', () => fixture((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  if (req.url === '/slow') return;
  res.setHeader('Content-Encoding', 'gzip'); res.end(zlib.gzipSync('x'.repeat(4096)));
}, async base => {
  await assert.rejects(downloadSubscription(base + '/bomb', { allowPrivateHosts: true, maxBytes: 1024 }), /2MB/);
  await assert.rejects(downloadSubscription(base + '/slow', { allowPrivateHosts: true, timeoutMs: 50 }), /超时/);
}));

test('real HTTP library transaction: import, reload, refresh and failed update preserve data', async t => {
  // Only redirect the checked public fixture address to the real local server
  // in this test process. Production keeps its private-host and TLS protections.
  const dns = require('node:dns').promises, lookup = dns.lookup, request = http.request;
  t.mock.method(dns, 'lookup', (host, options) => host === 'subscription.example.test' ? Promise.resolve([{ address: '93.184.216.34', family: 4 }]) : lookup(host, options));
  t.mock.method(http, 'request', (url, options, callback) => {
    if (url.hostname !== 'subscription.example.test') return request(url, options, callback);
    const local = new URL(url); local.hostname = '127.0.0.1';
    return request(local, { ...options, lookup: undefined, servername: undefined, family: 4 }, callback);
  });
  let failed = false;
  await fixture((_req, res) => {
    res.setHeader('Content-Type', 'text/html'); res.end(failed ? '<html>login secret-fixture</html>' : yaml);
  }, async base => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'facet-subscription-format-'));
    try {
      const store = new Store(dir), instance = store.create('Original');
      const lib = new Library(dir, store), url = base.replace('127.0.0.1', 'subscription.example.test') + '/sub?token=fixture-token';
      const id = await lib.save({ name: 'Import', url });
      const reloaded = new Library(dir, new Store(dir));
      assert.equal(reloaded.get(id).url, url); assert.equal(reloaded.get(id).nodes.length, 1);
      await reloaded.save({ id });
      assert.equal(reloaded.get(id).nodes.length, 1);
      assert(!JSON.stringify(reloaded.summaries()).includes('fixture-token'));
      const before = fs.readFileSync(lib.file); failed = true;
      await assert.rejects(reloaded.save({ id, name: 'Bad' }), /网页/);
      assert.deepEqual(fs.readFileSync(lib.file), before);
      assert.equal(store.get(instance.id).network.mode, 'direct');
      assert.equal(new Library(dir, new Store(dir)).get(id).name, 'Import');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
