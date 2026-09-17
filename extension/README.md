# Citation Tracker Clipper (Firefox & Chrome extension)

A standalone browser extension that adds the article you're currently viewing to your
Citation Tracker library. Works on Scopus, Taylor & Francis Online, and — since it reads
the standard `citation_*` (Highwire Press) meta tags that most scholarly publishers embed
(ScienceDirect, Wiley, Springer, SAGE, Google Scholar, etc.) — most other article pages too,
not just those two.

Built Firefox-first, and now also loads unmodified in Chrome/Chromium: one Manifest V3
package, one `manifest.json`, no per-browser build step. The only real cross-browser gap —
Firefox's promise-based `browser.*` API namespace vs. Chrome's `chrome.*` — is bridged by
Mozilla's vendored `vendor/browser-polyfill.js`, loaded before every other script.

## How it works

1. You click the toolbar icon on an article page.
2. The popup injects `extractor.js` into that tab (only that tab, only on click — no
   background scraping) to read `citation_doi`, `citation_title`, `citation_author`,
   `citation_journal_title`, `citation_publication_date`, and `citation_abstract` meta
   tags, falling back to a DOI regex scan and the page's `<title>` if tags are missing.
3. If a DOI was found, you get a one-click **Add via DOI** button, which calls the
   backend's existing `POST /citations/import/doi` — this re-fetches clean metadata from
   Crossref rather than trusting whatever the page's meta tags say.
4. Either way, an editable form (pre-filled from the scrape) lets you add the citation
   manually via `POST /citations`, for pages with no DOI or bad tags.

## Load it in Firefox (temporary, for development)

1. Open `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…** → select `manifest.json` in this folder.
3. Pin the toolbar icon, open an article page (e.g. a Scopus record or a T&F Online
   article), and click it.

Temporary add-ons are removed when Firefox restarts — reload them from
`about:debugging` as needed during development.

## Load it in Chrome / Chromium (unpacked, for development)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. **Load unpacked** → select this `extension/` folder directly (not `manifest.json`).
4. Pin the toolbar icon and use it the same way as in Firefox.

Chrome will print a harmless "Unrecognized manifest key 'browser_specific_settings'"
warning on the extensions page — that key is Firefox-only metadata (extension ID +
minimum version) and Chrome correctly ignores it. Unpacked extensions persist across
restarts in Chrome (unlike Firefox's temporary add-ons), but get disabled if the profile
considers them "unpublished" — reload from `chrome://extensions` if that happens.

## Configuration

- The popup and options page talk to the deployed backend
  (`https://citation-tracker-j9do.onrender.com`) by default.
- To point at a different backend (e.g. a local `uvicorn` instance), open the extension's
  **Settings** (right-click the toolbar icon → Manage Extension → Preferences, or the
  "Settings" link in the popup) and change the API base URL. You'll be prompted to grant
  the extension permission to contact that origin the first time.

## Auth

Log in with your existing Citation Tracker account/password in the popup. The returned
JWT is stored in `browser.storage.local` (extension-local storage, not shared with any
page). There's no server-side session, so "log out" just discards the local token — same
model as the web frontend.

## Notes for whoever picks this up next

- Manifest V3, one codebase for both Firefox and Chrome. `vendor/browser-polyfill.js`
  (Mozilla's `webextension-polyfill`, MPL-2.0, vendored from npm rather than a CDN since
  this session's egress policy blocked jsDelivr/unpkg) is what makes `browser.*` calls in
  `api.js`/`popup.js`/`options.js` work unmodified on Chrome. There's no background script,
  so the usual `background.scripts` (Firefox) vs. `background.service_worker` (Chrome)
  manifest split never comes up — add one only if real background logic is ever needed,
  and branch the manifest key then.
- Not yet submitted to either store — only tested via Firefox's "Load Temporary Add-on"
  and Chrome's "Load unpacked". Publishing needs icons (below) and, for the Chrome Web
  Store, a developer account and their review process; for AMO, a signed `.xpi`.
- No toolbar icon graphics are bundled yet (`manifest.json` has no `icons` key), so both
  browsers show a generic placeholder. Add PNGs (16/32/48/128px) and an `icons` entry
  before submitting to either store.
- The backend's `ALLOWED_ORIGINS` was widened to `*` (see `render.yaml`) so requests from
  the extension's `moz-extension://` origin aren't blocked by CORS. This is safe because
  auth is bearer-JWT, not cookies (see the main repo's `HANDOFF.md`).
- Site-specific scrapers (rather than generic meta tags) were deliberately not built —
  the Highwire Press tags already cover Scopus and T&F well. If a specific publisher turns
  out to have missing/bad tags, add a targeted fallback inside `extractor.js` rather than a
  whole separate scraper.
