'use strict';
// Control-window preferences only: never touch instance sessions, nativeTheme or fingerprint overrides.
(()=>{
 const root=document.documentElement;
 const read=(k,fallback)=>{try{return localStorage.getItem(k)||fallback;}catch{return fallback;}};
 const save=(k,v)=>{try{localStorage.setItem(k,v);}catch{/* Preferences are optional if storage is unavailable. */}};
 root.dataset.theme=read('arena.ui.theme','light')==='dark'?'dark':'light';
 root.dataset.sidebar=read('arena.ui.sidebar','expanded')==='collapsed'?'collapsed':'expanded';
 const update=()=>{
  const dark=root.dataset.theme==='dark',collapsed=root.dataset.sidebar==='collapsed';
  const theme=document.getElementById('themeToggle'),side=document.getElementById('sidebarToggle');
  if(theme){theme.textContent=dark?'☀ 日间':'☾ 夜间';theme.setAttribute('aria-pressed',String(dark));theme.setAttribute('aria-label',dark?'切换到日间模式':'切换到夜间模式');}
  if(side){side.setAttribute('aria-expanded',String(!collapsed));side.title=collapsed?'展开侧栏':'折叠侧栏';side.setAttribute('aria-label',side.title);}
 };
 document.addEventListener('DOMContentLoaded',()=>{
  update();
  document.getElementById('themeToggle').addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';save('arena.ui.theme',root.dataset.theme);update();});
  document.getElementById('sidebarToggle').addEventListener('click',()=>{root.dataset.sidebar=root.dataset.sidebar==='collapsed'?'expanded':'collapsed';save('arena.ui.sidebar',root.dataset.sidebar);update();window.dispatchEvent(new Event('resize'));});
  // Native surface bounds must follow shell resizing, without animating across an active WebContentsView.
  new ResizeObserver(()=>window.dispatchEvent(new Event('resize'))).observe(document.querySelector('.workspace'));
 });
})();
