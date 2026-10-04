'use strict';
// Apply before renderer code can create a PeerConnection, including window.open children.
// This blocks non-proxied UDP; it does not spoof IPs or promise TURN relay IP = HTTP exit IP.
const POLICY = 'disable_non_proxied_udp';
const installed = new WeakSet();

function applyWebRTCPolicy(contents) {
  contents.setWebRTCIPHandlingPolicy(POLICY);
  if (contents.getWebRTCIPHandlingPolicy() !== POLICY) {
    throw new Error('WebRTC 防旁路策略未生效');
  }
}

function installWebRTCPolicy(app) {
  if (installed.has(app)) return;
  app.on('web-contents-created', (_event, contents) => {
    try {
      applyWebRTCPolicy(contents);
    } catch {
      // No silent downgrade to default. Close only this newly created page.
      console.error('WebRTC 防护初始化失败，已阻止该页面加载。');
      try {
        contents.stop();
        contents.close({waitForBeforeUnload: false});
      } catch {
        // If even closing the unprotected page fails, do not keep browsing unprotected.
        app.exit(1);
      }
    }
  });
  installed.add(app);
}

module.exports = {POLICY, applyWebRTCPolicy, installWebRTCPolicy};
