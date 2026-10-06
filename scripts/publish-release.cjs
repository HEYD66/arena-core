'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
function run(command,args){const result=spawnSync(command,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});if(result.status!==0)throw Error(result.error?.message||result.stderr.trim()||command+' failed');return result.stdout.trim();}
function releaseAssets(){
 const yaml=require('js-yaml'),dir=path.join(root,'release'),meta=yaml.load(fs.readFileSync(path.join(dir,'latest.yml'),'utf8'));
 if(meta.version!==pkg.version)throw Error('latest.yml 与当前应用版本不一致，请重新构建');
 const installer='Facet-Setup-'+pkg.version+'-x64.exe',file=path.join(dir,installer),row=meta.files.find(x=>x.url===installer);
 if(!row||crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64')!==row.sha512)throw Error('安装包与更新清单校验值不一致');
 const assets=[file,file+'.blockmap',path.join(dir,'latest.yml'),file+'.sha256'];for(const asset of assets)if(!fs.existsSync(asset))throw Error('缺少发布文件：'+path.basename(asset));return assets;
}
function main(){
 const assets=releaseAssets();if(run('git',['status','--porcelain']))throw Error('请先提交代码，再发布版本');
 const sha=run('git',['rev-parse','HEAD']);const remote=run('git',['ls-remote','origin','refs/heads/main']).split(/\s+/)[0];if(remote!==sha)throw Error('请先将当前提交推送到 GitHub main');
 const tag='v'+pkg.version;const notes=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'facet-release-')),'notes.md');
 if(process.argv[2])fs.copyFileSync(path.resolve(process.argv[2]),notes);
 else if(pkg.version==='0.2.1')fs.writeFileSync(notes,'# 千面 Facet '+pkg.version+'\n\nWindows x64 安装包。首次接入在线更新的版本需要手动安装一次。\n\n- 应用信息提供检查更新、下载进度和确认退出安装。\n- 更新前正常停止实例，保留配置、登录资料和扩展。\n- 删除应用信息中的旧介绍与边界卡片。\n\n安装包未签名。当前开发环境建议安装到默认 C 盘目录。\n');
 else throw Error('后续发布请提供更新说明：npm run release:publish -- notes.md');
 try{
  run('gh',['release','create',tag,...assets,'--repo','HEYD66/arena-core','--target',sha,'--draft','--title','千面 Facet '+pkg.version,'--notes-file',notes]);
  const release=JSON.parse(run('gh',['release','view',tag,'--repo','HEYD66/arena-core','--json','assets,isDraft,url']));
  for(const file of assets){const row=release.assets.find(item=>item.name===path.basename(file));if(!row||row.size!==fs.statSync(file).size)throw Error('GitHub 发布文件未完整上传；保留草稿，请核对后发布');}
  run('gh',['release','edit',tag,'--repo','HEYD66/arena-core','--draft=false','--latest']);console.log(release.url);
 }finally{fs.unlinkSync(notes);fs.rmdirSync(path.dirname(notes));}
}
if(require.main===module)try{main();}catch(error){console.error(error.message);process.exitCode=1;}
module.exports={releaseAssets};
