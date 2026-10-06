'use strict';
const path=require('node:path');
function userDataPath(app){
 if(!app.commandLine.hasSwitch('user-data-dir'))return path.join(app.getPath('appData'),'ArenaCore');
 const value=app.commandLine.getSwitchValue('user-data-dir');
 if(!value||!path.isAbsolute(value))throw Error('--user-data-dir 必须是绝对路径；未改变默认实例数据');
 return path.resolve(value);
}
function resourcePath(app,...parts){return path.join(app.isPackaged?process.resourcesPath:path.resolve(__dirname,'../../resources'),...parts);}
module.exports={userDataPath,resourcePath};
