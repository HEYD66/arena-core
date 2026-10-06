'use strict';

const { app, BrowserWindow } = require('electron');
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
    await ui("document.querySelector('[data-lib=add-source]').click()");
    await wait(() => ui('!!document.querySelector("#proxyEntryForm")'), 'add proxy dialog');
    await ui("document.querySelector('[data-type=socks5]').click(); document.querySelector('#proxyEntryHost').value='203.0.113.12'; document.querySelector('#proxyEntryPort').value='1080'; document.querySelector('#proxyEntryUsername').value='fixture-user'; document.querySelector('#proxyEntryPassword').value='fixture-pass'; document.querySelector('#proxyEntryName').value='UI fixture';");
    await ui("document.querySelector('#proxyEntryForm').requestSubmit();");
    await wait(() => controller.library.summaries().some((source) => source.name === 'UI fixture'), 'single proxy saved');
    const source = controller.library.summaries().find((item) => item.name === 'UI fixture');
    assert.equal(source.subscription, false);
    const saved = controller.library.node(source.id, 'UI fixture');
    assert.deepEqual(saved, { name: 'UI fixture', type: 'socks5', server: '203.0.113.12', port: 1080, username: 'fixture-user', password: 'fixture-pass' });
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
