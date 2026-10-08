'use strict';
const api=globalThis.browser||chrome,$=id=>document.getElementById(id);
let tabId,detected=null,enabled=true,translated=false,busy=false,features,prefs={},poll;
const keys=['facetTranslationEnabled','facetAlwaysLanguages','facetSimpleTarget','facetSimpleSource'];
const names=new Intl.DisplayNames(['zh-CN'],{type:'language'});
function name(code){if(code==='zh')return '中文（简体）';if(code==='zh-TW')return '中文（繁体）';try{return names.of(code)||code;}catch{return code;}}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function render(){
  $('enabled').checked=enabled;$('enabled-label').textContent=enabled?'启用翻译':'已关闭';
  $('enabled').disabled=busy;$('from').disabled=$('to').disabled=busy||!enabled||!features;
  $('translate').disabled=busy||!enabled||!tabId||!features;
  $('translate').textContent=translated?'恢复原文':'翻译此页';
  $('always').disabled=busy||!enabled||!detected||!features?.supportedLanguages.includes(detected);
  $('always-label').textContent=detected?'始终翻译'+name(detected):'始终翻译此语言';
  $('always').checked=(prefs.facetAlwaysLanguages||[]).includes(detected);
  $('advanced').disabled=$('original').disabled=!enabled||busy;
}
const page=(action,data)=>api.tabs.sendMessage(tabId,{action,...(data?{data}:{})});
async function ready(fn){const end=Date.now()+10000;let last;while(Date.now()<end){try{return await fn();}catch(e){last=e;await new Promise(r=>setTimeout(r,150));}}throw last||Error('翻译引擎尚未就绪，请稍后重试');}
async function refresh(){
  if(!enabled)return;
  const state=await page('getPageTranslateState');translated=state.isTranslated;render();
  const c=state.counters;
  if(c.pending)status('正在翻译…');
  else if(c.rejected)status('部分内容翻译失败，可恢复后重试',true);
  else status(translated?'已翻译 · '+c.resolved+' 处内容':detected?'检测到'+name(detected):'请选择原文语言');
}
async function connect(){
  const end=Date.now()+8000;
  while(Date.now()<end){try{detected=await page('getPageLanguage');await refresh();return;}catch{await new Promise(r=>setTimeout(r,150));}}
  throw Error('无法连接此页面，请刷新网页后重试');
}
async function action(fn){busy=true;render();try{await fn();}catch(e){status(e.message||'操作失败，请重试',true);}finally{busy=false;render();}}
async function init(){
  prefs=await api.storage.local.get(keys);enabled=prefs.facetTranslationEnabled!==false;
  const tabs=await api.tabs.query({active:true,currentWindow:true});tabId=tabs[0]?.id;
  const config=await ready(()=>api.runtime.sendMessage({action:'getConfig'}));
  features=await ready(()=>api.runtime.sendMessage({action:'getTranslatorFeatures'}));
  for(const id of ['from','to']){
    const values=features.supportedLanguages.filter(x=>x!=='auto').sort((a,b)=>name(a).localeCompare(name(b),'zh-CN'));
    $(id).replaceChildren();if(id==='from'&&features.isSupportAutodetect)$(id).add(new Option('自动检测','auto'));
    for(const code of values)$(id).add(new Option(name(code),code));
  }
  $('to').value=features.supportedLanguages.includes(prefs.facetSimpleTarget)?prefs.facetSimpleTarget:config.language;
  if(!$('to').value)$('to').selectedIndex=0;
  if(enabled&&tabId){await connect();$('from').value=prefs.facetSimpleSource||'auto';if(!$('from').value)$('from').value=detected||features.supportedLanguages[0];}
  else status(enabled?'此页面无法翻译':'已暂停页面及划词翻译');
  render();poll=setInterval(()=>{if(!busy&&enabled)refresh().catch(()=>{});},750);
}
$('enabled').addEventListener('change',()=>{const next=$('enabled').checked;return action(async()=>{
  if(!next&&tabId){try{await page('disableTranslatePage');}catch{}}
  await api.storage.local.set({facetTranslationEnabled:next});enabled=next;translated=false;
  if(next){status('正在连接页面…');await connect();}else status('已暂停页面及划词翻译');
});});
$('translate').addEventListener('click',()=>action(async()=>{
  if(translated)await page('disableTranslatePage');
  else {await api.storage.local.set({facetSimpleTarget:$('to').value,facetSimpleSource:$('from').value});await page('enableTranslatePage',{from:$('from').value,to:$('to').value});}
  await refresh();
}));
for(const id of ['from','to'])$(id).addEventListener('change',()=>action(()=>api.storage.local.set({[id==='to'?'facetSimpleTarget':'facetSimpleSource']:$(id).value})));
$('always').addEventListener('change',()=>{const checked=$('always').checked;return action(async()=>{
  const current=await api.storage.local.get('facetAlwaysLanguages'),set=new Set(current.facetAlwaysLanguages||[]);
  checked?set.add(detected):set.delete(detected);
  prefs.facetAlwaysLanguages=[...set];await api.storage.local.set({facetAlwaysLanguages:[...set],facetSimpleTarget:$('to').value});
});});
$('more').addEventListener('click',()=>{$('menu').hidden=!$('menu').hidden;$('more').setAttribute('aria-expanded',String(!$('menu').hidden));});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('menu').hidden=true;$('more').setAttribute('aria-expanded','false');}});
document.addEventListener('click',e=>{if(!e.target.closest('nav')&&e.target!==$('more')){$('menu').hidden=true;$('more').setAttribute('aria-expanded','false');}});
$('advanced').addEventListener('click',()=>{
  // Electron's extension API does not implement openOptionsPage. The original
  // settings can still load in this extension window and keep its instance binding.
  if(typeof api.windows?.create!=='function')location.href=api.runtime.getURL('pages/options/options.html');
  else api.runtime.openOptionsPage().catch(e=>status(e.message,true));
});
$('original').addEventListener('click',()=>{location.href='original.html';});
window.addEventListener('pagehide',()=>clearInterval(poll));
init().catch(e=>{status(e.message||'无法加载翻译设置',true);render();});
