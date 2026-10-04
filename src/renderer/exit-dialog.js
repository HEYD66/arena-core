'use strict';
(()=>{
 const q=new URLSearchParams(location.search),root=document.documentElement;
 root.dataset.theme=q.get('theme')==='dark'?'dark':'light';
 for(const key of ['lightPalette','darkPalette']){const value=q.get(key)||'indigo';root.dataset[key]=/^[a-z-]{1,30}$/.test(value)?value:'indigo';}
 document.getElementById('exit-message').textContent=q.get('message')||'退出将停止正在运行的实例';
 document.getElementById('exit-names').textContent=q.get('names')||'运行中的实例';
 let sent=false;
 const answer=response=>{if(sent)return;sent=true;window.facetExit.answer(response,response===1&&document.getElementById('remember').checked);};
 document.getElementById('dismiss').addEventListener('click',()=>answer(0));
 document.getElementById('cancel').addEventListener('click',()=>answer(0));
 document.getElementById('confirm').addEventListener('click',()=>answer(1));
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();answer(0);}
  if(event.key==='Tab'){
   const items=[...document.querySelectorAll('button,input')],first=items[0],last=items.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
 });
 document.getElementById('cancel').focus();
})();
