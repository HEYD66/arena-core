'use strict';
// 实例网页的音量（在隔离环境里运行，网页自己的脚本看不到，也不改动任何网页对象）。
// 按实例音量缩放网页里 <video>/<audio> 的音量：网页自己调音量时，以网页设定的值为基准再乘以实例音量。
// 用 WebAudio 播放的声音和不在页面里的 new Audio() 调不到——这些只能用静音（静音由主进程 setAudioMuted 负责，覆盖一切声音）。
const {ipcRenderer}=require('electron');
let factor=1;
// 异步取当前音量：取不到也不会卡住网页（按 100% 处理），取到后再调一遍已有的元素。
ipcRenderer.invoke('facet:volume-get').then(v=>{if(typeof v==='number'&&v>=0&&v<=1&&v!==factor){factor=v;sweep();}}).catch(()=>{});
const base=new WeakMap(),ours=new WeakMap(),known=new Set(),EPS=0.0005;
const clamp=v=>Math.min(1,Math.max(0,Number(v)||0));
function remember(el){if(!base.has(el)){base.set(el,el.volume);known.add(new WeakRef(el));}}
function apply(el){if(!(el instanceof HTMLMediaElement))return;remember(el);const want=clamp(base.get(el)*factor);if(Math.abs(el.volume-want)>EPS){ours.set(el,want);try{el.volume=want;}catch{}}}
// 网页自己改了音量：记下新的基准值。我们自己设的值会触发同样的事件，按记录的值认出来跳过。
function changed(e){const el=e.target;if(!(el instanceof HTMLMediaElement))return;const mine=ours.get(el);if(mine!==undefined&&Math.abs(el.volume-mine)<=EPS)return;ours.delete(el);if(!base.has(el))known.add(new WeakRef(el));base.set(el,el.volume);apply(el);}
function sweep(){for(const ref of known){const el=ref.deref();if(el)apply(el);else known.delete(ref);}try{for(const el of document.querySelectorAll('video,audio'))apply(el);}catch{}}
window.addEventListener('volumechange',changed,true);
for(const type of ['loadedmetadata','play','playing'])window.addEventListener(type,e=>apply(e.target),true);
document.addEventListener('DOMContentLoaded',sweep);
ipcRenderer.on('facet:volume',(_event,value)=>{factor=clamp(value);sweep();});
