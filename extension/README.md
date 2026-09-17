# Citation Tracker Clipper (Firefox extension)

A standalone Firefox extension that adds the article you're currently viewing to your
Citation Tracker library. Works on Scopus, Taylor & Francis Online, and — since it reads
the standard `citation_*` (Highwire Press) meta tags that most scholarly publishers embed
(ScienceDirect, Wiley, Springer, SAGE, Google Scholar, etc.) — most other article pages too,
not just those two.

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

- Manifest V3, Firefox-only for now (`browser_specific_settings.gecko`). Porting to
  Chrome/Chromium mainly means swapping `background.scripts` for `background.service_worker`
  if a background script is ever added, and testing the `scripting.executeScript` +
  `activeTab` flow there — both are used unchanged from Chrome's own MV3 APIs.
- No toolbar icon graphics are bundled yet (`manifest.json` has no `icons` key), so Firefox
  shows a generic placeholder. Add PNGs and an `icons` entry when someone wants to make
  this installable from AMO.
- The backend's `ALLOWED_ORIGINS` was widened to `*` (see `render.yaml`) so requests from
  the extension's `moz-extension://` origin aren't blocked by CORS. This is safe because
  auth is bearer-JWT, not cookies (see the main repo's `HANDOFF.md`).
- Site-specific scrapers (rather than generic meta tags) were deliberately not built —
  the Highwire Press tags already cover Scopus and T&F well. If a specific publisher turns
  out to have missing/bad tags, add a targeted fallback inside `extractor.js` rather than a
  whole separate scraper.
