'use strict';
const net=require('node:net'),crypto=require('node:crypto');
const {networkError}=require('./network-error.cjs');
const PROVIDERS=[
 {id:'ipsb',name:'IP.SB',url:'https://api.ip.sb/geoip'},
 {id:'geojs',name:'GeoJS',url:'https://get.geojs.io/v1/ip/geo.json'},
 {id:'ipapi',name:'ipapi.co',url:'https://ipapi.co/json/'},
 {id:'ipwho',name:'ipwho.is',url:'https://ipwho.is/'}
];
const DEFAULT_ENDPOINT=PROVIDERS[0].url;
function identity(node){return crypto.createHash('sha256').update(JSON.stringify(node||{mode:'direct'})).digest('hex');}
function normalize(provider,data,requireLocale=false){
 if(!data||data.success===false||data.error||!net.isIP(data.ip))throw Error('出口数据无效');
 const text=value=>typeof value==='string'?value.slice(0,100):'';
 const timezone=text(provider.id==='ipwho'?data.timezone?.id:data.timezone);
 let zone='';try{if(timezone){new Intl.DateTimeFormat('en',{timeZone:timezone});zone=timezone;}}catch{}
 const code=text(data.country_code).toUpperCase(),countryCode=/^[A-Z]{2}$/.test(code)&&!['ZZ','XX'].includes(code)?code:'';
 if(requireLocale&&(!zone||!countryCode))throw Error('缺少有效国家或 IANA 时区');
 return {ip:data.ip,countryCode,country:text(provider.id==='ipapi'?data.country_name:data.country),region:text(data.region),city:text(data.city),timezone:zone,isp:text(provider.id==='ipwho'?data.connection?.isp:provider.id==='geojs'?data.organization_name:data.isp||data.organization||data.org),provider:provider.name};
}
function delay(ms,signal){signal.throwIfAborted();return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal.reason||Error('已取消'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},Math.max(0,ms));signal.addEventListener('abort',abort,{once:true});});}
function retryAfter(value,now){if(value===null||value===undefined||value==='')return 60000;const seconds=Number(value);const duration=Number.isFinite(seconds)?seconds*1000:Date.parse(value)-now;return Number.isFinite(duration)?Math.min(86400000,Math.max(1000,duration)):60000;}
async function read(response,signal){
 if(!response.body)throw Error('空响应');const reader=response.body.getReader();const chunks=[];let bytes=0;
 try{for(;;){signal.throwIfAborted();const item=await reader.read();if(item.done)break;bytes+=item.value.length;if(bytes>65536)throw Error('响应超过 64KB');chunks.push(Buffer.from(item.value));}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}finally{await reader.cancel().catch(()=>{});}
}
class IPLookup {
 constructor({providers=PROVIDERS,interval=800,ttl=60000,timeout=6000,now=Date.now}={}){this.providers=providers.map(p=>({...p}));this.interval=interval;this.ttl=ttl;this.timeout=timeout;this.now=now;this.cache=new Map();this.limits=new Map();}
 clear(){this.cache.clear();}
 async lookup(key,fetch,signal,{force=false,requireLocale=false,providers=this.providers}={}){
  signal.throwIfAborted();const cacheKey=identity([key,providers.map(p=>[p.id,p.url])]);const cached=this.cache.get(cacheKey);
  if(!force&&cached&&this.now()-cached.at<this.ttl&&(!requireLocale||(cached.value.countryCode&&cached.value.timezone)))return {...cached.value,cached:true};
  if(force||cached)this.cache.delete(cacheKey);
  const errors=[];
  for(const provider of providers){
   signal.throwIfAborted();const state=this.limits.get(provider.id)||{next:0,cooldown:0};this.limits.set(provider.id,state);
   if(state.cooldown>this.now()){errors.push(provider.name+' 限流冷却中');continue;}
   const reserved=Math.max(this.now(),state.next);state.next=reserved+this.interval;
   await delay(reserved-this.now(),signal);
   if(state.cooldown>this.now()){errors.push(provider.name+' 限流冷却中');continue;}
   const abort=new AbortController(),timer=setTimeout(()=>abort.abort(Error('查询超时')),this.timeout),requestSignal=AbortSignal.any([signal,abort.signal]);
   try{
    const response=await fetch(provider.url,requestSignal);
    if(response.status===429){state.cooldown=this.now()+retryAfter(response.headers.get('retry-after'),this.now());await response.body?.cancel().catch(()=>{});errors.push(provider.name+' HTTP 429（限流）');continue;}
    if(!response.ok){await response.body?.cancel().catch(()=>{});errors.push(provider.name+' HTTP '+response.status);continue;}
    const value={...normalize(provider,await read(response,requestSignal),requireLocale),queriedAt:new Date(this.now()).toISOString(),cached:false};requestSignal.throwIfAborted();
    this.cache.delete(cacheKey);this.cache.set(cacheKey,{at:this.now(),value});if(this.cache.size>256)this.cache.delete(this.cache.keys().next().value);return {...value};
   }catch(error){if(signal.aborted)throw signal.reason;errors.push(provider.name+' '+(abort.signal.aborted?'查询超时':networkError(error.message)||'响应无效或字段不完整'));}
   finally{clearTimeout(timer);}
  }
  const error=Error('所有出口查询服务均失败');error.safeDiagnostic=errors.join('；')+'；未回退直连';throw error;
 }
}
module.exports={PROVIDERS,DEFAULT_ENDPOINT,IPLookup,normalize,identity,retryAfter};
