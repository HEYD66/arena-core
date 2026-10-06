'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Store } = require('../src/main/store.cjs');
const journal = require('../src/main/deletion-journal.cjs');
const { commitDeletionMetadata } = require('../src/main/deletion-commit.cjs');
const { cleanOrphans, cleanNodeSource, journalResiduals } = require('../src/main/cleanup.cjs');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const TEMP_ID = '33333333-3333-4333-8333-333333333333';
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'facet-recovery-unit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function saved(t) {
  const dir = fixture(t), store = new Store(dir), item = store.create('Before');
  store.update(item.id, { name: 'After' });
  return { dir, store, id: item.id, file: store.file };
}
test('Store actually restores a corrupt primary using a validated backup', t => {
  const { dir, file, id } = saved(t), backup = fs.readFileSync(file + '.bak', 'utf8');
  fs.writeFileSync(file, '{broken');
  const recovered = new Store(dir);
  assert.equal(recovered.recovered, true); assert.equal(recovered.get(id).name, 'Before');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).instances[0].name, 'Before');
  assert.equal(fs.readFileSync(file + '.bak', 'utf8'), backup);
});
test('Store recovers a missing primary instead of silently creating an empty store', t => {
  const { dir, file, id } = saved(t); fs.unlinkSync(file);
  const recovered = new Store(dir);
  assert.equal(recovered.recovered, true); assert.equal(recovered.get(id).name, 'Before');
});
test('invalid backup contents never overwrite a corrupt primary', t => {
  const { dir, file } = saved(t);
  const invalid = JSON.parse(fs.readFileSync(file + '.bak', 'utf8'));
  invalid.instances[0].network.mode = 'invalid';
  fs.writeFileSync(file + '.bak', JSON.stringify(invalid)); fs.writeFileSync(file, '{broken');
  assert.throws(() => new Store(dir), /备份不可用/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});
test('a future schema does not silently roll back to an older backup', t => {
  const { dir, file } = saved(t);
  const newer = JSON.parse(fs.readFileSync(file, 'utf8')); newer.version = 999;
  const bytes = JSON.stringify(newer); fs.writeFileSync(file, bytes);
  assert.throws(() => new Store(dir), /版本不支持/);
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
});
test('invalid network configuration fails closed even when a valid backup exists', t => {
  const { dir, file } = saved(t);
  const invalid = JSON.parse(fs.readFileSync(file, 'utf8')); invalid.instances[0].network.mode = 'mihomO';
  const bytes = JSON.stringify(invalid); fs.writeFileSync(file, bytes);
  assert.throws(() => new Store(dir), /网络配置无效/);
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
});
test('duplicate instance identities are rejected without a silent rollback', t => {
  const { dir, file } = saved(t);
  const invalid = JSON.parse(fs.readFileSync(file, 'utf8')); invalid.instances.push({ ...invalid.instances[0] });
  fs.writeFileSync(file, JSON.stringify(invalid));
  assert.throws(() => new Store(dir), /实例 ID/);
});
test('failed flush leaves Store memory and disk on the same old generation', t => {
  const { store, id, file } = saved(t), before = fs.readFileSync(file, 'utf8');
  t.mock.method(fs, 'fsyncSync', () => { throw Object.assign(new Error('injected flush failure'), { code: 'EIO' }); });
  assert.throws(() => store.update(id, { name: 'Not saved' }), { code: 'EIO' });
  assert.equal(store.get(id).name, 'After'); assert.equal(fs.readFileSync(file, 'utf8'), before);
});
test('metadata commit followed by a journal failure retains the deletion intent', t => {
  const dir = fixture(t), events = [];
  const store = { remove: () => events.push('removed') };
  const j = { begin: () => events.push('begin'), update: () => { throw Error('injected journal failure'); }, finish: () => events.push('finished') };
  const warnings = commitDeletionMetadata(store, j, dir, A);
  assert.deepEqual(events, ['begin', 'removed']); assert.equal(warnings.length, 1);
});
test('pre-commit metadata failure leaves browser cleanup to the caller and cancels the intent', t => {
  const dir = fixture(t), events = [];
  const store = { remove: () => { throw Error('not committed'); } };
  const j = { begin: () => events.push('begin'), update: () => events.push('updated'), finish: () => events.push('finished') };
  assert.throws(() => commitDeletionMetadata(store, j, dir, A), /not committed/);
  assert.deepEqual(events, ['begin', 'finished']);
});
test('uncertain durability after metadata replacement is not mistaken for a failed deletion', t => {
  const dir = fixture(t), events = [];
  const store = { remove: () => { throw Object.assign(Error('uncertain'), { atomicWriteCommitted: true }); } };
  const j = { begin: () => events.push('begin'), update: () => events.push('updated'), finish: () => events.push('finished') };
  const warnings = commitDeletionMetadata(store, j, dir, A);
  assert.deepEqual(events, ['begin', 'updated']); assert.equal(warnings.length, 1);
});
test('finishing a journal removes both generations and remains idempotent', t => {
  const dir = fixture(t); journal.begin(dir, A); journal.update(dir, A, { steps: { metadata: 'done' } });
  assert.equal(fs.existsSync(journal.file(dir, A) + '.bak'), true);
  assert.equal(journal.finish(dir, A), true); assert.equal(journal.finish(dir, A), true);
  assert.equal(fs.existsSync(journal.file(dir, A) + '.bak'), false);
  assert.deepEqual(journal.list(dir), []);
});
test('backup cleanup failure preserves the active deletion journal', t => {
  const dir = fixture(t); journal.begin(dir, A); journal.update(dir, A, { steps: { metadata: 'done' } });
  const real = fs.rmSync, backup = journal.file(dir, A) + '.bak';
  t.mock.method(fs, 'rmSync', (file, options) => {
    if (file === backup) throw Error('injected backup sharing violation');
    return real(file, options);
  });
  assert.equal(journal.finish(dir, A), false); assert.equal(fs.existsSync(journal.file(dir, A)), true);
});
test('orphan cleanup removes deleted-node backups and staging, never active-node files', t => {
  const dir = fixture(t), sources = path.join(dir, 'proxy-sources'); fs.mkdirSync(sources);
  const suffixes = ['.json', '.json.bak', `.json.${TEMP_ID}.tmp`, `.json.bak.${TEMP_ID}.tmp`];
  for (const id of [A, B]) for (const suffix of suffixes) fs.writeFileSync(path.join(sources, id + suffix), '{}');
  fs.writeFileSync(path.join(sources, 'notes.json.bak'), 'keep');
  assert.equal(journalResiduals(dir, B).length, 4);
  assert.deepEqual(cleanOrphans(dir, [A]), { removed: 4, failed: 0 });
  assert.deepEqual(journalResiduals(dir, B), []);
  for (const suffix of suffixes) assert.equal(fs.existsSync(path.join(sources, A + suffix)), true);
  assert.equal(fs.existsSync(path.join(sources, 'notes.json.bak')), true);
  assert.equal(cleanNodeSource(dir, A), true); assert.deepEqual(journalResiduals(dir, A), []);
  assert.throws(() => cleanNodeSource(dir, '../outside'), /ID/);
});
test('unreadable node directories are not reported as fully cleaned', t => {
  const dir = fixture(t), folder = path.join(dir, 'proxy-sources'); fs.mkdirSync(folder);
  const read = fs.readdirSync;
  t.mock.method(fs, 'readdirSync', (target, ...options) => {
    if (target === folder && options[0]?.withFileTypes) throw Object.assign(Error('denied'), { code: 'EACCES' });
    return read(target, ...options);
  });
  assert.throws(() => journalResiduals(dir, A), /无法读取/);
  assert.throws(() => cleanNodeSource(dir, A), /无法读取/);
});
