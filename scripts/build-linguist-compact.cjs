'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function digest(root){const hash=crypto.createHash('sha256');function walk(dir){for(const x of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,x.name);if(x.isDirectory())walk(file);else hash.update(path.relative(root,file)).update(fs.readFileSync(file));}}walk(root);return hash.digest('hex');}
function replaceOnce(text,from,to){if(text.split(from).length!==2)throw Error('Unsupported Linguist bundle structure: '+from.slice(0,80));return text.replace(from,to);}
function build(source,output){
 source=path.resolve(source);output=path.resolve(output);
 if(fs.existsSync(output))throw Error('Output already exists; select a new directory');
 if(output.toLowerCase().startsWith(source.toLowerCase()+path.sep))throw Error('Output must be outside the original extension');
 const before=digest(source),manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
 if(manifest.version!=='7.1.0')throw Error('This adapter is verified for Linguist 7.1.0 only');
 let bg=fs.readFileSync(path.join(source,'background-script.js'),'utf8'),content=fs.readFileSync(path.join(source,'contentscript.js'),'utf8');
 const original='async get(){const{[this.storageName]:e}=await Ue().storage.local.get(this.storageName);if(void 0===e)return this.defaultData;const t=fn(bn,e);if(null!==t.errors)throw new Error("Invalid config");return t.data}';
 bg=replaceOnce(bg,original,'async get(){const stored=await Ue().storage.local.get([this.storageName,"facetTranslationEnabled"]);const e=stored[this.storageName];let base=this.defaultData;if(void 0!==e){const t=fn(bn,e);if(null!==t.errors)throw new Error("Invalid config");base=t.data}return stored.facetTranslationEnabled===false?{...base,selectTranslator:{...base.selectTranslator,enabled:false},pageTranslator:{...base.pageTranslator,enableContextMenu:false}}:base}');
 bg=replaceOnce(bg,'await o.start()}config;background;', 'await o.start();Ue().storage.onChanged.addListener((changes,area)=>{if(area==="local"&&changes.facetTranslationEnabled){n.get().then(data=>n.updateData(data)).catch(error=>console.error("Linguist compact:",error.message))}})}config;background;');
 content=replaceOnce(content,'mv.main()})()})();',fs.readFileSync(path.join(__dirname,'linguist-compact/content-boot.js'),'utf8')+'\n})()})();');
 fs.cpSync(source,output,{recursive:true,errorOnExist:true,force:false});
 fs.writeFileSync(path.join(output,'background-script.js'),bg);fs.writeFileSync(path.join(output,'contentscript.js'),content);
 const popup=path.join(output,'pages/popup');fs.copyFileSync(path.join(popup,'popup.html'),path.join(popup,'original.html'));
 for(const file of ['popup.html','compact.css','compact.js'])fs.copyFileSync(path.join(__dirname,'linguist-compact',file),path.join(popup,file));
 manifest.name='Linguist 简洁翻译';manifest.description='简洁翻译面板：页面翻译、恢复原文、语言规则和独立启用开关；保留 Linguist 原引擎及高级功能。';manifest.action.default_title='翻译';
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 fs.writeFileSync(path.join(output,'简洁版说明.txt'),'Linguist 7.1.0 简洁界面副本\r\n开关作用于当前实例：关闭后恢复原文，暂停自动页面翻译和划词翻译。重新开启保留原设置。\r\n更多菜单内保留高级设置和完整面板。原版目录未修改。\r\n在千面扩展中心移除旧的 Linguist 或停用旧版，再添加此目录，避免两份翻译器同时运行。\r\n回滚：停用本副本并重新启用原版。\r\n');
 if(digest(source)!==before)throw Error('Original plugin changed during build');
 return {source,output,sourceSHA256:before,outputSHA256:digest(output),version:manifest.version};
}
if(require.main===module){const [source,output]=process.argv.slice(2);if(!source||!output)throw Error('Usage: node scripts/build-linguist-compact.cjs SOURCE OUTPUT');console.log(JSON.stringify(build(source,output),null,2));}
module.exports={build,digest};
