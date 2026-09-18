"use strict";

const { Menu } = require("electron");

// Without a native menu defining these roles, a sandboxed BrowserWindow loses
// Cmd/Ctrl+C/V/Z/A on every platform — breaking the auth forms and notes textarea
// the moment someone tries to copy/paste. Minimal on purpose; grow it feature by
// feature (e.g. a "Check for updates" item) rather than front-loading menu items
// nothing uses yet.
function installAppMenu() {
  const template = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { installAppMenu };
