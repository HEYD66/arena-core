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
    file = new RegExp("^(" + ID + ")\\.json$");
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
module.exports = { orphans, cleanOrphans, cleanInstance };
