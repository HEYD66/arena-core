'use strict';
const path=require('node:path'),fs=require('node:fs');
function userDataPath(app){
 if(!app.commandLine.hasSwitch('user-data-dir')){
  const base=app.getPath('appData'),existing=path.join(base,'ArenaCore');
  // Existing installations keep their data in place; fresh installations use the product name.
  return fs.existsSync(existing)?existing:path.join(base,'Facet');
 }
 const value=app.commandLine.getSwitchValue('user-data-dir');
 if(!value||!path.isAbsolute(value))throw Error('--user-data-dir 必须是绝对路径；未改变默认实例数据');
 return path.resolve(value);
}
function resourcePath(app,...parts){return path.join(app.isPackaged?process.resourcesPath:path.resolve(__dirname,'../../resources'),...parts);}
module.exports={userDataPath,resourcePath};
