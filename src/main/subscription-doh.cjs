'use strict';
// Used only when system DNS returns benchmark/Fake-IP answers for a public
// hostname. The caller MUST validate every returned address before connecting.
// Only the hostname leaves this module: never a subscription path, token or body.
const https = require('node:https');
const net = require('node:net');
const MAX_BYTES = 64 * 1024;
const MAX_RECORDS = 256;
const PROVIDERS = Object.freeze([
  Object.freeze({ host: 'cloudflare-dns.com', ip: '1.1.1.1', path: '/dns-query' }),
  Object.freeze({ host: 'dns.google', ip: '8.8.8.8', path: '/resolve' })
]);
// Some proxy vendors return loopback answers outside their regional DNS view.
// This extra resolver is opt-in for proxy-node preparation, not subscriptions.
const NODE_PROVIDERS = Object.freeze([...PROVIDERS,
  Object.freeze({ host: 'dns.alidns.com', ip: '223.5.5.5', path: '/resolve', objectQuestion: true })
]);
function dnsError(code) { return Object.assign(new Error('安全 DNS 查询失败'), { code }); }
function isPublicHostname(host) {
  if (typeof host !== 'string' || host.length > 253 || net.isIP(host) || !host.includes('.')) return false;
  if (host !== host.toLowerCase() || host.endsWith('.')) return false;
  const localSuffixes = ['localhost', 'local', 'localdomain', 'internal', 'lan', 'home', 'arpa', 'test', 'invalid', 'example', 'onion'];
  if (localSuffixes.some(suffix => host === suffix || host.endsWith('.' + suffix))) return false;
  return host.split('.').every(label => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}
function normalizeName(name) { return typeof name === 'string' ? name.replace(/\.$/, '').toLowerCase() : ''; }
function parseReply(text, host, type, provider) {
  let data;
  try { data = JSON.parse(text); } catch { throw dnsError('DOH_BAD_RESPONSE'); }
  // AliDNS's JSON API uses one Question object; other providers use an array.
  const questions = provider.objectQuestion && data?.Question && !Array.isArray(data.Question)
    ? [data.Question] : data?.Question;
  if (!data || ![0, 3].includes(data.Status) || data.TC === true ||
      !Array.isArray(questions) || questions.length !== 1 ||
      normalizeName(questions[0]?.name) !== host || questions[0]?.type !== type) {
    throw dnsError('DOH_BAD_RESPONSE');
  }
  const answers = data.Answer === undefined ? [] : data.Answer;
  if (!Array.isArray(answers) || answers.length > MAX_RECORDS) throw dnsError('DOH_BAD_RESPONSE');
  const rows = [];
  for (const answer of answers) {
    if (!answer || typeof answer !== 'object') throw dnsError('DOH_BAD_RESPONSE');
    if (answer.type !== 1 && answer.type !== 28) continue; // CNAME chains are normal.
    const address = typeof answer.data === 'string' ? answer.data.trim() : '';
    const family = net.isIP(address);
    if (family !== (answer.type === 1 ? 4 : 6)) throw dnsError('DOH_BAD_RESPONSE');
    rows.push({ address, family });
  }
  if (data.Status === 3 && rows.length) throw dnsError('DOH_BAD_RESPONSE');
  return rows;
}
function queryType(provider, host, type, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(dnsError('ABORT_ERR'));
    const agent = new https.Agent({ keepAlive: false, rejectUnauthorized: true });
    let req, response, settled = false;
    const finish = (error, rows) => {
      if (settled) return;
      settled = true;
      response?.destroy(); req?.destroy(); agent.destroy();
      error ? reject(error) : resolve(rows);
    };
    try {
      req = https.request({
        protocol: 'https:', hostname: provider.host, port: 443,
        path: `${provider.path}?name=${encodeURIComponent(host)}&type=${type === 1 ? 'A' : 'AAAA'}`,
        method: 'GET', family: 4, servername: provider.host,
        rejectUnauthorized: true, agent, signal,
        // Bootstrap addresses are fixed public resolver IPs, never user input.
        // This avoids recursively asking the Fake-IP DNS for the DoH service.
        lookup: (_host, options, callback) => options.all
          ? callback(null, [{ address: provider.ip, family: 4 }])
          : callback(null, provider.ip, 4),
        headers: { Accept: 'application/dns-json', 'Accept-Encoding': 'identity' }
      }, res => {
        response = res;
        if (res.statusCode !== 200) return finish(dnsError('DOH_HTTP_STATUS'));
        if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') return finish(dnsError('DOH_BAD_RESPONSE'));
        if (Number(res.headers['content-length']) > MAX_BYTES) return finish(dnsError('DOH_BODY_LIMIT'));
        let size = 0;
        const chunks = [];
        res.on('data', chunk => {
          if (settled) return;
          size += chunk.length;
          if (size > MAX_BYTES) return finish(dnsError('DOH_BODY_LIMIT'));
          chunks.push(chunk);
        });
        res.on('error', () => finish(dnsError('DOH_RESPONSE_ERROR')));
        res.on('aborted', () => finish(dnsError('DOH_RESPONSE_ERROR')));
        res.on('end', () => {
          if (settled) return;
          try { finish(null, parseReply(Buffer.concat(chunks).toString('utf8'), host, type, provider)); }
          catch (error) { finish(error); }
        });
      });
      req.on('error', () => finish(dnsError(signal.aborted ? 'ABORT_ERR' : 'DOH_TRANSPORT_ERROR')));
      req.end();
    } catch { finish(dnsError('DOH_TRANSPORT_ERROR')); }
  });
}
async function queryProvider(provider, host, signal, timeoutMs) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) throw dnsError('ABORT_ERR');
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const answers = await Promise.all([1, 28].map(type => queryType(provider, host, type, controller.signal)));
    const unique = new Map();
    for (const row of answers.flat()) unique.set(row.family + ':' + row.address, row);
    return [...unique.values()].sort((a, b) => a.family - b.family);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    controller.abort(); // Cancel the sibling request if the other one failed.
  }
}
async function queryDohAddresses(host, { signal, timeoutMs = 3500, nodeFallback = false, acceptAddress = null } = {}) {
  if (!isPublicHostname(host)) throw dnsError('DOH_INVALID_HOST');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw dnsError('DOH_INVALID_LIMIT');
  if (typeof nodeFallback !== 'boolean' || (acceptAddress !== null && typeof acceptAddress !== 'function')) throw dnsError('DOH_INVALID_LIMIT');
  let nonPublic = false;
  for (const provider of nodeFallback ? NODE_PROVIDERS : PROVIDERS) {
    if (signal?.aborted) throw dnsError('ABORT_ERR');
    try {
      const rows = await queryProvider(provider, host, signal, timeoutMs);
      if (rows.length) {
        if (!acceptAddress || rows.every(row => acceptAddress(row.address))) return rows;
        nonPublic = true; // Reject the whole answer; do not cherry-pick public IPs.
      }
    } catch {
      if (signal?.aborted) throw dnsError('ABORT_ERR');
      // Try the next fixed provider, never a redirect supplied by a response.
    }
  }
  throw dnsError(nonPublic ? 'DOH_NONPUBLIC_ADDRESS' : 'DOH_UNAVAILABLE');
}
module.exports = { queryDohAddresses, isPublicHostname };
