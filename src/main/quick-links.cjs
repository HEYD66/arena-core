'use strict';
const {safeURL}=require('./store.cjs');
const DEFAULT_LINKS=[['arena','Arena','https://arena.ai/agent'],['chatgpt','ChatGPT','https://chatgpt.com/'],['claude','Claude','https://claude.ai/new'],['gemini','Gemini','https://gemini.google.com/app'],['grok','Grok','https://grok.com/']];
function linkFields(value={}){const name=String(value.name??'').trim(),raw=String(value.url??'').trim();if(!name||name.length>24||/[\x00-\x1f\x7f]/.test(name))throw Error('名称需为1–24个字符，不能含控制字符');if(!raw||raw.length>2048||/[\x00-\x1f\x7f]/.test(raw))throw Error('请输入2048字符以内的有效网址');const url=safeURL(raw);if(url.length>2048)throw Error('网址过长');return {name,url};}
function initialLinks(value){if(value===undefined)return DEFAULT_LINKS.map(([id,name,url])=>({id:'quick-'+id,name,url}));if(!Array.isArray(value)||value.length>20)throw Error('快捷网站数据格式无效');const ids=new Set();return value.map(row=>{if(!row||typeof row.id!=='string'||!/^[-\w]{1,80}$/.test(row.id)||ids.has(row.id))throw Error('快捷网站标识无效或重复');ids.add(row.id);return {id:row.id,...linkFields(row)};});}
module.exports={linkFields,initialLinks};
