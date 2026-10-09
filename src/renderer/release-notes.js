'use strict';
// GitHub's public feed returns HTML; keep text only, never attach its DOM.
function releaseNotesText(value){
 const raw=String(value||'').slice(0,12000);
 if(!/<\/?[a-z][a-z0-9:-]*[\s>]/i.test(raw))return raw.trim();
 const doc=new DOMParser().parseFromString(raw,'text/html');
 doc.querySelectorAll('script,style,iframe,object,embed,svg,template').forEach(x=>x.remove());
 const blocks=new Set(['P','DIV','SECTION','ARTICLE','H1','H2','H3','H4','UL','OL','PRE','BLOCKQUOTE','TABLE','TR']);
 const read=node=>{
  if(node.nodeType===3)return node.textContent;
  if(node.nodeType!==1)return '';
  if(node.tagName==='BR')return '\n';
  const text=[...node.childNodes].map(read).join('');
  if(node.tagName==='LI')return '\n• '+text.trim()+'\n';
  return blocks.has(node.tagName)?'\n'+text+'\n':text;
 };
 return [...doc.body.childNodes].map(read).join('').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
