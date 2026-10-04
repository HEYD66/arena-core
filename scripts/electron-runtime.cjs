'use strict';
// Windows can abort before JS/Chromium logging while starting from some volumes.
// Relocate identical runtime bytes only for the observed STATUS_BREAKPOINT failure.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');

function childEnvironment(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([key]) =>
    !/^(ELECTRON_RUN_AS_NODE|CHROME_CRASHPAD_PIPE_NAME)$/i.test(key)));
}

function exitDescription(result) {
  if (result.error) return result.error.message;
  if (result.signal) return `signal ${result.signal}`;
  return `exit ${result.status} (0x${(result.status >>> 0).toString(16).padStart(8, '0')})`;
}

function probeVersion(executable, env) {
  return spawnSync(executable, ['--version'], {
    env, encoding: 'utf8', timeout: 15000, windowsHide: true
  });
}

function versionMatches(result, version) {
  return !result.error && !result.signal && result.status === 0 &&
    String(result.stdout || '').trim() === `v${version}`;
}

// Content-based identity: upgrades and any changed resources get a different cache.
// A cached copy is checked too, so truncated or altered copies are never reused.
function treeDigest(directory) {
  const digest = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  function visit(relative) {
    for (const name of fs.readdirSync(path.join(directory, relative)).sort()) {
      const entry = path.join(relative, name);
      const file = path.join(directory, entry);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error(`运行时含不支持的链接：${file}`);
      if (stat.isDirectory()) { visit(entry); continue; }
      if (!stat.isFile()) throw new Error(`运行时含不支持的文件：${file}`);
      const fileHash = crypto.createHash('sha256');
      const fd = fs.openSync(file, 'r');
      try {
        let length;
        while ((length = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
          fileHash.update(buffer.subarray(0, length));
        }
      } finally { fs.closeSync(fd); }
      const hash = fileHash.digest('hex');
      digest.update(entry.split(path.sep).join('/')).update('\0').update(hash).update('\n');
    }
  }
  visit('');
  return digest.digest('hex');
}

function verifiedCopy(source, cacheRoot, key, digest) {
  fs.mkdirSync(cacheRoot, {recursive: true});
  let destination = path.join(cacheRoot, key);
  if (fs.existsSync(destination)) {
    if (treeDigest(destination) === digest) return destination;
    for (const name of fs.readdirSync(cacheRoot).filter(name => name.startsWith(key + '-repair-'))) {
      const repaired = path.join(cacheRoot, name);
      if (treeDigest(repaired) === digest) return repaired;
    }
    // Preserve a damaged cache for inspection; never overwrite an active runtime.
    destination += `-repair-${crypto.randomBytes(8).toString('hex')}`;
  }
  const staging = fs.mkdtempSync(path.join(cacheRoot, '.copy-'));
  try {
    fs.cpSync(source, staging, {recursive: true});
    if (treeDigest(staging) !== digest) throw new Error('Electron 运行时复制校验失败');
    try {
      fs.renameSync(staging, destination);
    } catch (error) {
      // Another launcher may have published the same verified cache concurrently.
      if (!fs.existsSync(destination) || treeDigest(destination) !== digest) throw error;
    }
    return destination;
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, {recursive: true, force: true});
  }
}

function resolveRuntime({executable, version, env, platform = process.platform,
  cacheRoot, probe = probeVersion, warn = console.warn}) {
  if (platform !== 'win32') return executable;
  const original = probe(executable, env);
  if (versionMatches(original, version)) return executable;
  // Do not mask ordinary errors, timeouts or version mismatches with a copy.
  if (original.error || original.signal || (original.status >>> 0) !== 0x80000003) {
    throw new Error(`Electron ${version} 启动自检失败：${exitDescription(original)}；` +
      `请检查安装版本和运行环境。${String(original.stderr || '').trim()}`);
  }
  if (!cacheRoot) {
    if (!env.LOCALAPPDATA) throw new Error('Electron 启动异常 0x80000003，且 LOCALAPPDATA 不可用');
    cacheRoot = path.join(env.LOCALAPPDATA, 'FacetRuntime', 'electron');
  }
  const source = path.dirname(executable);
  const relative = path.relative(source, path.resolve(cacheRoot));
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('运行时缓存不能放在源运行时内部');
  }
  const digest = treeDigest(source);
  const safeVersion = version.replace(/[^a-zA-Z0-9._-]/g, '_');
  const cached = verifiedCopy(source, cacheRoot, `${safeVersion}-${process.arch}-${digest.slice(0, 24)}`, digest);
  const candidate = path.join(cached, path.basename(executable));
  const result = probe(candidate, env);
  if (!versionMatches(result, version)) {
    throw new Error(`原运行时启动异常 0x80000003；本地缓存自检也失败：${exitDescription(result)}。` +
      '未关闭沙盒或改动系统服务，请保留报错继续排查。');
  }
  warn(`Electron 原路径启动异常 0x80000003，已使用校验一致的本地运行时：${cached}`);
  return candidate;
}

module.exports = {childEnvironment, exitDescription, probeVersion, resolveRuntime, treeDigest};
