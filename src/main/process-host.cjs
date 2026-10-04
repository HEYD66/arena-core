'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
function hostPath(){
 const root=path.resolve(__dirname,'../../resources/process-host');
 const dir=process.resourcesPath&&fs.existsSync(path.join(process.resourcesPath,'process-host'))?path.join(process.resourcesPath,'process-host'):root;
 const binary=path.join(dir,'facet-process-host.exe');
 try{
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  const hash=crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
  if(manifest.version!==1||manifest.architecture!=='x64'||manifest.binarySHA256!==hash)throw Error();
 }catch{throw Error('Windows 进程保护组件缺失或校验失败；已阻止代理启动，请运行 npm run build:process-host');}
 return binary;
}
function spawnCore(binary,dir,config){
 if(process.platform!=='win32')return spawn(binary,['-d',dir,'-f',config],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 const child=spawn(hostPath(),[path.resolve(binary),path.resolve(dir),path.resolve(config)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let header='';
  const pidHeader=chunk=>{
  header+=chunk.toString('utf8');
  if(header.length>4096)header=header.slice(-4096);
  for(;;){const end=header.indexOf('\n');if(end<0)break;const line=header.slice(0,end).trim();header=header.slice(end+1);const match=/^FACET_CORE_PID=(\d+)$/.exec(line);if(!match)continue;child.corePid=Number(match[1]);child.emit('facet-core-pid',child.corePid);child.stdout.removeListener('data',pidHeader);break;}
 };
 child.stdout.on('data',pidHeader);
 child.stdin.on('error',()=>{});
 child.once('spawn',()=>child.stdin.write('START\n'));
 return child;
}
function markerPath(dir){return path.join(dir,'process-host.json');}
function writeProcessMarker(dir,marker){
 if(process.platform!=='win32')return;
 fs.mkdirSync(dir,{recursive:true});const target=markerPath(dir),tmp=target+'.tmp-'+process.pid;
 fs.writeFileSync(tmp,JSON.stringify({version:1,...marker},null,2)+'\n',{mode:0o600});fs.renameSync(tmp,target);
}
function removeProcessMarker(dir){if(process.platform!=='win32')return;try{fs.rmSync(markerPath(dir),{force:true});}catch{}}
function processMatches(pid,expected){
 if(process.platform!=='win32'||!Number.isSafeInteger(pid)||pid<1||!path.isAbsolute(expected))return false;
 const quoted=path.resolve(expected).replace(/'/g,"''");
 try{const command=`$p=Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\"; if($p -and [String]::Equals($p.ExecutablePath,'${quoted}',[StringComparison]::OrdinalIgnoreCase)){'1'}`;return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',command],{windowsHide:true,stdio:['ignore','pipe','ignore'],encoding:'ascii',timeout:2500}).trim()==='1';}catch{return false;}
}
function killOwned(pid,expected){if(!processMatches(pid,expected))return false;try{process.kill(pid);return true;}catch{return false;}}
function recoverProcessHosts(root){
 const result={scanned:0,terminated:0,removed:0,skipped:0};if(process.platform!=='win32')return result;
 let entries=[];try{entries=fs.readdirSync(root,{withFileTypes:true});}catch{return result;}
 for(const e of entries){if(!e.isDirectory())continue;const dir=path.join(root,e.name),file=markerPath(dir);let marker;
  try{marker=JSON.parse(fs.readFileSync(file,'utf8'));}catch{continue;}result.scanned++;
  const valid=marker?.version===1&&path.isAbsolute(marker.hostBinary)&&path.isAbsolute(marker.coreBinary)&&Number.isSafeInteger(marker.hostPid)&&marker.hostPid>0;
  if(!valid){result.skipped++;continue;}
  const host=killOwned(marker.hostPid,marker.hostBinary);if(host)result.terminated++;
  if(Number.isSafeInteger(marker.corePid)&&marker.corePid>0&&killOwned(marker.corePid,marker.coreBinary))result.terminated++;
  try{fs.rmSync(file,{force:true});result.removed++;}catch{result.skipped++;}
 }
 return result;
}
module.exports={spawnCore,hostPath,writeProcessMarker,removeProcessMarker,recoverProcessHosts,markerPath};
