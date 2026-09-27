'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');let count=0;
for(const dir of ['src/main','src/renderer','scripts','tests'])for(const name of fs.readdirSync(path.join(root,dir))){if(!/\.(c?js)$/.test(name))continue;const file=path.join(root,dir,name);new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});count++;}
const ui=fs.readFileSync(path.join(root,'src/renderer/app.js'),'utf8');for(const entry of ['data-action="task"','switch-account','renderExtensions'])assert(!ui.includes(entry));
const main=fs.readFileSync(path.join(root,'src/main/main.cjs'),'utf8');assert(main.includes('nodeIntegration:false'));assert(main.includes('contextIsolation:true'));const ipc=fs.readFileSync(path.join(root,'src/main/ipc.cjs'),'utf8');assert(ipc.includes("event.sender!==controls")&&ipc.includes("event.senderFrame!==controls.mainFrame"));console.log(`Syntax and boundary checks passed: ${count} scripts`);
