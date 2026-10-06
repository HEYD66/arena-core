'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const {childEnvironment,resolveRuntime}=require('./electron-runtime.cjs');
function verifyArtifacts(){
 const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const core=path.join(root,'resources/mihomo'),artifact=JSON.parse(fs.readFileSync(path.join(core,'ARTIFACT.json'),'utf8'));
 if(artifact.platform!=='win32'||artifact.architecture!=='x64'||hash(path.join(core,'mihomo.exe'))!==artifact.binarySHA256||hash(path.join(core,'mihomo-source.tar.gz'))!==artifact.sourceSHA256)throw Error('Mihomo 发行文件校验失败');
 const host=path.join(root,'resources/process-host'),manifest=JSON.parse(fs.readFileSync(path.join(host,'manifest.json'),'utf8'));
 if(manifest.architecture!=='x64'||hash(path.join(host,'facet-process-host.exe'))!==manifest.binarySHA256||hash(path.join(host,'ProcessHost.cs'))!==manifest.sourceSHA256)throw Error('进程保护组件校验失败，请运行 npm run build:process-host');
}
async function main(){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('当前安装包构建支持 Windows x64');
 verifyArtifacts();
 const env=childEnvironment();
 const executable=resolveRuntime({executable:require('electron'),version:require('electron/package.json').version,env});
 // Reuse the project's verified runtime. No runtime download or credential-based publishing.
 delete process.env.ELECTRON_RUN_AS_NODE;
 process.env.CSC_IDENTITY_AUTO_DISCOVERY='false';
 const {build,Platform}=require('electron-builder');
 const {Arch}=require('builder-util');
 const outputs=await build({projectDir:root,targets:Platform.WINDOWS.createTarget('nsis',Arch.x64),publish:'never',config:{...require('../electron-builder.config.cjs'),electronDist:path.dirname(executable),electronVersion:require('electron/package.json').version}});
 for(const file of outputs.filter(f=>f.endsWith('.exe'))){const sha=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');fs.writeFileSync(file+'.sha256',sha+'  '+path.basename(file)+'\n');console.log('Installer: '+file);console.log('SHA256: '+sha);}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={verifyArtifacts};
