'use strict';
// Atomic replacement of ONE JSON file, not a multi-file transaction.
// Windows has no portable directory-fsync API in Node: do not claim power-loss
// durability of directory entries there. File flush failures are never ignored.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function writeSynced(file, bytes) {
  const fd = fs.openSync(file, 'wx', 0o600);
  let failure;
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try { fs.closeSync(fd); } catch (error) { if (!failure) throw error; }
  }
}

function syncDirectory(dir) {
  if (process.platform === 'win32') return false;
  const fd = fs.openSync(dir, 'r');
  let failure;
  try {
    fs.fsyncSync(fd);
    return true;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try { fs.closeSync(fd); } catch (error) { if (!failure) throw error; }
  }
}

function atomic(file, data, { backup = true } = {}) {
  const json = JSON.stringify(data, null, 2);
  if (json === undefined) throw new TypeError('配置不能序列化为 JSON');
  file = path.resolve(file);
  const dir = path.dirname(file);
  const token = crypto.randomUUID();
  const temp = `${file}.${token}.tmp`;
  const backupTemp = `${file}.bak.${token}.tmp`;
  let committed = false;
  let backupUpdated = false;
  fs.mkdirSync(dir, { recursive: true });
  try {
    writeSynced(temp, json + '\n');
    if (backup) {
      let previous;
      try { previous = fs.readFileSync(file); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (previous !== undefined) {
        // Never truncate the last known backup in place.
        writeSynced(backupTemp, previous);
        fs.renameSync(backupTemp, file + '.bak');
        syncDirectory(dir);
        backupUpdated = true;
      }
    }
    fs.renameSync(temp, file);
    committed = true;
    const directorySynced = syncDirectory(dir);
    return { fileSynced: true, directorySynced, backupUpdated };
  } catch (cause) {
    if (!committed) throw cause;
    const error = new Error('配置已替换，但目录持久化未能确认；请核对最新操作并保留备份', { cause });
    error.code = 'ATOMIC_DURABILITY_UNCONFIRMED';
    error.atomicWriteCommitted = true;
    throw error;
  } finally {
    // Only our two unpredictable staging paths; never remove other writers' files.
    for (const staging of [temp, backupTemp]) {
      try { fs.unlinkSync(staging); } catch { /* Preserve the primary error. */ }
    }
  }
}

module.exports = { atomic };
