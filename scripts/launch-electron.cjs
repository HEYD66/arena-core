'use strict';
const {spawn} = require('node:child_process');
const path = require('node:path');
const fs=require('node:fs'),os=require('node:os');
const {RuntimeOutput}=require('../src/main/runtime-output.cjs');
const {childEnvironment, exitDescription, resolveRuntime} = require('./electron-runtime.cjs');

function main() {
  const env = childEnvironment();
  const installed = require('electron');
  // An explicit developer override is deliberate; do not relocate or replace it.
  const executable = env.ELECTRON_OVERRIDE_DIST_PATH ? installed : resolveRuntime({
    executable: installed, version: require('electron/package.json').version, env
  });
  const outputDir=fs.mkdtempSync(path.join(os.tmpdir(),'facet-runtime-output-'));
  const output=new RuntimeOutput(path.join(outputDir,'output.json'));output.flush();env.FACET_RUNTIME_OUTPUT=output.file;
  const child = spawn(executable, process.argv.slice(2), {
    cwd: path.join(__dirname, '..'), env, stdio: ['inherit','pipe','pipe'], windowsHide: false
  });
  child.stdout.on('data',chunk=>{process.stdout.write(chunk);output.write('stdout',chunk);});
  child.stderr.on('data',chunk=>{process.stderr.write(chunk);output.write('stderr',chunk);});
  child.on('close',()=>output.close());
  child.on('error', error => {
    console.error('Electron 启动失败：' + error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (code || signal) console.error('Electron 退出：' + exitDescription({status: code, signal}));
    process.exitCode = code === 0 ? 0 : (Number.isInteger(code) && code > 0 && code < 256 ? code : 1);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    if (child.exitCode === null) child.kill(signal);
  });
}

try { main(); } catch (error) {
  console.error('Electron 启动失败：' + error.message);
  process.exitCode = 1;
}
