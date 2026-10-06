'use strict';
// Owns only the new fixture process and the temporary directory created here.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'facet-popup-acceptance-'));
const project=path.join(__dirname,'..');
const scaleArg=process.argv.slice(2).find(value=>value.startsWith('--scale='));
const scale=scaleArg?scaleArg.slice('--scale='.length):'';
if(scale&&!['1','1.25','2'].includes(scale)){
  fs.rmSync(root,{recursive:true,force:true});console.error('Unsupported fixture scale');process.exitCode=1;
}else{
  const env={...process.env,FACET_POPUP_TEST_ROOT:root,FACET_POPUP_TEST_SCALE:scale};
  const child=spawn(process.execPath,[path.join(__dirname,'launch-electron.cjs'),path.join(project,'tests/extension-popup-electron.cjs')],{cwd:project,env,stdio:'inherit',windowsHide:true});
  let cleaned=false;
  const cleanup=()=>{if(cleaned)return;cleaned=true;try{fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}catch{console.error('Owned temporary popup fixture cleanup deferred');}};
  child.on('error',error=>{console.error('Popup fixture launch failed: '+error.message);process.exitCode=1;cleanup();});
  child.on('exit',(code,signal)=>{cleanup();process.exitCode=code===0&&!signal?0:1;});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(child.exitCode===null)child.kill(signal);});
}
