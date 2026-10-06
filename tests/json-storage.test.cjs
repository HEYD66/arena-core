'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { atomic } = require('../src/main/json-storage.cjs');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'facet-atomic-unit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, file: path.join(dir, 'data.json') };
}
const value = file => JSON.parse(fs.readFileSync(file, 'utf8')).value;
const ioError = () => Object.assign(new Error('injected flush failure'), { code: 'EIO' });

test('atomic JSON replacement retains the previous generation', t => {
  const { file } = fixture(t);
  const first = atomic(file, { value: 'one' });
  const second = atomic(file, { value: 'two' });
  assert.equal(value(file), 'two'); assert.equal(value(file + '.bak'), 'one');
  assert.equal(first.backupUpdated, false); assert.equal(second.backupUpdated, true);
  assert.equal(second.fileSynced, true);
  assert.equal(second.directorySynced, process.platform !== 'win32');
});
test('serialization failures do not change primary or backup', t => {
  const { file } = fixture(t);
  atomic(file, { value: 'one' }); atomic(file, { value: 'two' });
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => atomic(file, cyclic));
  assert.throws(() => atomic(file, undefined));
  assert.equal(value(file), 'two'); assert.equal(value(file + '.bak'), 'one');
});
test('a temporary-file flush failure is visible and does not publish the write', t => {
  const { dir, file } = fixture(t);
  atomic(file, { value: 'one' }); atomic(file, { value: 'two' });
  t.mock.method(fs, 'fsyncSync', () => { throw ioError(); });
  assert.throws(() => atomic(file, { value: 'three' }), { code: 'EIO' });
  assert.equal(value(file), 'two'); assert.equal(value(file + '.bak'), 'one');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['data.json', 'data.json.bak']);
});
test('a backup flush failure keeps the previous good backup intact', t => {
  const { dir, file } = fixture(t);
  atomic(file, { value: 'one' }); atomic(file, { value: 'two' });
  const real = fs.fsyncSync; let calls = 0;
  t.mock.method(fs, 'fsyncSync', fd => { if (++calls === 2) throw ioError(); return real(fd); });
  assert.throws(() => atomic(file, { value: 'three' }), { code: 'EIO' });
  assert.equal(value(file), 'two'); assert.equal(value(file + '.bak'), 'one');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['data.json', 'data.json.bak']);
});
test('a replacement failure preserves the primary and cleans owned staging files', t => {
  const { dir, file } = fixture(t);
  atomic(file, { value: 'one' });
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === file) throw Object.assign(new Error('injected sharing violation'), { code: 'EPERM' });
    return rename(from, to);
  });
  assert.throws(() => atomic(file, { value: 'two' }), { code: 'EPERM' });
  assert.equal(value(file), 'one'); assert.equal(value(file + '.bak'), 'one');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['data.json', 'data.json.bak']);
});
test('backup-free recovery cannot replace a good backup with corrupt bytes', t => {
  const { file } = fixture(t);
  atomic(file, { value: 'one' }); atomic(file, { value: 'two' });
  fs.writeFileSync(file, '{corrupt');
  atomic(file, { value: 'one' }, { backup: false });
  assert.equal(value(file), 'one'); assert.equal(value(file + '.bak'), 'one');
});
test('permission errors reading an existing primary are not treated as absence', t => {
  const { dir, file } = fixture(t); atomic(file, { value: 'old' });
  const read = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (target, ...args) => {
    if (target === file) throw Object.assign(new Error('injected access failure'), { code: 'EACCES' });
    return read(target, ...args);
  });
  assert.throws(() => atomic(file, { value: 'new' }), { code: 'EACCES' });
  assert.equal(JSON.parse(read(file, 'utf8')).value, 'old');
  assert.deepEqual(fs.readdirSync(dir), ['data.json']);
});
test('POSIX post-commit sync failure reports that the replacement happened', { skip: process.platform === 'win32' }, t => {
  const { file } = fixture(t);
  const real = fs.fsyncSync;
  t.mock.method(fs, 'fsyncSync', fd => {
    if (fs.fstatSync(fd).isDirectory()) throw ioError();
    return real(fd);
  });
  assert.throws(() => atomic(file, { value: 'committed' }), error => error.atomicWriteCommitted === true && error.code === 'ATOMIC_DURABILITY_UNCONFIRMED');
  assert.equal(value(file), 'committed');
});
