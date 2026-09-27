'use strict';
const {spawn}=require('node:child_process');const path=require('node:path');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),process.argv.slice(2),{cwd:path.join(__dirname,'..'),env,stdio:'inherit',windowsHide:false});
child.on('error',e=>{console.error('Electron 启动失败：'+e.message);process.exitCode=1;});child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(child.exitCode===null)child.kill(signal);});
