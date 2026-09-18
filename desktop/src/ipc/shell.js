"use strict";

const { ipcMain, shell } = require("electron");

const ALLOWED_SCHEMES = new Set(["http:", "https:", "mailto:"]);

// Handles window.desktop.openExternal(url) from the renderer. Validated here (not
// trusted from the renderer) since the URL could originate from page content.
function register() {
  ipcMain.handle("shell:open-external", async (_event, url) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) return false;
    await shell.openExternal(parsed.toString());
    return true;
  });
}

module.exports = { register };
