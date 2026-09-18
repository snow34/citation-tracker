"use strict";

const path = require("path");
const { app, BrowserWindow, shell } = require("electron");
const { registerAppProtocol, APP_HOST } = require("./protocol");
const { installAppMenu } = require("./menu");
const { registerAll } = require("./ipc");

// frontend/ is referenced in place, never copied — see desktop/README.md. In a
// packaged build electron-builder's extraResources puts a copy under
// process.resourcesPath/frontend; in dev we read the repo's frontend/ directly, so
// any change there shows up on the next `npm start` with no build step.
const frontendDir = app.isPackaged
  ? path.join(process.resourcesPath, "frontend")
  : path.join(__dirname, "..", "..", "frontend");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The app has exactly one external link today (the doi.org link in
  // detailContentHtml) plus the forgot-password email, which opens outside
  // Electron entirely. Both target="_blank" (window.open) and a plain <a href>
  // navigation are covered here, generically — app.js never needs to know it's
  // running inside Electron for this to work.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, navUrl) => {
    if (!navUrl.startsWith("app://")) {
      event.preventDefault();
      shell.openExternal(navUrl);
    }
  });

  // app.js's only way to point at a non-default backend is the one-time `?api=`
  // query param it checks on load (see frontend/app.js) — there's no URL bar here to
  // type that into, so CT_DESKTOP_API_BASE is the desktop equivalent, e.g.:
  //   CT_DESKTOP_API_BASE=http://127.0.0.1:8000 npm start
  const apiOverride = process.env.CT_DESKTOP_API_BASE
    ? `?api=${encodeURIComponent(process.env.CT_DESKTOP_API_BASE)}`
    : "";
  mainWindow.loadURL(`app://${APP_HOST}/index.html${apiOverride}`);
}

app.whenReady().then(() => {
  // protocol.handle() operates on the default session, which only exists once the
  // app is ready — registerSchemesAsPrivileged (in protocol.js, run at require time,
  // before this) is the half that must happen earlier instead.
  registerAppProtocol(frontendDir);
  installAppMenu();
  registerAll();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
