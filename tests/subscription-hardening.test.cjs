'use strict';
// No Internet traffic: DNS and HTTP(S) requests are replaced inside this test
// process. Existing integration fixtures use only ephemeral loopback servers.
const test = require('node:test');
const assert = require('node:assert/strict');
const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { downloadSubscription } = require('../src/main/subscription.cjs');
function fakeRequests(t, transport, responder) {
  const calls = [];
  t.mock.method(transport, 'request', (url, options, callback) => {
    calls.push({ url, options });
    const req = new EventEmitter(); req.destroy = () => {};
    req.end = () => queueMicrotask(() => {
      const response = responder(url, options, calls.length);
      const stream = new PassThrough();
      stream.statusCode = response.status || 200; stream.headers = response.headers || {};
      callback(stream); stream.end(response.body || 'proxies: []');
    });
    return req;
  });
  return calls;
}
test('a redirect to a literal private target is rejected before a second request', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  const calls = fakeRequests(t, http, () => ({ status: 302, headers: { location: 'http://127.0.0.1/private?token=do-not-echo' } }));
  await assert.rejects(downloadSubscription('http://public.test/sub'), error => /本机或内网/.test(error.message) && !error.message.includes('do-not-echo'));
  assert.equal(calls.length, 1);
});
test('each redirect hostname is resolved again and mixed/private answers stop the chain', async t => {
  const hosts = [];
  t.mock.method(dns, 'lookup', async host => { hosts.push(host); return [{ address: hosts.length === 1 ? '93.184.216.34' : '10.1.2.3', family: 4 }]; });
  const calls = fakeRequests(t, http, () => ({ status: 302, headers: { location: 'http://second.test/sub' } }));
  await assert.rejects(downloadSubscription('http://first.test/sub'), /本机或内网/);
  assert.deepEqual(hosts, ['first.test', 'second.test']); assert.equal(calls.length, 1);
});
test('TLS hostname and the checked address are both retained in a pinned request', async t => {
  let resolutions = 0;
  t.mock.method(dns, 'lookup', async () => { resolutions++; return [{ address: resolutions === 1 ? '93.184.216.34' : '127.0.0.1', family: 4 }]; });
  const calls = fakeRequests(t, https, () => ({ body: 'proxies: []' }));
  const result = await downloadSubscription('https://public.test/sub?token=fake-fixture');
  assert.equal(result.text, 'proxies: []'); assert.equal(resolutions, 1);
  const { url, options } = calls[0];
  assert.equal(url.hostname, 'public.test'); assert.equal(options.servername, 'public.test');
  assert.equal(options.agent.options.rejectUnauthorized, true);
  const rows = await new Promise((resolve, reject) => options.lookup(url.hostname, { all: true }, (error, value) => error ? reject(error) : resolve(value)));
  assert.deepEqual(rows, [{ address: '93.184.216.34', family: 4 }]); assert.equal(resolutions, 1);
});
test('HTTPS redirects cannot downgrade to HTTP', async t => {
  t.mock.method(dns, 'lookup', async () => [{ address: '93.184.216.34', family: 4 }]);
  const calls = fakeRequests(t, https, () => ({ status: 302, headers: { location: 'http://public.test/sub' } }));
  await assert.rejects(downloadSubscription('https://public.test/sub'), /降级/); assert.equal(calls.length, 1);
});
test('the overall download deadline includes a DNS lookup that never completes', async t => {
  t.mock.method(dns, 'lookup', () => new Promise(() => {}));
  const calls = fakeRequests(t, https, () => ({}));
  const started = Date.now();
  await assert.rejects(downloadSubscription('https://pending.test/sub', { timeoutMs: 25 }), /超时/);
  assert.equal(calls.length, 0); assert(Date.now() - started < 2000);
});
test('invalid limits fail before network activity', async t => {
  const calls = fakeRequests(t, http, () => ({}));
  for (const options of [{ maxBytes: 0 }, { maxBytes: Infinity }, { timeoutMs: 0 }, { maxRedirects: -1 }, { maxRedirects: 0.5 }]) {
    await assert.rejects(downloadSubscription('http://public.test/sub', options), /参数无效/);
  }
  assert.equal(calls.length, 0);
});
