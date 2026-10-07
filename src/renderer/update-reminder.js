'use strict';
const parameters=new URLSearchParams(location.search);
for(const key of ['theme','lightPalette','darkPalette'])document.documentElement.dataset[key]=parameters.get(key)||'';
document.getElementById('reminderTitle').textContent='发现新版本 v'+(parameters.get('version')||'');
document.getElementById('reminderVersions').textContent='当前版本 v'+(parameters.get('currentVersion')||'');
document.addEventListener('click',event=>{const b=event.target.closest('[data-update-reminder]');if(b)window.facetUpdateReminder.answer(b.dataset.updateReminder==='view'?0:1);});
document.addEventListener('keydown',event=>{if(event.key==='Escape')window.facetUpdateReminder.answer(1);if(event.key==='Tab'){const buttons=[...document.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
document.querySelector('[data-update-reminder="view"]').focus();
