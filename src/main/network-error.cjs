'use strict';
// Only fixed categories leave this module; never return raw URLs, hosts or credentials.
const net=require('node:net');
function networkError(value){const text=String(value||'').toLowerCase();
 if(/address already in use|only one usage of each socket|bind.*permission/.test(text))return '本地端口绑定失败：端口被占用或系统拒绝访问';
 if(/no such host|dns.*fail|name.*not.*resolved|err_name_not_resolved|lookup .*:/.test(text))return 'DNS 解析失败：请检查节点域名解析与 Clash 的 DNS 设置差异';
 if(/network is unreachable|no route to host|unreachable network|requested address is not valid|cannot assign requested address|enetunreach|ehostunreach/.test(text)){
  const ipv6=/\b(?:tcp6|udp6|ipv6)\b/.test(text)||[...text.matchAll(/\[([^\]\s]+)\]/g)].some(match=>net.isIP(match[1].split('%')[0])===6);
  return ipv6?'IPv6 连接路由不可达：请检查本机 IPv6 出站连接及网卡或 VPN/TUN 路由':'网络路由不可达：请检查本机网络、网卡或 VPN/TUN 路由';
 }
 if(/certificate|x509|err_cert/.test(text))return 'TLS 证书校验失败：检查系统时间、节点 SNI 和证书配置';
 if(/authentication|unauthorized|invalid password|status.*407/.test(text))return '代理认证失败：检查节点凭证或重新更新订阅';
 if(/connection refused|actively refused|econnrefused|err_connection_refused/.test(text))return '连接被拒绝：检查节点地址、端口及服务状态';
 if(/timeout|timed out|deadline exceeded|超时/.test(text))return '连接超时：可能是节点链路或检测目标无响应';
 if(/tls.*handshake|handshake.*fail/.test(text))return 'TLS 握手失败：检查节点协议、SNI 与网络链路';
 if(/connection.*closed|connection.*reset|err_connection_closed|err_connection_reset|unexpected eof/.test(text))return '连接被关闭或重置：需要进一步核对节点参数与链路';
 return '';
}
module.exports={networkError};
