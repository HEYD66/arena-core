'use strict';
// 实例音量：标签、宫格格子、放大框上的喇叭左键静音，右键打开音量条。音量按实例记住（重启后保持）。
// 与静音联动：拖到 0 等于静音；实例静音时拖动音量会取消静音；顶部“全部静音”另算。
// 注意：本文件在 app.js 之前加载，只能在函数内部引用 app.js 的全局变量（state、bridge、call、layout 等）。
function speakerIcon(muted,low){return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z ${muted?'M16 9.5l5 5 M21 9.5l-5 5':low?'M15.5 9.5a3.5 3.5 0 0 1 0 5':'M15.5 9.5a3.5 3.5 0 0 1 0 5 M18 7a7 7 0 0 1 0 10'}"></path></svg>`;}
function volOf(x){return Number.isInteger(x?.volume)?x.volume:100;}
function volSilent(x){return x?.muted===true||volOf(x)===0;}
function volButton(x,cls){const all=!!state.audioMuted,silent=volSilent(x),v=volOf(x);const tip=`音量 ${silent?'已静音':v+'%'} · 左键${silent?'取消静音':'静音'} · 右键调节音量${all?'\n顶部已开启“全部静音”，所有实例当前都不出声':''}`;
 return `<button class="icon-btn vol-btn ${cls}${silent?' on':''}${all&&!silent?' all':''}" type="button" data-vol="${esc(x.id)}" aria-haspopup="dialog" aria-pressed="${silent}" title="${esc(tip)}" aria-label="${esc(x.name)} ${silent?'取消静音':'静音'}，右键调节音量">${speakerIcon(silent||all,v<50)}</button>`;}
let volId=null,volTimer=0,volQueued=null,volDragging=false;
function volDialog(){let d=document.getElementById('volumePop');if(d)return d;
 document.body.insertAdjacentHTML('beforeend',`<dialog id="volumePop" class="vol-pop" data-browser-overlay aria-labelledby="volName"><div class="vol-head"><b id="volName"></b><span id="volPct"></span></div><div class="vol-row"><button class="icon-btn" id="volMute" type="button"></button><input id="volRange" type="range" min="0" max="100" step="1" aria-label="音量"></div><p class="vol-note" id="volNote"></p></dialog>`);
 d=document.getElementById('volumePop');const range=d.querySelector('#volRange');
 // 点弹层外面（背景）关闭；Esc 由 dialog 自带。
 d.addEventListener('click',e=>{if(e.target===d)d.close();});
 d.addEventListener('close',()=>{volFlush();volId=null;volDragging=false;layout();});
 range.addEventListener('input',()=>{volDragging=true;const v=Number(range.value);volPaint(v);volQueued=v;if(!volTimer)volTimer=setTimeout(volFlush,90);});
 range.addEventListener('change',()=>{volDragging=false;volFlush();});
 d.querySelector('#volMute').addEventListener('click',()=>toggleVolumeMute(volId));
 return d;}
function volFlush(){clearTimeout(volTimer);volTimer=0;if(volQueued==null||!volId)return;const v=volQueued;volQueued=null;Promise.resolve(call('audio-volume',{id:volId,volume:v})).catch(()=>{});}
function volPaint(v){const d=document.getElementById('volumePop');if(!d)return;const x=state.instances.find(i=>i.id===volId);if(!x)return;const silent=x.muted===true||v===0;
 d.querySelector('#volName').textContent=x.name;d.querySelector('#volPct').textContent=silent?'已静音':`${v}%`;d.querySelector('#volRange').style.setProperty('--vol',`${v}%`);
 const mute=d.querySelector('#volMute');mute.innerHTML=speakerIcon(silent,v<50);mute.classList.toggle('on',silent);mute.setAttribute('aria-pressed',String(silent));mute.title=silent?'取消静音':'静音';mute.setAttribute('aria-label',silent?'取消静音':'静音');
 d.querySelector('#volNote').textContent=state.audioMuted?'顶部已开启“全部静音”，关掉后才会出声。':'只调网页里的视频和音频；网页游戏等用 WebAudio 的声音请用静音。';}
function volRefresh(){if(!volId)return;const d=document.getElementById('volumePop');const x=state.instances.find(i=>i.id===volId);if(!d?.open||!x){d?.open&&d.close();return;}if(volDragging)return;const range=d.querySelector('#volRange');range.value=String(volOf(x));volPaint(volOf(x));}
function openVolume(anchor,id){const x=state.instances.find(i=>i.id===id);if(!x)return;const d=volDialog();if(d.open)d.close();volId=id;const range=d.querySelector('#volRange');range.value=String(volOf(x));volPaint(volOf(x));d.showModal();
 const r=anchor.getBoundingClientRect(),w=d.offsetWidth,h=d.offsetHeight;let left=Math.round(r.left+r.width/2-w/2),top=Math.round(r.bottom+6);left=Math.max(8,Math.min(innerWidth-w-8,left));if(top+h>innerHeight-8)top=Math.max(8,Math.round(r.top-h-6));d.style.left=left+'px';d.style.top=top+'px';
 range.focus();layout();}
// 喇叭按钮在标签、格子里，先于这些区域自己的点击处理（捕获阶段），避免切换标签或触发格子操作。
async function toggleVolumeMute(id){const x=state.instances.find(i=>i.id===id);if(!x)return;
 // 音量为 0 时取消静音需要恢复音量，否则仍然没有声音。
 if(volOf(x)===0)await call('audio-volume',{id:x.id,volume:50});else await call('audio-mute',{id:x.id,muted:!x.muted});}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-vol]');if(!b||b.disabled)return;e.preventDefault();e.stopPropagation();toggleVolumeMute(b.dataset.vol);},true);
document.addEventListener('contextmenu',e=>{const b=e.target.closest?.('[data-vol]');if(!b||b.disabled)return;e.preventDefault();e.stopPropagation();openVolume(b,b.dataset.vol);},true);
document.addEventListener('keydown',e=>{const b=e.target.closest?.('[data-vol]');if(!b||b.disabled||!(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'))return;e.preventDefault();e.stopPropagation();openVolume(b,b.dataset.vol);},true);
window.facet?.onState(()=>setTimeout(volRefresh,0));
