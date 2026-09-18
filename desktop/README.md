# Citation Tracker Desktop (Electron)

A standalone desktop shell around the same REST API the web frontend and browser
extension already use — same account, same library, no separate backend or database.
`frontend/` (plain HTML/CSS/JS, no build step) is loaded directly from this app, not
copied, so any change there applies to the desktop app on the next run/package.

## Run it (dev)

```bash
cd desktop
npm install
npm start
```

This opens a window loading `app://app/index.html`, which `src/protocol.js` serves
from the repo's `../frontend` directory. The window talks to the same deployed
backend `frontend/app.js` defaults to. To point at a local `uvicorn` instance instead:

```bash
CT_DESKTOP_API_BASE=http://127.0.0.1:8000 npm start
```

(There's no URL bar to type `frontend/app.js`'s usual `?api=...` override into, so
this env var is the desktop equivalent — see `src/main.js`.)

## Architecture

- `src/main.js` — app lifecycle, window creation, external-link handling.
- `src/protocol.js` — registers the `app://` scheme (fixed host `app`, e.g.
  `app://app/index.html`) and serves `frontend/` through it, keyed off the URL's
  *pathname* only. Two things that look like they'd work but don't, found by testing:
  - **Not `file://`** — `process.resourcesPath` varies by OS/installer and can shift
    between app versions, and `file://` storage partitioning is inconsistent across
    Chromium versions. A fixed `app://` origin keeps `localStorage` (`ct_token`,
    `ct_api_base`, ...) reliable across relaunches and future auto-updates — verified
    with an end-to-end test that logs in, closes the app, relaunches it, and confirms
    the same token and library view come back.
  - **The host must be a constant string, not the requested filename.** An earlier
    version of this file used the requested file (`index.html`, `app.js`, ...) as the
    `app://` host. That breaks the moment a page references a sibling file by a
    relative path: `app://index.html` normalizes to `app://index.html/`, and a
    relative `<script src="app.js">` on that page then resolves against that origin
    to `app://index.html/app.js` — same "host", wrong "path" — which 404s. Keeping
    the host fixed (`app://app/...`) and letting only the *path* vary is what makes
    relative resource loading work the same way it does under `https://` or `file://`.
- `src/preload.js` — the `window.desktop` surface exposed to the page (currently
  `isDesktop`, `platform`, `versions`, `openExternal`). Kept as **one file**, not
  split per-feature — a sandboxed preload script's module loader doesn't reliably
  resolve `require()` of separate local files (confirmed by testing: splitting it
  into `preload-api/shell.js` produced a "module not found" error at runtime, even
  though the equivalent split works fine in the main process). Add a new capability
  as another block in this file instead.
- `src/ipc/*` — main-process handlers for each preload API, one file per feature
  (this half *can* be split, since it's plain Node in the main process, not sandboxed
  preload).
- `src/menu.js` — minimal native Edit/View/Window menu (required for copy/paste to
  work in a sandboxed renderer).

**Adding a native capability later** (tray icon, notifications, global shortcut, deep
links): add a new `ipcRenderer.invoke(...)` call in `src/preload.js`, its handler in a
new `src/ipc/<feature>.js`, and one `require("./<feature>").register()` line in
`src/ipc/index.js`. No changes to `main.js` or `frontend/app.js` needed.

## Status

Phase 1 (this): bare shell, no packaging, no auto-update, no icons — but verified
end-to-end (Playwright's Electron support) against a local backend: register/login,
add a citation with a DOI, confirm the external `doi.org` link opens via
`shell.openExternal` rather than navigating the app window, and confirm the auth
token survives a full app relaunch. Not yet built: `electron-builder` config + CI
(Phase 2), and native capabilities like tray/notifications/deep-links (Phase 3) — see
the project's desktop-app plan for the full staged rollout.

## Known gaps

- No app icon yet (same gap `extension/README.md` already flags for the browser
  extension's toolbar icon) — Electron shows a generic default window icon for now.
- The forgot-password email links to the hosted GitHub Pages frontend and opens in
  the system's default browser from this app, rather than a native in-app flow.
- Not packaged/signed — `npm start` only, no installer yet.
