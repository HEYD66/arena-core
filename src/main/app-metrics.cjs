'use strict';
// 标题栏“应用资源占用”：Electron 全部进程（界面、GPU、各实例网页、扩展/工具进程）的 CPU 与内存，加上本应用启动的各 Mihomo 内核内存。
// CPU 按电脑总核数折算（与任务管理器口径一致）；内存优先取私有内存（Windows），否则取工作集。
const {app}=require('electron'),os=require('node:os'),{execFile}=require('node:child_process');
const CORE_SAMPLE_MS=5000;
const cores={at:0,kb:new Map(),pending:null};
// tasklist /FO CSV /NH 输出："mihomo.exe","1234","Console","1","35,512 K"（千分位随系统区域变化，只取数字）。
function parseTasklist(text){const out=new Map();for(const line of String(text||'').split(/\r?\n/)){const cols=[...line.matchAll(/"([^"]*)"/g)].map(m=>m[1]);if(cols.length<5)continue;const pid=Number(cols[1]),kb=Number(cols[4].replace(/\D/g,''));if(pid>0&&cols[4].replace(/\D/g,'')!=='')out.set(pid,kb);}return out;}
// ps -o pid=,rss= 输出：每行 "pid rss(KB)"。
function parsePs(text){const out=new Map();for(const line of String(text||'').split(/\r?\n/)){const m=line.trim().match(/^(\d+)\s+(\d+)$/);if(m)out.set(Number(m[1]),Number(m[2]));}return out;}
function sampleCores(pids){
 if(cores.pending)return cores.pending;
 cores.pending=new Promise(resolve=>{
  const done=(error,stdout)=>{cores.pending=null;cores.at=Date.now();if(!error)cores.kb=process.platform==='win32'?parseTasklist(stdout):parsePs(stdout);resolve();};
  try{if(process.platform==='win32')execFile('tasklist',['/FO','CSV','/NH','/FI','IMAGENAME eq mihomo.exe'],{windowsHide:true,timeout:4000},done);else execFile('ps',['-o','pid=,rss=','-p',pids.join(',')],{timeout:4000},done);}catch(e){done(e,'');}
 });
 return cores.pending;
}
async function appMetrics(controller){
 const list=app.getAppMetrics();let cpu=0,kb=0;
 for(const p of list){cpu+=Number(p.cpu?.percentCPUUsage)||0;kb+=Number(p.memory?.privateBytes||p.memory?.workingSetSize)||0;}
 const pids=[...(controller?.runtimes?.values()||[])].map(r=>r.core?.child?.pid).filter(pid=>Number(pid)>0);
 // 内核内存每 5 秒采样一次；首次（或刚启动内核）等待采样结果，其余时间直接用缓存，避免拖慢 2 秒一次的刷新。
 if(pids.length&&(Date.now()-cores.at>CORE_SAMPLE_MS||pids.some(pid=>!cores.kb.has(pid)))){const job=sampleCores(pids);if(pids.some(pid=>!cores.kb.has(pid)))await job;}
 let coreKb=0;for(const pid of pids)coreKb+=cores.kb.get(pid)||0;
 return {cpu:Math.max(0,Math.min(100,cpu/Math.max(1,os.cpus().length))),memoryMB:(kb+coreKb)/1024,coreMB:coreKb/1024,processes:list.length,cores:pids.length};
}
module.exports={appMetrics,parseTasklist,parsePs};
