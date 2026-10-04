'use strict';
// Isolated test owner. No production profiles, credentials or external endpoints.
const path=require('node:path');
const {Mihomo}=require('../src/main/mihomo.cjs');
const dir=process.env.FACET_HOST_TEST_DIR;
const core=new Mihomo(path.resolve(__dirname,'../resources/mihomo/mihomo.exe'),dir);
const electron=process.versions.electron?require('electron'):null;
if(electron)electron.app.setPath('userData',dir);
function finish(){process.disconnect();if(electron)electron.app.quit();}
process.on('message',async message=>{
 if(message==='stop'){
  try{await core.stop();process.send({stopped:true},finish);}catch{process.exitCode=1;finish();}
 }
});
Promise.resolve(electron?electron.app.whenReady():null).then(()=>core.start({name:'local-test',type:'http',server:'127.0.0.1',port:9})).then(()=>{
 const info={ready:true,owner:process.pid,host:core.child.pid,core:core.pid,port:core.proxyPort,controllerPort:core.controllerPort};
 console.log('FACET_TEST_READY='+JSON.stringify(info));
 if(!electron)process.send(info);
}).catch(error=>{console.error('FACET_TEST_ERROR='+error.message);if(!electron)process.send({error:error.message},finish);else electron.app.exit(1);process.exitCode=1;});
