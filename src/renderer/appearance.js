'use strict';
// Control-window preferences only: never touch instance sessions, nativeTheme or fingerprint overrides.
(()=>{
 const root=document.documentElement;
 const read=(k,fallback)=>{try{return localStorage.getItem(k)||fallback;}catch{return fallback;}};
 const save=(k,v)=>{try{localStorage.setItem(k,v);}catch{/* Preferences are optional if storage is unavailable. */}};
 root.dataset.theme=read('arena.ui.theme','light')==='dark'?'dark':'light';
 root.dataset.sidebar=read('arena.ui.sidebar','expanded')==='collapsed'?'collapsed':'expanded';
 const svg=d=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"></path></svg>`;
 const MOON=svg('M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'),SUN=svg('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2.5v2 M12 19.5v2 M4.6 4.6l1.4 1.4 M18 18l1.4 1.4 M2.5 12h2 M19.5 12h2 M4.6 19.4L6 18 M18 6l1.4-1.4'),SIDE=svg('M3.5 4.5h17v15h-17z M9 4.5v15');
 const update=()=>{
  const dark=root.dataset.theme==='dark',collapsed=root.dataset.sidebar==='collapsed';
  const theme=document.getElementById('themeToggle'),side=document.getElementById('sidebarToggle');
  if(theme){theme.innerHTML=dark?SUN:MOON;theme.title=dark?'切换到日间模式（仅软件界面）':'切换到夜间模式（仅软件界面）';theme.setAttribute('aria-pressed',String(dark));theme.setAttribute('aria-label',dark?'切换到日间模式':'切换到夜间模式');}
  if(side){if(!side.firstElementChild)side.innerHTML=SIDE;side.setAttribute('aria-expanded',String(!collapsed));side.title=collapsed?'展开侧栏':'折叠侧栏';side.setAttribute('aria-label',side.title);}
 };
 document.addEventListener('DOMContentLoaded',()=>{
  update();
  document.getElementById('themeToggle').addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';save('arena.ui.theme',root.dataset.theme);update();});
  document.getElementById('sidebarToggle').addEventListener('click',()=>{root.dataset.sidebar=root.dataset.sidebar==='collapsed'?'expanded':'collapsed';save('arena.ui.sidebar',root.dataset.sidebar);update();window.dispatchEvent(new Event('resize'));});
  // Native surface bounds must follow shell resizing, without animating across an active WebContentsView.
  new ResizeObserver(()=>window.dispatchEvent(new Event('resize'))).observe(document.querySelector('.workspace'));
 });
})();
