'use strict';
const fs=require('node:fs'),path=require('node:path'),{StringDecoder}=require('node:string_decoder');
const {atomic}=require('./json-storage.cjs');
const {redact}=require('./workspace.cjs');
function safeLine(text){return redact(String(text).replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').replace(/\b(?:cookie|set-cookie|session|api[-_]?key|authorization)\s*[:=].*/gi,'[凭据已隐藏]').replace(/\b(?:password|passwd|token|secret|username)\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/gi,'[凭据已隐藏]'));}
class RuntimeOutput {
 constructor(file){this.file=file;this.rows=[];this.streams=new Map();this.timer=null;this.warning='';}
 write(channel,chunk){let stream=this.streams.get(channel);if(!stream){stream={decoder:new StringDecoder('utf8'),pending:''};this.streams.set(channel,stream);}stream.pending+=stream.decoder.write(Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk)));const lines=stream.pending.split(/\r?\n/);stream.pending=lines.pop();for(const line of lines)this.record(channel,line);if(stream.pending.length>16384)stream.pending='[超长输出已省略]';}
 record(channel,line){if(!line.trim())return;this.rows.push({time:new Date().toISOString(),channel,text:safeLine(line)});if(this.rows.length>1000)this.rows.splice(0,this.rows.length-1000);if(!this.timer){this.timer=setTimeout(()=>this.flush(),200);this.timer.unref?.();}}
 flush(){clearTimeout(this.timer);this.timer=null;try{atomic(this.file,{rows:this.rows,warning:this.warning},{backup:false});}catch{this.warning='运行输出写盘失败';}}
 close(){for(const [channel,stream]of this.streams){const tail=stream.pending+stream.decoder.end();if(tail.trim())this.record(channel,tail);}this.streams.clear();this.flush();}
}
function readRuntimeOutput(file=process.env.FACET_RUNTIME_OUTPUT){if(!file)return {rows:[],warning:'当前启动方式未接入运行输出，请通过 npm start 启动。'};try{if(fs.statSync(file).size>4*1024*1024)throw Error('too large');const data=JSON.parse(fs.readFileSync(file,'utf8'));return {rows:Array.isArray(data.rows)?data.rows.slice(-1000).map(r=>({time:String(r.time||''),channel:r.channel==='stderr'?'stderr':'stdout',text:safeLine(r.text||'')})):[],warning:String(data.warning||'')};}catch(e){return {rows:[],warning:e.code==='ENOENT'?'等待运行输出…':'运行输出暂时不可读取'};}}
module.exports={RuntimeOutput,readRuntimeOutput,safeLine};
