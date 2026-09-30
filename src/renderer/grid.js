// 宫格总览：所有实例在一个页面里并排显示。
// 实时模式：完整可见的运行中格子直接显示真实网页（按正常浏览尺寸排版后缩小渲染，可点击、输入）。
// 省资源模式：只有选中的格子实时显示，其余每 2 秒刷新一次缩略图。已停止的实例只显示占位，不占内存。
// 注意：本文件在 app.js 之前加载，只能在函数内部引用 app.js 的全局变量（bridge、state、view 等）。
let gridPrefs=(()=>{try{const v=JSON.parse(localStorage.getItem('facet-grid')||'{}');return {mode:v.mode==='saver'?'saver':'live',cols:[2,3,4,5,6].includes(v.cols)?v.cols:'auto'};}catch{return {mode:'live',cols:'auto'};}})();
let gridFocus=null,gridTimer=null,gridFrame=0,gridSig='',gridActive=false,lastBrowserHostSize=null;
const gridThumbCache=new Map();
function gridSave(){try{localStorage.setItem('facet-grid',JSON.stringify(gridPrefs));}catch{}}
// 页面按“正常浏览页面”的尺寸排版；还没打开过浏览页面时按内容区估算。
function gridBaseSize(){if(lastBrowserHostSize)return lastBrowserHostSize;const c=document.getElementById('content')?.getBoundingClientRect();return c&&c.width>=320&&c.height>=240?{width:Math.round(c.width),height:Math.round(c.height)}:{width:1280,height:800};}
function gridAspect(x,base){const e=x.environment||{};return e.width&&e.height?`${e.width}/${e.height}`:`${base.width}/${base.height}`;}
function gridColumns(n){if(gridPrefs.cols!=='auto')return gridPrefs.cols;const want=n<=1?1:n<=4?2:n<=9?3:n<=16?4:5;const board=document.getElementById('content')?.clientWidth||1200;return Math.max(1,Math.min(want,Math.floor((board-40)/240)));}
function gridSignature(){return gridPrefs.mode+'|'+gridPrefs.cols+'|'+state.instances.map(i=>[i.id,i.name,i.status,i.proxyAlert&&i.status==='running'?1:0,i.environment?.width||0,i.environment?.height||0].join(':')).join(',');}
function gridTile(x,base){const running=x.status==='running',starting=x.status==='starting';
 const body=running?`<img class="grid-thumb" alt="">`:`<div class="grid-placeholder">${starting?'<span>启动中…</span>':`<button class="grid-play" data-grid-act="start" title="启动 ${esc(x.name)}" aria-label="启动 ${esc(x.name)}">${icon('play')}</button><span>${x.status==='error'?'异常 · 点击重新启动':'未启动 · 不占内存'}</span>`}</div>`;
 return `<article class="grid-tile ${gridPrefs.mode==='saver'&&gridFocus===x.id?'focused':''}" data-grid-id="${esc(x.id)}"><header class="grid-tile-head"><span class="grid-name" title="${esc(x.name)} · ${esc(networkText(x))}">${esc(x.name)}</span>${status(x)}<span class="grid-tools">${running?`<button class="icon-btn" data-grid-act="reload" title="刷新页面" aria-label="刷新 ${esc(x.name)}">${icon('refresh')}</button>`:''}${running||starting?`<button class="icon-btn grid-stop" data-grid-act="stop" title="停止实例" aria-label="停止 ${esc(x.name)}">${icon('stop')}</button>`:`<button class="icon-btn" data-grid-act="start" title="启动实例" aria-label="启动 ${esc(x.name)}">${icon('play')}</button>`}<button class="icon-btn" data-grid-act="open" title="在浏览页面打开" aria-label="在浏览页面打开 ${esc(x.name)}">${icon('arrow')}</button></span></header><div class="grid-body" style="aspect-ratio:${gridAspect(x,base)}">${body}</div></article>`;}
function gridPage(){gridActive=true;const list=state.instances,base=gridBaseSize(),running=list.filter(i=>i.status==='running').length,idle=list.filter(i=>i.status==='stopped'||i.status==='error').length,live=gridPrefs.mode==='live';
 for(const id of [...gridThumbCache.keys()])if(!list.some(i=>i.id===id&&i.status==='running'))gridThumbCache.delete(id);
 if(gridFocus&&!list.some(i=>i.id===gridFocus&&i.status==='running'))gridFocus=null;
 if(!gridFocus)gridFocus=(list.find(i=>i.id===activeId&&i.status==='running')||list.find(i=>i.status==='running'))?.id||null;
 $('#content').innerHTML=`<div class="grid-toolbar"><div class="segments" role="group" aria-label="格子显示方式"><button data-grid-mode="live" class="${live?'active':''}" aria-pressed="${live}" title="可见的格子都显示真实网页，可直接操作">实时</button><button data-grid-mode="saver" class="${live?'':'active'}" aria-pressed="${!live}" title="只有选中的格子实时显示，其余显示定时刷新的缩略图">省资源</button></div><label class="grid-cols">列数<select id="gridCols" aria-label="列数"><option value="auto" ${gridPrefs.cols==='auto'?'selected':''}>自动</option>${[2,3,4,5,6].map(n=>`<option value="${n}" ${gridPrefs.cols===n?'selected':''}>${n} 列</option>`).join('')}</select></label><span class="grid-hint">${live?'完整可见的格子是真实网页，可直接点击和输入；滚出视野的格子显示缩略图。':'点击格子让它实时显示，其余每 2 秒刷新缩略图，更省 CPU 和显卡。'}</span><span class="grid-count"><b>${running}</b> / ${list.length} 运行</span><button class="btn tiny" data-grid-act="start-all" ${idle?'':'disabled'}>${icon('play')}全部启动</button><button class="btn tiny danger" data-grid-act="stop-all" ${running?'':'disabled'}>${icon('stop')}全部停止</button></div>${list.length?`<div class="grid-board" style="--grid-cols:${gridColumns(list.length)}">${list.map(x=>gridTile(x,base)).join('')}</div>`:`<div class="grid-empty"><p>还没有实例。</p><button class="btn primary" data-action="new">${icon('plus')}新建实例</button></div>`}`;
 gridSig=gridSignature();gridPaintThumbs();gridStartTimer();}
