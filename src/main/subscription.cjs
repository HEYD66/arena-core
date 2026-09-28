'use strict';
const http=require('node:http'),https=require('node:https'),zlib=require('node:zlib');
function safeError(message){const e=new Error(message);e.subscriptionSafe=true;return e;}
function subscriptionURL(value){let url;try{if(typeof value!=='string'||!value.trim()||value.length>8192)throw Error();url=new URL(value.trim());}catch{throw safeError('请输入完整的 HTTP/HTTPS 订阅链接');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw safeError('订阅只允许 HTTP/HTTPS，不允许 URL 内嵌用户名密码');url.hash='';return url;}
async function downloadSubscription(value,{maxBytes=2*1024*1024,timeoutMs=20000,maxRedirects=3}={}){
 const initial=subscriptionURL(value),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),timeoutMs);
 async function one(url){return new Promise((resolve,reject)=>{
  const transport=url.protocol==='https:'?https:http,agent=new transport.Agent({keepAlive:false,rejectUnauthorized:true});
  let req,body,settled=false;
  const done=(error,result)=>{if(settled)return;settled=true;body?.destroy();req?.destroy();agent.destroy();error?reject(error):resolve(result);};
  req=transport.request(url,{method:'GET',agent,signal:abort.signal,headers:{'User-Agent':'clash.meta/1.19.31 Facet/0.2.0','Accept':'application/yaml, text/yaml, application/json, text/plain, */*','Accept-Encoding':'gzip, deflate, br'}},res=>{
   const status=res.statusCode||0;
   if([301,302,303,307,308].includes(status)){const location=res.headers.location;res.destroy();if(!location)return done(safeError('订阅重定向缺少目标地址'));return done(null,{redirect:location});}
   if(status!==200){res.destroy();return done(safeError(`订阅服务器返回 HTTP ${status}，原配置未改变`));}
   if(/text\/html/i.test(res.headers['content-type']||'')){res.destroy();return done(safeError('链接返回了网页，请使用 Clash/Mihomo 格式的订阅地址'));}
   if(Number(res.headers['content-length'])>maxBytes){res.destroy();return done(safeError('订阅内容超过 2MB 上限'));}
   let wire=0,size=0;const chunks=[];
   res.on('data',chunk=>{wire+=chunk.length;if(wire>maxBytes)done(safeError('订阅内容超过 2MB 上限'));});res.on('error',e=>done(e));res.on('aborted',()=>done(safeError('订阅传输中断，原配置未改变')));
   const encoding=String(res.headers['content-encoding']||'identity').trim().toLowerCase();
   if(encoding==='gzip')body=res.pipe(zlib.createGunzip());else if(encoding==='deflate')body=res.pipe(zlib.createInflate());else if(encoding==='br')body=res.pipe(zlib.createBrotliDecompress());else if(encoding==='identity'||!encoding)body=res;else{res.destroy();return done(safeError('订阅使用了不支持的压缩格式'));}
   body.on('data',chunk=>{size+=chunk.length;if(size>maxBytes)return done(safeError('订阅解压后超过 2MB 上限'));chunks.push(chunk);});body.on('error',e=>done(e));body.on('end',()=>{if(!size)return done(safeError('订阅内容为空，原配置未改变'));done(null,{text:Buffer.concat(chunks).toString('utf8')});});
  });req.on('error',e=>done(e));req.end();
 });}
 try{let url=initial;for(let i=0;i<=maxRedirects;i++){const result=await one(url);if(!result.redirect)return {url:initial.href,text:result.text};if(i===maxRedirects)throw safeError('订阅重定向次数过多');let next;try{next=subscriptionURL(new URL(result.redirect,url).href);}catch{throw safeError('订阅重定向地址无效');}if(url.protocol==='https:'&&next.protocol!=='https:')throw safeError('拒绝从 HTTPS 降级到 HTTP 的订阅重定向');url=next;}throw safeError('订阅下载失败');}
 catch(e){if(abort.signal.aborted)throw safeError('订阅下载超时，原配置未改变');if(e.subscriptionSafe)throw e;throw safeError('订阅下载失败，请检查链接、网络或服务器证书；原配置未改变');}
 finally{clearTimeout(timer);}
}
module.exports={downloadSubscription,subscriptionURL};
