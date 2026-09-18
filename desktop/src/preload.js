"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Everything the renderer (frontend/app.js, unmodified) can reach. Kept as one file,
// not split per feature like desktop/src/ipc/* — a sandboxed preload script's module
// loader doesn't reliably resolve `require()` of separate local files (confirmed by
// testing: "module not found" for a relative require here, even though the same
// pattern works fine in the main process). Add a new capability as another small
// block below, each backed by one ipcRenderer.invoke("<feature>:<action>", ...) call
// whose handler lives in desktop/src/ipc/<feature>.js.
//
// window.desktop.isDesktop exists so a future guarded call site in frontend/app.js
// (e.g. a native-notification hook) has an established flag to check, without
// inventing one at that point — nothing calls it yet.
contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  platform: process.platform,
  versions: process.versions,

  // --- shell (desktop/src/ipc/shell.js) ---
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
});
