'use strict';
const {safeURL,DEFAULT_INSTANCE_URL}=require('./store.cjs');
const MAX_LINKS=21;
const DEFAULT_LINKS=[['ipip','ipip.la',DEFAULT_INSTANCE_URL],['arena','Arena','https://arena.ai/agent'],['chatgpt','ChatGPT','https://chatgpt.com/'],['claude','Claude','https://claude.ai/new'],['gemini','Gemini','https://gemini.google.com/app'],['grok','Grok','https://grok.com/']];
function linkFields(value={}){const name=String(value.name??'').trim(),raw=String(value.url??'').trim();if(!name||name.length>24||/[\x00-\x1f\x7f]/.test(name))throw Error('名称需为1–24个字符，不能含控制字符');if(!raw||raw.length>2048||/[\x00-\x1f\x7f]/.test(raw))throw Error('请输入2048字符以内的有效网址');const url=safeURL(raw);if(url.length>2048)throw Error('网址过长');return {name,url};}
function initialLinks(value){if(value===undefined)return DEFAULT_LINKS.map(([id,name,url])=>({id:'quick-'+id,name,url}));if(!Array.isArray(value)||value.length>MAX_LINKS)throw Error('快捷网站数据格式无效');const ids=new Set();return value.map(row=>{if(!row||typeof row.id!=='string'||!/^[-\w]{1,80}$/.test(row.id)||ids.has(row.id))throw Error('快捷网站标识无效或重复');ids.add(row.id);return {id:row.id,...linkFields(row)};});}
// One-time upgrade: retain custom names, IDs and order; never discard a full legacy list.
function withDisguiseFirst(links){const found=links.find(x=>x.url===DEFAULT_INSTANCE_URL);if(found)return [found,...links.filter(x=>x.id!==found.id)];if(links.length>=MAX_LINKS)throw Error('快捷网站已满，无法添加 ipip.la；原配置已保留');const id=links.some(x=>x.id==='quick-ipip')?require('node:crypto').randomUUID():'quick-ipip';return [{id,name:'ipip.la',url:DEFAULT_INSTANCE_URL},...links];}
module.exports={linkFields,initialLinks,withDisguiseFirst,MAX_LINKS};
