'use strict';

const { app, BrowserWindow, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-proxy-entry-electron-'));
app.setPath('userData', root);
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const { Controller } = require('../src/main/controller.cjs');
const { installIPC } = require('../src/main/ipc.cjs');

const wait = async (predicate, label, limit = 160) => {
  for (let i = 0; i < limit; i++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error(`Timeout: ${label}`);
};

let window;
let controller;
app.whenReady().then(async () => {
  try {
    window = new BrowserWindow({
      show: false,
      width: 1200,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, '../src/main/preload.cjs'),
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    });
    controller = new Controller(window, root, path.join(root, 'mihomo-not-required'));
    installIPC(window, controller);
    await window.loadFile(path.join(__dirname, '../src/renderer/index.html'));
    const ui = (code) => window.webContents.executeJavaScript(code);
    await wait(() => ui('typeof route === "function" && typeof openProxyEntry === "function"'), 'renderer helpers');
    await ui("route('proxies')");
    await wait(() => ui('!!document.querySelector(\'[data-lib="add-source"]\')'), 'proxy management');
    await ui("document.querySelector('.source-add .inline-help>summary').click()");
    const helpLayout = await ui("(() => { const p = document.querySelector('.source-add .inline-help>p').getBoundingClientRect(); return { popupTop: p.top, popupBottom: p.bottom, popupHeight: p.height, text: document.querySelector('.source-add .inline-help>p').textContent }; })()");
    assert(helpLayout.popupHeight > 0 && helpLayout.popupTop >= 0 && helpLayout.popupBottom <= 800, 'source help remains visible above the node-source card');
    assert.match(helpLayout.text, /用户名:密码@主机:端口/);
    await ui("document.querySelector('.source-add .inline-help>summary').click()");
    await ui("document.querySelector('[data-lib=add-source]').click()");
    await wait(() => ui('!!document.querySelector("#proxyEntryForm")'), 'add proxy dialog');
    clipboard.writeText('fixture.example:2000:fixture-user:fixture-pass');
    await ui("document.querySelector('[data-proxy-entry=clipboard]').click()");
    await wait(() => ui("document.querySelector('#proxyEntryHost')?.value === 'fixture.example' && document.querySelector('#proxyEntryPort')?.value === '2000'"), 'legacy clipboard fields');
    await ui("document.querySelector('#proxyEntryName').value='UI fixture';");
    await ui("document.querySelector('#proxyEntryForm').requestSubmit();");
    await wait(() => controller.library.summaries().some((source) => source.name === 'UI fixture'), 'single proxy saved');
    const source = controller.library.summaries().find((item) => item.name === 'UI fixture');
    assert.equal(source.subscription, false);
    const saved = controller.library.node(source.id, 'UI fixture');
    assert.deepEqual(saved, { name: 'UI fixture', type: 'socks5', server: 'fixture.example', port: 2000, username: 'fixture-user', password: 'fixture-pass' });
    assert.equal(await ui('document.querySelector("#modalBackdrop").hidden'), true);
    console.log(JSON.stringify({ passed: true, name: 'Electron add proxy dialog saves a SOCKS5 node through real IPC' }));
    await controller.closeAll();
    window.destroy();
    app.quit();
  } catch (error) {
    console.error(error.stack || error.message);
    try { await controller?.closeAll(); } catch {}
    window?.destroy();
    app.exit(1);
  }
});
