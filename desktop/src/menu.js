"use strict";

const { Menu } = require("electron");

// Without a native menu defining these roles, a sandboxed BrowserWindow loses
// Cmd/Ctrl+C/V/Z/A on every platform — breaking the auth forms and notes textarea
// the moment someone tries to copy/paste. Minimal on purpose; grow it feature by
// feature (e.g. a "Check for updates" item) rather than front-loading menu items
// nothing uses yet.
//
// The one addition beyond the default roles: "Reset API Backend". app.js's `?api=`
// override (see main.js's CT_DESKTOP_API_BASE handling) writes ct_api_base into
// localStorage, which persists across relaunches by design (see README). That's
// right for the normal case, but it means anyone who ever launched with
// CT_DESKTOP_API_BASE set (e.g. following the dev instructions to point at a local
// backend) is stuck on that URL on every future launch too — with no URL bar to
// override it back, that override is otherwise permanent. This clears it directly
// via the focused window's own localStorage, no preload/ipc plumbing needed since
// it's a main-process menu action, not renderer-initiated.
function installAppMenu() {
  const template = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      label: "Backend",
      submenu: [
        {
          label: "Reset API Backend to Hosted Default",
          click: (_menuItem, browserWindow) => {
            if (!browserWindow) return;
            browserWindow.webContents.executeJavaScript(
              "localStorage.removeItem('ct_api_base'); location.reload();"
            );
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { installAppMenu };