function gridPaintThumbs(){for(const el of document.querySelectorAll('.grid-tile')){const img=el.querySelector('.grid-thumb'),url=gridThumbCache.get(el.dataset.gridId);if(img&&url&&img.getAttribute('src')!==url)img.src=url;}}
function gridStartTimer(){if(gridTimer)return;gridTimer=setInterval(gridPollThumbs,2000);setTimeout(gridPollThumbs,350);}
async function gridPollThumbs(){if(view!=='grid'){gridLeave();return;}if(document.hidden||!bridge)return;try{const res=await bridge.request('grid-thumbs',{});if(!res?.ok||view!=='grid')return;for(const [id,url] of Object.entries(res.value||{}))if(typeof url==='string'&&url.startsWith('data:image/'))gridThumbCache.set(id,url);gridPaintThumbs();}catch{}}
// 把每个运行中格子的位置告诉主进程。原生网页层盖在界面之上且无法裁剪，所以只有完整可见、且没有弹窗时才实时显示。
function gridSendLayout(){if(view!=='grid'||!bridge||gridFrame)return;gridFrame=requestAnimationFrame(()=>{gridFrame=0;if(view!=='grid')return;const content=$('#content');if(!content)return;
 const board=content.querySelector('.grid-board');if(board){const cols=String(gridColumns(state.instances.length));if(board.style.getPropertyValue('--grid-cols')!==cols)board.style.setProperty('--grid-cols',cols);}
 const c=content.getBoundingClientRect(),covered=!!modal||!!document.querySelector('dialog[data-browser-overlay][open],details.row-menu[open]'),tiles=[];
 for(const el of content.querySelectorAll('.grid-tile')){const x=state.instances.find(i=>i.id===el.dataset.gridId);if(x?.status!=='running')continue;const b=el.querySelector('.grid-body')?.getBoundingClientRect();if(!b||b.width<40||b.height<30)continue;
  const inside=b.top>=c.top-0.5&&b.bottom<=c.bottom+0.5&&b.left>=c.left-0.5&&b.right<=c.right+0.5;
  tiles.push({id:x.id,x:b.x,y:b.y,width:b.width,height:b.height,live:!covered&&inside&&(gridPrefs.mode==='live'||gridFocus===x.id)});}
 bridge.request('grid-layout',{grid:{base:gridBaseSize(),tiles}}).catch(()=>{});});}
function gridLeave(){if(!gridActive)return;gridActive=false;clearInterval(gridTimer);gridTimer=null;if(gridFrame){cancelAnimationFrame(gridFrame);gridFrame=0;}bridge?.request('grid-layout',{grid:null}).catch(()=>{});}
function gridSetFocus(id){if(gridFocus===id)return;gridFocus=id;document.querySelectorAll('.grid-tile').forEach(el=>el.classList.toggle('focused',gridPrefs.mode==='saver'&&el.dataset.gridId===gridFocus));gridSendLayout();}
document.addEventListener('click',async e=>{if(view!=='grid')return;const t=e.target;
 const mode=t.closest('[data-grid-mode]');if(mode){if(gridPrefs.mode!==mode.dataset.gridMode){gridPrefs.mode=mode.dataset.gridMode;gridSave();render(true);}return;}
 const act=t.closest('[data-grid-act]'),tile=t.closest('.grid-tile'),id=tile?.dataset.gridId;
 if(act){const a=act.dataset.gridAct;
  // 全部启动 / 全部停止复用实例管理的批量确认弹窗（依次执行）。
  if(a==='start-all'||a==='stop-all'){const ids=state.instances.filter(i=>a==='start-all'?i.status==='stopped'||i.status==='error':i.status==='running'||i.status==='starting').map(i=>i.id);if(!ids.length)return;const keep=[...selected];selected.clear();ids.forEach(i=>selected.add(i));openModal(a==='start-all'?'batch-start':'batch-stop');selected.clear();keep.forEach(i=>selected.add(i));return;}
  if(!id)return;
  if(a==='start'||a==='stop'){act.disabled=true;if(a==='start')gridFocus=gridFocus||id;await call(a,{id});}
  else if(a==='reload')await call('reload',{id});
  else if(a==='open')await route('browser',id);
  return;}
 if(id&&gridPrefs.mode==='saver'&&t.closest('.grid-body')&&state.instances.find(i=>i.id===id)?.status==='running')gridSetFocus(id);
});
document.addEventListener('change',e=>{if(e.target?.id!=='gridCols'||view!=='grid')return;gridPrefs.cols=e.target.value==='auto'?'auto':Number(e.target.value);gridSave();render(true);});
