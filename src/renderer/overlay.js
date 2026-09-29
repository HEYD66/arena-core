"use strict";
// 扩展菜单浮层：显示控制界面生成的菜单，并把按钮点击回传给控制界面处理。
const menu = document.getElementById("menu");
const KEYS = ["extension", "extensionId", "instanceId", "kind", "view"];
function report() {
  facetOverlay.send({ type: "size", height: Math.ceil(menu.getBoundingClientRect().height) });
}
facetOverlay.onRender(({ html, attrs, label }) => {
  const root = document.documentElement;
  for (const a of [...root.attributes]) if (a.name !== "lang") root.removeAttribute(a.name);
  for (const [k, v] of Object.entries(attrs || {})) root.setAttribute(k, v);
  menu.innerHTML = html;
  menu.setAttribute("aria-label", label || "扩展");
  requestAnimationFrame(report);
  if (!menu.contains(document.activeElement)) menu.querySelector("button:not([disabled])")?.focus();
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  const data = {};
  for (const k of KEYS) if (b.dataset[k] !== undefined) data[k] = String(b.dataset[k]);
  if (data.extension || data.view) facetOverlay.send({ type: "action", data });
});
new ResizeObserver(report).observe(menu);
