'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('facetExit',Object.freeze({answer(response,checkboxChecked){if(response===0||response===1)ipcRenderer.send('facet:exit-answer',{response,checkboxChecked:checkboxChecked===true});}}));
