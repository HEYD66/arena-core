'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('facetUpdateReminder',Object.freeze({answer(response){if(response===0||response===1)ipcRenderer.send('facet:update-reminder-answer',{response});}}));
