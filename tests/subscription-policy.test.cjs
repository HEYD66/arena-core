'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isPublicAddress, resolvePublicHost, pinnedLookup } = require('../src/main/subscription-policy.cjs');

test('IPv4 special-purpose addresses are blocked', () => {
  for (const address of ['0.0.0.0','0.1.2.3','10.2.3.4','100.64.0.1','100.127.255.254','127.255.255.254','169.254.169.254','172.16.0.1','172.31.255.254','192.0.0.1','192.0.2.1','192.88.99.1','192.168.2.3','198.18.0.1','198.19.255.254','198.51.100.1','203.0.113.1','224.0.0.1','240.0.0.1','255.255.255.255']) {
    assert.equal(isPublicAddress(address), false, address);
  }
});
test('IPv6 loopback, unspecified, mapped-private and transition ranges are blocked', () => {
  for (const address of ['::','0:0:0:0:0:0:0:0','::1','0000:0000:0000:0000:0000:0000:0000:0001','fe80::1','fe80::1%eth0','fc00::1','fdff::1','ff02::1','::ffff:127.0.0.1','::ffff:7f00:1','0:0:0:0:0:ffff:a00:1','::127.0.0.1','64:ff9b::7f00:1','2001:db8::1','2001::1234','2002:7f00:1::','3ffe::1','3fff::1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
});
test('public IPv4, IPv6 and public mapped-IPv4 addresses remain usable', () => {
  for (const address of ['8.8.8.8','1.1.1.1','93.184.216.34','100.128.0.1','172.32.0.1','2606:4700:4700::1111','2001:4860:4860::8888','::ffff:8.8.8.8','::ffff:808:808']) {
    assert.equal(isPublicAddress(address), true, address);
  }
  for (const address of ['', null, 'localhost', '999.1.1.1']) assert.equal(isPublicAddress(address), false);
});
test('IPv6 literal URL normalization does not invoke DNS', async () => {
  const fail = async () => { throw Error('DNS must not run'); };
  assert.equal(await resolvePublicHost(new URL('https://[2606:4700:4700::1111]/sub'), { lookup: fail }), '2606:4700:4700::1111');
  for (const host of ['[::1]','[::]','[::ffff:7f00:1]','2130706433','0x7f000001','0177.0.0.1']) {
    await assert.rejects(resolvePublicHost(new URL(`http://${host}/sub`), { lookup: fail }), /本机或内网/);
  }
});
test('mixed public and private DNS answers are rejected', async () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }];
  await assert.rejects(resolvePublicHost(new URL('https://public.test/sub'), { lookup }), /本机或内网/);
});
test('empty and malformed DNS answers fail closed', async () => {
  for (const rows of [[], null, [{ address: 'not-an-ip' }], [null]]) {
    await assert.rejects(resolvePublicHost(new URL('https://public.test/sub'), { lookup: async () => rows }));
  }
});
test('a pending DNS lookup respects abort and a late failure stays handled', async () => {
  const abort = new AbortController(); let rejectLookup;
  const pending = resolvePublicHost(new URL('https://pending.test/sub'), {
    signal: abort.signal, lookup: () => new Promise((_resolve, reject) => { rejectLookup = reject; })
  });
  await Promise.resolve(); abort.abort();
  await assert.rejects(pending, /超时/);
  rejectLookup(Error('late resolver failure'));
  await new Promise(resolve => setImmediate(resolve));
});
test('a pre-aborted lookup never calls DNS', async () => {
  const abort = new AbortController(); abort.abort(); let called = false;
  await assert.rejects(resolvePublicHost(new URL('https://pending.test/sub'), { signal: abort.signal, lookup: async () => { called = true; } }), /超时/);
  assert.equal(called, false);
});
test('pinned lookup supports both Node callback shapes without a second resolution', async () => {
  const lookup = pinnedLookup('93.184.216.34');
  const all = await new Promise((resolve, reject) => lookup('rebound.test', { all: true }, (error, rows) => error ? reject(error) : resolve(rows)));
  assert.deepEqual(all, [{ address: '93.184.216.34', family: 4 }]);
  const single = await new Promise((resolve, reject) => lookup('rebound.test', {}, (error, address, family) => error ? reject(error) : resolve({ address, family })));
  assert.deepEqual(single, all[0]);
  assert.throws(() => pinnedLookup('127.0.0.1'), /公网/);
});
test('only an explicit boolean opt-in enables private test fixtures', async () => {
  const url = new URL('http://127.0.0.1/sub');
  for (const flag of ['true', 'false', 1]) await assert.rejects(resolvePublicHost(url, { allowPrivateHosts: flag }), /本机或内网/);
  assert.equal(await resolvePublicHost(url, { allowPrivateHosts: true }), null);
});
