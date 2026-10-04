'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs'), path = require('node:path');
const {POLICY, applyWebRTCPolicy, installWebRTCPolicy} = require('../src/main/webrtc-policy.cjs');

function contents() {
  let policy = 'default';
  return {calls: [],
    setWebRTCIPHandlingPolicy(p) {this.calls.push(['set', p]); policy = p;},
    getWebRTCIPHandlingPolicy() {return policy;},
    stop() {this.calls.push(['stop']);},
    close(options) {this.calls.push(['close', options]);}
  };
}
test('native policy is set and read back without changing the page API', () => {
  const c=contents();applyWebRTCPolicy(c);
  assert.equal(c.getWebRTCIPHandlingPolicy(), POLICY);
  assert.deepEqual(c.calls, [['set', POLICY]]);
});
test('registration is idempotent and covers every newly created webContents', () => {
  const app=new EventEmitter();installWebRTCPolicy(app);installWebRTCPolicy(app);
  assert.equal(app.listenerCount('web-contents-created'),1);
  for (let i=0;i<5;i++) {const c=contents();app.emit('web-contents-created',{},c);assert.equal(c.getWebRTCIPHandlingPolicy(),POLICY);}
});
test('policy readback mismatch closes the page without waiting for beforeunload', () => {
  const app=new EventEmitter(),c=contents();c.getWebRTCIPHandlingPolicy=()=> 'default';
  installWebRTCPolicy(app);app.emit('web-contents-created',{},c);
  assert.deepEqual(c.calls.slice(1),[['stop'],['close',{waitForBeforeUnload:false}]]);
});
test('missing native API does not silently leave an unprotected page', () => {
  const app=new EventEmitter(),c=contents();delete c.setWebRTCIPHandlingPolicy;
  installWebRTCPolicy(app);app.emit('web-contents-created',{},c);
  assert.deepEqual(c.calls,[['stop'],['close',{waitForBeforeUnload:false}]]);
});
test('failure to close an unprotected page fails closed', () => {
  const app=new EventEmitter(),c=contents();let exit;
  app.exit=code=>{exit=code;};c.setWebRTCIPHandlingPolicy=()=>{throw Error('unsupported');};c.close=()=>{throw Error('failed close');};
  installWebRTCPolicy(app);app.emit('web-contents-created',{},c);assert.equal(exit,1);
});
test('production installs the guard before creating windows, including alternate Controller entrypoints', () => {
  const main=fs.readFileSync(path.join(__dirname,'../src/main/main.cjs'),'utf8');
  assert(main.indexOf('installWebRTCPolicy(app)')<main.indexOf('app.whenReady()'));
  assert(!main.includes("appendSwitch('force-webrtc-ip-handling-policy'"));
  const ctl=fs.readFileSync(path.join(__dirname,'../src/main/controller.cjs'),'utf8');
  assert.match(ctl,/constructor\(window,dir,binary\)\{installWebRTCPolicy\(app\)/);
});
