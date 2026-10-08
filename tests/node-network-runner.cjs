'use strict';
// Remove the test profile after Electron exits and releases its session handles.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const owned=!process.env.FACET_NETWORK_TEST_DATA;
const root=process.env.FACET_NETWORK_TEST_DATA||fs.mkdtempSync(path.join(os.tmpdir(),'facet-node-network-runner-'));
const env={...process.env,FACET_NETWORK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(process.execPath,[path.resolve(__dirname,'../scripts/launch-electron.cjs'),path.resolve(__dirname,'node-network-electron.cjs')],{env,stdio:'inherit',windowsHide:true});
let spawnFailed=false;
child.on('error',()=>{spawnFailed=true;console.error('Network test could not launch');});
child.on('close',code=>{
 let cleanupFailed=false;
 if(owned){try{const resolved=path.resolve(root),prefix=path.join(os.tmpdir(),'facet-node-network-runner-');if(!resolved.startsWith(prefix)||fs.lstatSync(resolved).isSymbolicLink())throw Error();fs.rmSync(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:200});console.log('Isolated network test data removed: '+!fs.existsSync(resolved));}catch{cleanupFailed=true;console.error('Network test data cleanup failed; preserve directory for manual inspection');}}
 process.exitCode=spawnFailed||cleanupFailed?1:(code===0?0:1);
});
