"use strict";
// 退出前确认：有实例运行（或正在启动）时提示一次，可勾选「不再提示」。偏好保存在 app-settings.json。
const fs = require("node:fs"),
  path = require("node:path");
function settingsFile(dir) {
  return path.join(dir, "app-settings.json");
}
function readSettings(dir) {
  try {
    const v = JSON.parse(fs.readFileSync(settingsFile(dir), "utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function writeSettings(dir, patch) {
  const next = { ...readSettings(dir), ...patch };
  require("./store.cjs").atomic(settingsFile(dir), next);
  return next;
}
function busyInstances(controller) {
  return controller.store
    .list()
    .filter((x) => ["running", "starting"].includes(controller.runtimes.get(x.id)?.status))
    .map((x) => x.name);
}
// 返回 true 表示继续退出。
async function confirmExit(controller, window, dialog, dir) {
  const names = busyInstances(controller);
  if (!names.length || readSettings(dir).confirmExit === false) return true;
  const shown = names.slice(0, 6).join("、") + (names.length > 6 ? ` 等 ${names.length} 个` : "");
  const answer = await dialog.showMessageBox(window, {
    type: "question",
    title: "退出千面 Facet",
    message: `有 ${names.length} 个实例正在运行，退出会全部停止`,
    detail: `${shown}\n登录资料和配置都会保留，下次可手动启动。`,
    buttons: ["取消", "退出"],
    defaultId: 1,
    cancelId: 0,
    noLink: true,
    checkboxLabel: "不再提示",
    checkboxChecked: false,
  });
  if (answer.response !== 1) return false;
  if (answer.checkboxChecked)
    try {
      writeSettings(dir, { confirmExit: false });
    } catch {}
  return true;
}
module.exports = { readSettings, writeSettings, busyInstances, confirmExit };
