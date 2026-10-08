'use strict';
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),{spawnSync}=require('node:child_process');
function missingDependencies(root){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),req=createRequire(path.join(root,'package.json')),missing=[];
 for(const [name,expected]of Object.entries({...manifest.dependencies,...manifest.devDependencies})){
  try{const installed=JSON.parse(fs.readFileSync(path.join(root,'node_modules',name,'package.json'),'utf8'));if(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(expected)&&installed.version!==expected)throw Error('version mismatch');}catch{missing.push(name);}
 }
 if(!missing.includes('electron'))try{if(!fs.existsSync(req('electron')))missing.push('electron runtime');}catch{missing.push('electron runtime');}
 return missing;
}
function prepare(root=path.resolve(__dirname,'..')){
 const missing=missingDependencies(root);if(!missing.length){console.log('启动依赖已就绪。');return;}
 if(!fs.existsSync(path.join(root,'package-lock.json')))throw Error('缺少 package-lock.json，未安装依赖；请重新下载完整项目。');
 console.log('首次启动或依赖不完整，正在按锁定版本安装：'+missing.join('、'));
 const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['ci','--no-audit','--no-fund'],{cwd:root,stdio:'inherit',shell:process.platform==='win32',windowsHide:true});
 if(result.error||result.status!==0)throw Error('依赖安装失败，请检查上方网络或 npm 报错后重试。');
 const remaining=missingDependencies(root);if(remaining.length)throw Error('安装后仍缺少依赖：'+remaining.join('、'));
 console.log('依赖安装完成，准备启动千面。');
}
module.exports={prepare,missingDependencies};
if(require.main===module)try{prepare();}catch(error){console.error(error.message);process.exitCode=1;}
