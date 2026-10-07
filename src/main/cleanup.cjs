"use strict";
// 已删除实例的残留：Partitions/arena-core-<id>、core-runtime/<id>、proxy-sources/<id>.json，以及上次退出遗留的检测临时目录。
// 只处理名称完全符合实例 ID 格式、且不在当前实例列表中的项目；控制界面的 arena-core-controls 永远不碰。
const fs = require("node:fs"),
  path = require("node:path");
const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
function entries(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
function removeOne(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 2 });
    return !fs.existsSync(target);
  } catch {
    return false;
  }
}
function orphans(dir, ids) {
  const keep = new Set(ids),
    out = [];
  const partition = new RegExp("^arena-core-(" + ID + ")$"),
    folder = new RegExp("^(" + ID + ")$"),
    file = new RegExp("^(" + ID + ")\\.json(?:\\.bak)?(?:\\." + ID + "\\.tmp)?$");
  for (const e of entries(path.join(dir, "Partitions"))) {
    const m = e.isDirectory() && e.name.toLowerCase() === e.name && e.name.match(partition);
    if (m && !keep.has(m[1])) out.push(path.join(dir, "Partitions", e.name));
  }
  for (const e of entries(path.join(dir, "core-runtime"))) {
    const m = e.isDirectory() && e.name.match(folder);
    if (m && !keep.has(m[1])) out.push(path.join(dir, "core-runtime", e.name));
  }
  for (const e of entries(path.join(dir, "proxy-sources"))) {
    const m = e.isFile() && e.name.match(file);
    if (m && !keep.has(m[1])) out.push(path.join(dir, "proxy-sources", e.name));
  }
  for (const e of entries(path.join(dir, "diagnostic-runtime")))
    if (e.isDirectory() && new RegExp("^" + ID + "$").test(e.name))
      out.push(path.join(dir, "diagnostic-runtime", e.name));
  for (const e of entries(path.join(dir, 'instance-import-cookies'))) {
    const m = e.isFile() && e.name.match(new RegExp('^(' + ID + ')\\.bin$'));
    if (m && !keep.has(m[1])) out.push(path.join(dir, 'instance-import-cookies', e.name));
  }
  return out;
}
// 启动时调用（此时还没有打开任何实例会话）。返回 { removed, failed }。
function cleanOrphans(dir, ids) {
  let removed = 0,
    failed = 0;
  for (const target of orphans(dir, ids)) removeOne(target) ? removed++ : failed++;
  return { removed, failed };
}
// 删除实例后立即清理内核运行目录。浏览器数据目录（Partitions）在本次运行中仍被会话占用，
// 强行删除会阻塞或失败，因此留给下次启动时的 cleanOrphans 统一删除。
function cleanInstance(dir, id) {
  if (!dir || !new RegExp("^" + ID + "$").test(String(id))) return false;
  return removeOne(path.join(dir, "core-runtime", id));
}
// A deletion journal is only finalized when every path belonging to the
// removed instance is gone. If the instance still exists in metadata, the
// operation never reached the destructive phase and the journal is discarded.
function nodeSourceFiles(dir,id){
 if(!new RegExp('^'+ID+'$').test(String(id)))throw Error('实例 ID 无效');
 const folder=path.join(dir,'proxy-sources');
 const pattern=new RegExp('^'+id+'\\.json(?:\\.bak)?(?:\\.'+ID+'\\.tmp)?$');
 const names=new Set([id+'.json',id+'.json.bak']);
 let sourceEntries;
 try{sourceEntries=fs.readdirSync(folder,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')sourceEntries=[];else throw new Error('节点源目录无法读取，尚未确认清理完成',{cause:error});}
 for(const entry of sourceEntries)if((entry.isFile()||entry.isSymbolicLink())&&pattern.test(entry.name))names.add(entry.name);
 return [...names].map(name=>path.join(folder,name));
}
function cleanNodeSource(dir,id){
 const results=nodeSourceFiles(dir,id).map(removeOne);
 return results.every(Boolean);
}
function journalResiduals(dir,id){
 const sources=nodeSourceFiles(dir,id);
 const targets=[path.join(dir,'Partitions','arena-core-'+id),path.join(dir,'core-runtime',id),path.join(dir,'instance-import-cookies',id+'.bin'),...sources];
 return targets.filter(target=>fs.existsSync(target));
}
module.exports = { orphans, cleanOrphans, cleanInstance, cleanNodeSource, nodeSourceFiles, journalResiduals };
