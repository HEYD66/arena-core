'use strict';
// 自绘标题栏（仅 Windows 自定义边框时启用）：颜色跟随主题与配色，右侧系统按钮同步换色；
// 显示整个应用的 CPU / 内存占用（含 Mihomo 内核），每 2 秒刷新，窗口最小化或不可见时暂停。
(()=>{
 const root=document.documentElement,api=window.arenaCore,bar=document.getElementById('windowBar');
 if(root.dataset.frame!=='custom'||!api||!bar)return;
 const cpuEl=bar.querySelector('[data-cpu]'),memEl=bar.querySelector('[data-mem]'),meter=document.getElementById('resMeter');
 const parse=value=>{let c=String(value||'').trim(),m=c.match(/^#([0-9a-f]{3})$/i);if(m)c='#'+[...m[1]].map(x=>x+x).join('');m=c.match(/^#([0-9a-f]{6})$/i);if(m)return [0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16));m=c.match(/^rgba?\(([^)]+)\)$/);return m?m[1].split(/[\s,\/]+/).slice(0,3).map(Number):null;};
 const hex=rgb=>'#'+rgb.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
 let sent='';
 const sync=()=>{
  const cs=getComputedStyle(root),bg=parse(cs.getPropertyValue('--bg')),text=parse(cs.getPropertyValue('--text'));if(!bg||!text)return;
  // 比工作区背景略深/略亮一点，和下方标签行区分开，但仍属于同一配色。
  const k=root.dataset.theme==='dark'?.07:.055,color=hex(bg.map((v,i)=>v+(text[i]-v)*k)),symbolColor=hex(text);
  root.style.setProperty('--winbar',color);
  if(color+symbolColor===sent)return;sent=color+symbolColor;
  Promise.resolve(api.request('window-chrome',{color,symbolColor})).catch(()=>{});
 };
 new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['data-theme','data-light-palette','data-dark-palette']});sync();
 const size=mb=>mb>=1024?`${(mb/1024).toFixed(mb>=10240?1:2)} GB`:`${Math.max(0,Math.round(mb))} MB`;
 let timer=0,busy=false;
 const tick=async()=>{
  clearTimeout(timer);timer=0;if(document.hidden||busy)return;busy=true;
  try{const r=await api.request('app-metrics');if(r?.ok&&r.value){const v=r.value;cpuEl.textContent=`${Math.round(v.cpu)}%`;memEl.textContent=size(v.memoryMB);
   meter.title=`千面整体占用：界面、GPU、各实例网页与扩展${v.cores?`，以及 ${v.cores} 个 Mihomo 内核（约 ${size(v.coreMB)}）`:''}；共 ${v.processes+v.cores} 个进程。\nCPU 按电脑总核数折算；内存为私有内存，与任务管理器“内存”列口径一致。`;}}
  catch{}finally{busy=false;}
  if(!document.hidden)timer=setTimeout(tick,2000);
 };
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!timer)tick();});
 tick();
})();
