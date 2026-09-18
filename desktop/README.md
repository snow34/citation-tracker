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
# macOS/Linux (bash/zsh)
CT_DESKTOP_API_BASE=http://127.0.0.1:8000 npm start
```
```powershell
# Windows (PowerShell)
$env:CT_DESKTOP_API_BASE = "http://127.0.0.1:8000"
npm start
```

(There's no URL bar to type `frontend/app.js`'s usual `?api=...` override into, so
this env var is the desktop equivalent — see `src/main.js`.)

On Windows, if `npm`/`npm start` fails with a script-execution-policy error, that's
PowerShell blocking npm's `.ps1` wrapper (unrelated to this project) — fix once with
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

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

## Building an installer

```bash
cd desktop
npm install
npm run build:dir    # fast: unpacked app only, no installer — good for local testing
npm run build         # full: produces a signed-if-configured installer for your OS
```

`electron-builder.yml` drives packaging. `frontend/` is pulled in via `extraResources`
(`{from: "../frontend", to: "frontend"}`) rather than a `files` glob reaching outside
`desktop/` (electron-builder's own docs flag that as fragile — asar-relative paths get
confused once patterns cross `projectDir`). `src/main.js`'s existing
`app.isPackaged` branch already expects the packaged layout
(`process.resourcesPath/frontend`) — verified by actually launching the built
`dist/linux-unpacked/citation-tracker-desktop` binary and re-running the same
register/login/add-citation flow against it.

The app icon (`build/icon.png`, source `build/icon.svg`) is composed from the
`icon.book` glyph already used in `frontend/app.js`'s topbar/auth-card branding,
centered on a rounded square filled with the app's `--accent` brand color
(`frontend/styles.css`), rather than a bare rasterization of the thin 24×24 UI glyph
(which looks weak at app-icon size without a background). electron-builder derives
`.icns`/`.ico` from this one PNG automatically.

Code signing is deliberately left unconfigured for now — electron-builder produces
unsigned installers by default. Expect a macOS Gatekeeper "unidentified developer"
warning and a Windows SmartScreen warning until that's set up (Apple Developer
Program for notarization; a Windows code-signing cert for SmartScreen reputation).
Unsigned macOS builds also can't auto-*install* an update via `electron-updater`
(Squirrel.Mac requires signing) — they can still detect one.

## CI

- `.github/workflows/desktop-ci.yml` — PR smoke test: builds the unpacked Linux app
  (`electron-builder --dir`, no publish) on any `desktop/**`/`frontend/**` change.
- `.github/workflows/desktop-release.yml` — on a `desktop-v*` tag (or manual dispatch),
  builds and publishes installers for Linux/macOS/Windows to a GitHub Release.
  **Not yet exercised with a real tag** — that's a deliberate release decision left
  for whoever's driving the project, not something CI or this app does on its own.

## Status

Phase 1: bare shell — done. Phase 2 (this): packaging, icon, auto-update wiring, CI —
done, verified by actually building and running the packaged Linux app end-to-end.
Not yet built: Phase 3's native capabilities (tray, notifications, deep links) — see
the project's desktop-app plan for the full staged rollout.

## Known gaps

- The forgot-password email links to the hosted GitHub Pages frontend and opens in
  the system's default browser from this app, rather than a native in-app flow.
- Unsigned builds (see "Building an installer" above) — Gatekeeper/SmartScreen
  warnings expected until code signing is set up.
- No `desktop-v*` release has actually been cut/published yet.
