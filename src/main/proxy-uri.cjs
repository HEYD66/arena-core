'use strict';

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const net = require('node:net');

function decodePart(value, field) {
  try {
    const decoded = decodeURIComponent(value);
    if (CONTROL_CHARACTERS.test(decoded)) throw new Error('control character');
    return decoded;
  } catch {
    throw Error(`SOCKS5 节点${field}编码无效`);
  }
}

function parseSocks5Uri(input) {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!/^socks5:\/\//i.test(value)) return null;
  if (value.length > 8192 || /[\u0000-\u0020\u007f]/.test(value)) throw Error('SOCKS5 节点链接含无效字符或过长');

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw Error('SOCKS5 节点链接格式无效');
  }
  if (parsed.protocol !== 'socks5:') throw Error('仅支持 socks5:// 节点链接');
  if (parsed.search || (parsed.pathname && parsed.pathname !== '/')) {
    throw Error('SOCKS5 节点链接不能包含路径或查询参数');
  }

  const server = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (!validHost(server)) {
    throw Error('SOCKS5 节点地址无效');
  }
  const port = Number(parsed.port);
  if (!parsed.port || !/^\d+$/.test(parsed.port) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw Error('SOCKS5 节点端口需为 1–65535');
  }

  const hasUsername = parsed.username !== '';
  const hasPassword = parsed.password !== '';
  if (hasPassword && !hasUsername) throw Error('SOCKS5 节点密码缺少用户名');
  const username = hasUsername ? decodePart(parsed.username, '用户名') : '';
  const password = hasPassword ? decodePart(parsed.password, '密码') : '';
  if (hasUsername && !username) throw Error('SOCKS5 节点用户名不能为空');

  const remark = parsed.hash ? decodePart(parsed.hash.slice(1), '备注').trim() : '';
  const displayServer = server.includes(':') ? `[${server}]` : server;
  const name = remark || `${displayServer}:${port}`;
  if (CONTROL_CHARACTERS.test(name) || name.length > 80) throw Error('SOCKS5 节点备注需为 1–80 个字符');

  return { name, node: proxyFields({ protocol: 'socks5', host: server, port, name, username, password }) };
}

function validHost(host) {
  return typeof host === 'string' && host.length <= 253 && !!host &&
    (net.isIP(host) !== 0 || (!/^[\d.]+$/.test(host) && host.split('.').every(part => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(part))));
}

function proxyFields(input) {
  if (!input || !['http', 'https', 'socks5'].includes(input.protocol)) throw Error('请选择 HTTP、HTTPS 或 SOCKS5');
  const server = String(input.host || '').trim().replace(/^\[(.*)\]$/, '$1');
  if (!validHost(server)) throw Error('请输入有效的主机 IP 或域名');
  const rawPort = String(input.port ?? '');
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) throw Error('代理端口需为 1–65535');
  const username = String(input.username || ''), password = String(input.password || '');
  if (password && !username) throw Error('填写密码时请同时填写用户名');
  if ([username, password].some(s => CONTROL_CHARACTERS.test(s) || Buffer.byteLength(s) > (input.protocol === 'socks5' ? 255 : 1024))) throw Error('代理认证字段含无效字符或过长');
  const name = String(input.name || '').trim() || `${server.includes(':') ? `[${server}]` : server}:${port}`;
  if (CONTROL_CHARACTERS.test(name) || name.length > 80) throw Error('名称需要 1–80 个字符');
  const node = { name, type: input.protocol === 'socks5' ? 'socks5' : 'http', server, port };
  if (input.protocol === 'https') node.tls = true;
  if (username) node.username = username;
  if (password) node.password = password;
  return node;
}

function parseProxyUri(input) {
  if (typeof input !== 'string' || input.trim().length > 8192 || /[\u0000-\u0020\u007f]/.test(input.trim())) throw Error('代理链接格式无效');
  const text = input.trim();
  if (/^socks5:\/\//i.test(text)) {
    const { node } = parseSocks5Uri(text);
    return { protocol: 'socks5', host: node.server, port: node.port, username: node.username || '', password: node.password || '', name: node.name };
  }
  let url;
  try { url = new URL(text); } catch { throw Error('代理链接格式无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || (url.pathname && url.pathname !== '/') || url.search) throw Error('只支持无路径或查询参数的 HTTP、HTTPS、SOCKS5 代理链接');
  // URL removes default HTTP(S) ports. Require an explicit port in the original authority.
  const authority = text.split('://')[1]?.split(/[/?#]/)[0]?.split('@').at(-1);
  const rawPort = authority?.match(/:(\d+)$/)?.[1];
  if (!rawPort) throw Error('代理链接需要明确指定端口');
  const fields = { protocol: url.protocol.slice(0, -1), host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(rawPort), username: decodePart(url.username, '用户名'), password: decodePart(url.password, '密码'), name: decodePart(url.hash.slice(1), '备注') };
  const node = proxyFields(fields);
  fields.name = node.name;
  return fields;
}

module.exports = { parseSocks5Uri, proxyFields, parseProxyUri };
