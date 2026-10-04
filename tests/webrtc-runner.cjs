'use strict';
// Separate Electron processes and temporary profiles; no production data or external STUN.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'facet-webrtc-regression-'));
let passed=false;
try {
  for(const mode of ['control','guarded']) {
    const output=path.join(root,mode+'.json');
    const run=spawnSync(process.execPath,[path.join(__dirname,'../scripts/launch-electron.cjs'),path.join(__dirname,'webrtc-electron.cjs'),mode,output],
      {cwd:path.join(__dirname,'..'),stdio:'inherit',timeout:60000});
    if(run.error||run.status!==0)throw Error('WebRTC '+mode+' failed: '+(run.error?.message||run.status));
    const report=JSON.parse(fs.readFileSync(output,'utf8'));
    if(report.error)throw Error(report.error);
    console.log('PASS '+mode+': HTTP proxy, initial-script popup, cross-site iframe, independent storage; UDP='+report.totalUdp);
  }
  passed=true;
} catch(error) {console.error(error);process.exitCode=1;}
finally {
  // Retain failed fixtures for diagnosis, never remove a live/unknown profile on timeout.
  if(passed)fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:200});
  else console.error('Failed-test artifacts: '+root);
}
