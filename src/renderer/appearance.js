'use strict';
// Control-window preferences only: never touch instance sessions, nativeTheme or fingerprint overrides.
(()=>{
 const root=document.documentElement;
 const read=(k,fallback)=>{try{return localStorage.getItem(k)||fallback;}catch{return fallback;}};
 const save=(k,v)=>{try{localStorage.setItem(k,v);}catch{/* Preferences are optional if storage is unavailable. */}};
 root.dataset.theme=read('arena.ui.theme','light')==='dark'?'dark':'light';
 root.dataset.sidebar=read('arena.ui.sidebar','expanded')==='collapsed'?'collapsed':'expanded';
 // Palettes: one for day, one for night; the titlebar toggle switches between the two.
 const PALETTES={light:[{"id": "indigo", "name": "靛青石板", "desc": "冷调石板灰 · 靛蓝", "c": ["#f4f5f8", "#ffffff", "#4a51c7", "#171a21", "#e3e6ec"]}, {"id": "mono", "name": "墨石单色", "desc": "黑白灰 · 克制", "c": ["#f5f5f4", "#ffffff", "#1c1c1f", "#18181b", "#e4e4e1"]}, {"id": "copper", "name": "暖岩铜棕", "desc": "暖米灰 · 铜棕", "c": ["#f5f3ef", "#fffefb", "#9c4a26", "#211d19", "#e6e1d9"]}, {"id": "moss", "name": "苔绿精修", "desc": "灰绿 · 沉稳", "c": ["#f3f4f2", "#ffffff", "#2b644b", "#191e1b", "#e1e5df"]}],dark:[{"id": "indigo", "name": "靛青石板", "desc": "深蓝黑 · 靛蓝", "c": ["#0f1115", "#16181e", "#555cd3", "#e7e9ee", "#282c35"]}, {"id": "gold", "name": "黑金", "desc": "暖炭黑 · 金色", "c": ["#181715", "#211f1d", "#d6a462", "#eee9e0", "#383531"]}, {"id": "mono", "name": "墨石单色", "desc": "纯黑 · 白色强调", "c": ["#0b0b0c", "#141416", "#e8e8ea", "#ededef", "#27272b"]}, {"id": "moss", "name": "苔绿精修", "desc": "墨绿黑 · 苔绿", "c": ["#0f1211", "#161a18", "#37775b", "#e3e9e5", "#29302b"]}]};
 const pick=(mode,id)=>PALETTES[mode].some(p=>p.id===id)?id:'indigo';
 root.dataset.lightPalette=pick('light',read('arena.ui.palette.light','indigo'));
 root.dataset.darkPalette=pick('dark',read('arena.ui.palette.dark','indigo'));
 const CHECK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';
 const option=(mode,p)=>{const [bg,panel,accent,text,line]=p.c,on=root.dataset[mode+'Palette']===p.id;return `<button type="button" class="theme-option" role="radio" aria-checked="${on}" data-palette-mode="${mode}" data-palette="${p.id}" title="${p.name}"><span class="theme-swatch" aria-hidden="true" style="background:${bg}"><i></i><span class="sw-main" style="background:${panel};border-left:1px solid ${line}"><i class="sw-line" style="width:70%;background:${text}"></i><i class="sw-line" style="width:48%;background:${text};opacity:.45"></i><i class="sw-btn" style="background:${accent}"></i></span></span><span class="theme-name">${p.name}${CHECK}</span><small>${p.desc}</small></button>`;};
 const row=(mode,label)=>`<div class="theme-row${root.dataset.theme===mode?' is-live':''}" data-theme-row="${mode}"><div class="theme-row-head"><b>${label}</b><span class="theme-live">正在使用</span></div><div class="theme-options" role="radiogroup" aria-label="${label}">${PALETTES[mode].map(p=>option(mode,p)).join('')}</div></div>`;
 window.arenaAppearance={palettes:PALETTES,cardHTML:()=>`<section class="settings-card full theme-card"><h3>外观主题</h3><div class="inner"><p class="theme-note">日间和夜间各选一套配色，标题栏的日间 / 夜间按钮在两者之间切换；点选后立即切换到该模式预览。只影响软件界面，不影响网页内容、实例会话或指纹。</p>${row('light','日间主题')}${row('dark','夜间主题')}</div></section>`};
 const svg=d=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"></path></svg>`;
 const MOON=svg('M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'),SUN=svg('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2.5v2 M12 19.5v2 M4.6 4.6l1.4 1.4 M18 18l1.4 1.4 M2.5 12h2 M19.5 12h2 M4.6 19.4L6 18 M18 6l1.4-1.4'),SIDE=svg('M3.5 4.5h17v15h-17z M9 4.5v15');
 const update=()=>{
  const dark=root.dataset.theme==='dark',collapsed=root.dataset.sidebar==='collapsed';
  const theme=document.getElementById('themeToggle'),side=document.getElementById('sidebarToggle');
  if(theme){theme.innerHTML=dark?SUN:MOON;theme.title=dark?'切换到日间模式（仅软件界面）':'切换到夜间模式（仅软件界面）';theme.setAttribute('aria-pressed',String(dark));theme.setAttribute('aria-label',dark?'切换到日间模式':'切换到夜间模式');}
  document.querySelectorAll('[data-theme-row]').forEach(r=>r.classList.toggle('is-live',r.dataset.themeRow===root.dataset.theme));
  if(side){if(!side.firstElementChild)side.innerHTML=SIDE;side.setAttribute('aria-expanded',String(!collapsed));side.title=collapsed?'展开侧栏':'折叠侧栏';side.setAttribute('aria-label',side.title);}
 };
 document.addEventListener('DOMContentLoaded',()=>{
  update();
  document.getElementById('themeToggle').addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';save('arena.ui.theme',root.dataset.theme);update();});
  document.addEventListener('click',event=>{const b=event.target.closest('[data-palette]');if(!b)return;const mode=b.dataset.paletteMode==='dark'?'dark':'light',id=pick(mode,b.dataset.palette);root.dataset[mode+'Palette']=id;save('arena.ui.palette.'+mode,id);root.dataset.theme=mode;save('arena.ui.theme',mode);document.querySelectorAll(`[data-palette-mode="${mode}"]`).forEach(x=>x.setAttribute('aria-checked',String(x.dataset.palette===id)));update();});
  document.getElementById('sidebarToggle').addEventListener('click',()=>{root.dataset.sidebar=root.dataset.sidebar==='collapsed'?'expanded':'collapsed';save('arena.ui.sidebar',root.dataset.sidebar);update();window.dispatchEvent(new Event('resize'));});
  // Native surface bounds must follow shell resizing, without animating across an active WebContentsView.
  new ResizeObserver(()=>window.dispatchEvent(new Event('resize'))).observe(document.querySelector('.workspace'));
 });
})();
