'use strict';
// Real NSIS installers under a separate application identity; never replace a live Facet installation.
const path=require('node:path');
const {resolveRuntime,childEnvironment}=require('../scripts/electron-runtime.cjs');
const {verifyArtifacts}=require('../scripts/build-installer.cjs');
async function main(){
 const version=process.argv[2];
 if(!version){const {spawn}=require('node:child_process');for(const value of ['0.2.1','0.2.2'])await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[__filename,value],{env:childEnvironment(),stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Validation build failed: '+value)));});return;}
 if(!['0.2.1','0.2.2'].includes(version))throw Error('Unexpected validation version');
 verifyArtifacts();const {build,Platform}=require('electron-builder'),{Arch}=require('builder-util');
 const runtime=resolveRuntime({executable:require('electron'),version:require('electron/package.json').version,env:childEnvironment()});delete process.env.ELECTRON_RUN_AS_NODE;process.env.CSC_IDENTITY_AUTO_DISCOVERY='false';
 const base=require('../electron-builder.config.cjs');
 await build({projectDir:path.resolve(__dirname,'..'),targets:Platform.WINDOWS.createTarget('nsis',Arch.x64),publish:'never',config:{...base,appId:'Facet.OnlineUpdateValidation',productName:'千面在线更新验证',executableName:'FacetUpdateTest',extraMetadata:{name:'facet-online-update-validation',version},directories:{...base.directories,output:'release/update-validation/'+version},electronDist:path.dirname(runtime),electronVersion:require('electron/package.json').version,publish:[{provider:'generic',url:'http://127.0.0.1:34279/',useMultipleRangeRequest:false}],nsis:{...base.nsis,shortcutName:'千面在线更新验证',createDesktopShortcut:false,createStartMenuShortcut:false}}});
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
