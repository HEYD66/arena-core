'use strict';
const http = require('node:http');
const https = require('node:https');
const zlib = require('node:zlib');
const net = require('node:net');
const { safeError, normalizeHostname, resolvePublicHost, pinnedLookup } = require('./subscription-policy.cjs');

function subscriptionURL(value) {
  let url;
  try {
    if (typeof value !== 'string' || !value.trim() || value.length > 8192) throw Error();
    url = new URL(value.trim());
  } catch { throw safeError('请输入完整的 HTTP/HTTPS 订阅链接'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw safeError('订阅只允许 HTTP/HTTPS，不允许 URL 内嵌用户名密码');
  }
  url.hash = '';
  return url;
}

async function downloadSubscription(value, {
  maxBytes = 2 * 1024 * 1024, timeoutMs = 20000, maxRedirects = 3, allowPrivateHosts = false
} = {}) {
  const initial = subscriptionURL(value);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 2 * 1024 * 1024 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000 ||
      !Number.isSafeInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 10) {
    throw safeError('订阅下载限制参数无效');
  }
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);

  async function one(url) {
    // The same overall deadline covers DNS, every redirect, TLS and the body.
    const resolved = await resolvePublicHost(url, { allowPrivateHosts, signal: abort.signal });
    if (abort.signal.aborted) throw safeError('订阅下载超时，原配置未改变');
    return new Promise((resolve, reject) => {
      const transport = url.protocol === 'https:' ? https : http;
      const agent = new transport.Agent({ keepAlive: false, rejectUnauthorized: true });
      let req, body, settled = false;
      const done = (error, result) => {
        if (settled) return;
        settled = true;
        body?.destroy(); req?.destroy(); agent.destroy();
        error ? reject(error) : resolve(result);
      };
      const host = normalizeHostname(url.hostname);
      try {
        req = transport.request(url, {
          method: 'GET', agent, signal: abort.signal,
          lookup: resolved ? pinnedLookup(resolved) : undefined,
          family: resolved ? net.isIP(resolved) : undefined,
          servername: net.isIP(host) ? undefined : host,
          headers: {
            'User-Agent': 'clash.meta/1.19.31 Facet/0.2.0',
            Accept: 'application/yaml, text/yaml, application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br'
          }
        }, res => {
          const status = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(status)) {
            const location = res.headers.location;
            res.destroy();
            return location ? done(null, { redirect: location }) : done(safeError('订阅重定向缺少目标地址'));
          }
          if (status !== 200) { res.destroy(); return done(safeError(`订阅服务器返回 HTTP ${status}，原配置未改变`)); }
          if (/text\/html/i.test(res.headers['content-type'] || '')) { res.destroy(); return done(safeError('链接返回了网页，请使用 Clash/Mihomo 格式的订阅地址')); }
          if (Number(res.headers['content-length']) > maxBytes) { res.destroy(); return done(safeError('订阅内容超过 2MB 上限')); }
          let wire = 0, size = 0;
          const chunks = [];
          res.on('data', chunk => { wire += chunk.length; if (wire > maxBytes) done(safeError('订阅内容超过 2MB 上限')); });
          res.on('error', error => done(error));
          res.on('aborted', () => done(safeError('订阅传输中断，原配置未改变')));
          const encoding = String(res.headers['content-encoding'] || 'identity').trim().toLowerCase();
          if (encoding === 'gzip') body = res.pipe(zlib.createGunzip());
          else if (encoding === 'deflate') body = res.pipe(zlib.createInflate());
          else if (encoding === 'br') body = res.pipe(zlib.createBrotliDecompress());
          else if (encoding === 'identity' || !encoding) body = res;
          else { res.destroy(); return done(safeError('订阅使用了不支持的压缩格式')); }
          body.on('data', chunk => {
            size += chunk.length;
            if (size > maxBytes) return done(safeError('订阅解压后超过 2MB 上限'));
            chunks.push(chunk);
          });
          body.on('error', error => done(error));
          body.on('end', () => {
            if (!size) return done(safeError('订阅内容为空，原配置未改变'));
            done(null, { text: Buffer.concat(chunks).toString('utf8') });
          });
        });
        req.on('error', error => done(error));
        req.end();
      } catch (error) { done(error); }
    });
  }

  try {
    let url = initial;
    for (let i = 0; i <= maxRedirects; i++) {
      const result = await one(url);
      if (!result.redirect) return { url: initial.href, text: result.text };
      if (i === maxRedirects) throw safeError('订阅重定向次数过多');
      let next;
      try { next = subscriptionURL(new URL(result.redirect, url).href); }
      catch { throw safeError('订阅重定向地址无效'); }
      if (url.protocol === 'https:' && next.protocol !== 'https:') throw safeError('拒绝从 HTTPS 降级到 HTTP 的订阅重定向');
      url = next;
    }
    throw safeError('订阅下载失败');
  } catch (error) {
    if (abort.signal.aborted) throw safeError('订阅下载超时，原配置未改变');
    if (error.subscriptionSafe) throw error;
    throw safeError('订阅下载失败，请检查链接、网络或服务器证书；原配置未改变');
  } finally { clearTimeout(timer); }
}
module.exports = { downloadSubscription, subscriptionURL };
