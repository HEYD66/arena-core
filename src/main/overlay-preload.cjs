"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "facetOverlay",
  Object.freeze({
    onRender(callback) {
      ipcRenderer.on("overlay:render", (_event, data) => callback(data));
    },
    send(message) {
      ipcRenderer.send("overlay:event", message);
    },
  }),
);
