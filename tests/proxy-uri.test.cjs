'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseSocks5Uri, proxyFields, parseProxyUri } = require('../src/main/proxy-uri.cjs');
const { Store } = require('../src/main/store.cjs');
const { Library } = require('../src/main/library.cjs');
const { proxyEntry } = require('../src/main/proxy-entry.cjs');

test('parses authenticated SOCKS5 URI and decodes the remark', () => {
  const result = parseSocks5Uri('socks5://fixture-user:fixture-pass@203.0.113.9:1080#SOCKS-%E6%97%A5%E6%9C%AC');
  assert.deepEqual(result, {
    name: 'SOCKS-日本',
    node: {
      name: 'SOCKS-日本',
      type: 'socks5',
      server: '203.0.113.9',
      port: 1080,
      username: 'fixture-user',
      password: 'fixture-pass',
    },
  });
});

test('supports unauthenticated and bracketed IPv6 SOCKS5 nodes', () => {
  assert.equal(parseSocks5Uri('socks5://[2001:db8::9]:65535#ipv6').node.server, '2001:db8::9');
  assert.deepEqual(parseSocks5Uri('socks5://fixture.example:1080').node, {
    name: 'fixture.example:1080',
    type: 'socks5',
    server: 'fixture.example',
    port: 1080,
  });
});

test('builds HTTP, HTTPS and SOCKS5 nodes from the dialog fields', () => {
  assert.deepEqual(proxyFields({ protocol: 'http', host: '203.0.113.10', port: '8080', name: 'HTTP fixture' }), {
    name: 'HTTP fixture', type: 'http', server: '203.0.113.10', port: 8080,
  });
  assert.equal(proxyFields({ protocol: 'https', host: 'fixture.example', port: 8443 }).tls, true);
  assert.equal(parseProxyUri('socks5://fixture-user:fixture-pass@203.0.113.9:1080#SOCKS-%E6%97%A5%E6%9C%AC').name, 'SOCKS-日本');
  assert.throws(() => proxyFields({ protocol: 'socks5', host: 'fixture.example', port: '1080', password: 'secret' }), /用户名/);
  assert.deepEqual(parseProxyUri('fixture.example:2000:fixture-user:fixture-pass'), {
    protocol: 'socks5', host: 'fixture.example', port: 2000,
    username: 'fixture-user', password: 'fixture-pass',
    name: 'fixture.example:2000',
  });
});

test('rejects unsafe or incomplete SOCKS5 URI variants without echoing credentials', () => {
  for (const input of [
    'socks5://fixture-user:fixture-pass@fixture.example:0',
    'socks5://fixture-user:fixture-pass@fixture.example:70000',
    'socks5://:fixture-pass@fixture.example:1080',
    'socks5://fixture-user:fixture-pass@fixture.example:1080/path',
    'socks5://fixture-user:fixture-pass@fixture.example:1080?secret=fixture',
    'socks5://fixture-user:%ZZ@fixture.example:1080',
  ]) {
    assert.throws(() => parseSocks5Uri(input), (error) => {
      assert.match(error.message, /SOCKS5/);
      assert(!error.message.includes('fixture-pass'));
      return true;
    });
  }
  assert.equal(parseSocks5Uri('https://fixture.example/sub'), null);
});

test('saves a SOCKS5 URI as a local single-node source and reloads it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-proxy-uri-'));
  try {
    const store = new Store(dir);
    const library = new Library(dir, store);
    const id = await library.save({
      url: 'socks5://fixture-user:fixture-pass@203.0.113.9:1080#SOCKS-%E6%97%A5%E6%9C%AC',
    });
    const source = library.get(id);
    assert.equal(source.url, null);
    assert.equal(source.name, 'SOCKS-日本');
    assert.deepEqual(source.nodes[0], {
      name: 'SOCKS-日本',
      type: 'socks5',
      server: '203.0.113.9',
      port: 1080,
      username: 'fixture-user',
      password: 'fixture-pass',
    });
    assert.equal(new Library(dir, store).node(id, 'SOCKS-日本').password, 'fixture-pass');
    assert(!JSON.stringify(library.summaries()).includes('fixture-pass'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('saves a dialog HTTP node as a local source and keeps the downstream TLS flag', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-proxy-dialog-'));
  try {
    const store = new Store(dir), library = new Library(dir, store);
    const node = proxyFields({ protocol: 'https', host: 'fixture.example', port: '8443', name: 'HTTPS fixture', username: 'fixture-user', password: 'fixture-pass' });
    const id = await library.save({ name: node.name, text: JSON.stringify({ proxies: [node] }) });
    const saved = library.node(id, 'HTTPS fixture');
    assert.equal(saved.tls, true);
    assert.equal(saved.username, 'fixture-user');
    assert.equal(saved.url, undefined);
    assert.equal(new Library(dir, store).node(id, 'HTTPS fixture').server, 'fixture.example');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('proxy entry IPC adapter saves and tests only the validated node', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-proxy-entry-'));
  try {
    const store = new Store(dir), library = new Library(dir, store), calls = [];
    const controller = {
      disposing: false, dir, library,
      diagnostics: { results: new Map(), probeStandalone: async (node) => { calls.push(node); return { latencyMs: 3, provider: 'fixture' }; } },
      workspace: { log: () => {} }, emit: () => {},
      queue: async (_name, work) => work(),
    };
    const id = await proxyEntry(controller, { action: 'library-proxy-save', proxy: { protocol: 'socks5', host: '203.0.113.11', port: '1080', username: 'fixture-user', password: 'fixture-pass', name: 'Entry fixture' } }, { readText: () => '' });
    assert.equal(library.node(id, 'Entry fixture').type, 'socks5');
    const result = await proxyEntry(controller, { action: 'library-proxy-test', proxy: { protocol: 'socks5', host: '203.0.113.11', port: '1080', username: 'fixture-user', password: 'fixture-pass', name: 'Entry fixture' } }, { readText: () => '' });
    assert.equal(result.latencyMs, 3);
    assert.equal(calls[0].password, 'fixture-pass');
    const parsed = await proxyEntry(controller, { action: 'library-proxy-clipboard', singleOnly: true }, { readText: () => 'fixture.example:2000:fixture-user:fixture-pass' });
    assert.equal(parsed.protocol, 'socks5');
    assert.equal(parsed.username, 'fixture-user');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
