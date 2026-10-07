'use strict';
const path=require('node:path'),crypto=require('node:crypto');
function timestamp(date=new Date()){
 const pad=(n,width=2)=>String(n).padStart(width,'0');
 return date.getFullYear()+pad(date.getMonth()+1)+pad(date.getDate())+'-'+pad(date.getHours())+pad(date.getMinutes())+pad(date.getSeconds())+'-'+pad(date.getMilliseconds(),3);
}
function backupName(name,date=new Date()){
 let base=String(name||'实例').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,40).trim()||'实例';
 if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base))base='实例_'+base;
 return base+'_'+timestamp(date)+'_'+crypto.randomBytes(6).toString('hex')+'.facetbackup';
}
function separateDestinations(directory,rows){const date=new Date();return rows.map(row=>path.join(directory,backupName(row.name,date)));}
module.exports={timestamp,backupName,separateDestinations};
