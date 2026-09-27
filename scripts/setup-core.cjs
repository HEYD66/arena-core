'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {execFileSync}=require('node:child_process');
const version='v1.19.31';
const assets={win32:{name:'mihomo-windows-amd64-compatible-v1.19.31.zip',digest:'93d14e9a13b49b2f2d256202d02cc8d14a7c4695edf084cae0f941986bc9c218'},linux:{name:'mihomo-linux-amd64-compatible-v1.19.31.gz',digest:'04cf9f09671704f839ddbee2e93069dc831a4123a75281e725d1d96ab9ac1afc'}};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function download(url){const r=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error(`下载失败 HTTP ${r.status}`);return Buffer.from(await r.arrayBuffer());}
(async()=>{if(process.arch!=='x64'||!assets[process.platform])throw Error('当前安装脚本仅支持 Windows/Linux x64');const a=assets[process.platform],url=`https://github.com/MetaCubeX/mihomo/releases/download/${version}/${a.name}`;const bytes=await download(url);if(hash(bytes)!==a.digest)throw Error('官方发行资产 SHA256 不一致，停止安装');const root=path.join(__dirname,'../resources/mihomo');fs.mkdirSync(root,{recursive:true});let binary;
 if(process.platform==='linux')binary=zlib.gunzipSync(bytes);else{const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arena-core-'));try{const zip=path.join(temp,'core.zip'),out=path.join(temp,'unpacked');fs.writeFileSync(zip,bytes);const quote=x=>"'"+x.replace(/'/g,"''")+"'";execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Expand-Archive -LiteralPath ${quote(zip)} -DestinationPath ${quote(out)} -Force`],{stdio:'pipe',windowsHide:true});const files=fs.readdirSync(out).filter(n=>n.endsWith('.exe'));if(files.length!==1)throw Error('内核压缩包内容不符合预期');binary=fs.readFileSync(path.join(out,files[0]));}finally{fs.rmSync(temp,{recursive:true,force:true});}}
 const licenseURL=`https://raw.githubusercontent.com/MetaCubeX/mihomo/${version}/LICENSE`,sourceURL=`https://codeload.github.com/MetaCubeX/mihomo/tar.gz/refs/tags/${version}`;
 const [license,source]=await Promise.all([download(licenseURL),download(sourceURL)]);
 fs.writeFileSync(path.join(root,'LICENSE'),license);fs.writeFileSync(path.join(root,'mihomo-source.tar.gz'),source);
 const target=path.join(root,process.platform==='win32'?'mihomo.exe':'mihomo');fs.writeFileSync(target,binary,{mode:0o755});
 const record={version,platform:process.platform,architecture:process.arch,assetURL:url,assetSHA256:a.digest,binarySHA256:hash(binary),sourceURL,sourceSHA256:hash(source),licenseURL,releaseURL:`https://github.com/MetaCubeX/mihomo/releases/tag/${version}`};fs.writeFileSync(path.join(root,'ARTIFACT.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record,null,2));console.log(execFileSync(target,['-v'],{encoding:'utf8',windowsHide:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
