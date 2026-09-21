# Handoff

Running log of work done in this session, kept up to date after every step.
Stale/resolved information is removed rather than left to accumulate — this
reflects the *current* state, not a full history.

## Previously shipped (merged to `main`)

[PR #12](https://github.com/snow34/citation-tracker/pull/12) — sortable/
searchable/groupable library table columns, plus a light/dark theme toggle.
Merged at `a0d1d57`.

## In progress: Zotero library import

Branch `claude/admiring-archimedes-swa2ts`, restarted from latest `main`
(PR #12's branch was already merged, so per the branch-reuse convention this
picks up the same name fresh rather than stacking on merged history).

**What's done, not yet pushed as a PR:**
- New `parse_csljson` in `app/services/import_service.py` parses CSL-JSON —
  what Zotero's "Export Library... > CSL JSON" produces (a JSON array of
  items, or `{"items": [...]}`). Maps `author[].given/family` → author name
  strings, `issued.date-parts` → year, `container-title` → journal, `DOI`,
  `abstract`, `title`. Malformed JSON raises `AppError` (400), matching the
  existing error-handling convention.
- New endpoint `POST /citations/import/csljson`, reusing the existing
  `import_parsed_entries` pipeline (DOI-based dedup, per-item error
  collection) — same as the BibTeX/RIS importers.
- Frontend: added a "Zotero" tab next to BibTeX/RIS on the Import page and
  in the Add-citation modal's upload tab. Introduced a `FILE_IMPORT_KINDS`
  registry (`frontend/app.js`) mapping kind → {label, ext, accept} so the
  three file-based import UIs share one source of truth instead of
  duplicating per-format ternaries.
- Tests: `tests/test_import_csljson.py` — basic import, dedup-on-reimport,
  the `{"items": [...]}` wrapper shape, and invalid-JSON → 400.

**Verification done:**
- Backend: `pytest` — 51 passed (same throwaway venv at `/tmp/ctenv`; local
  Postgres via `pg_ctlcluster 16 main start`, already-existing
  `citation_tracker`/`citation_tracker_test` DBs).
- Frontend: exercised end-to-end in headless Chromium (Playwright) —
  uploaded a 2-item CSL-JSON sample through the Import page's Zotero tab,
  confirmed "2 imported / 0 skipped / 0 errors" and both titles/authors
  showing correctly in the library; confirmed the Add-citation modal's
  upload tab also offers and correctly configures the Zotero option.
- Not yet checked against a real Zotero export file (only a hand-written
  CSL-JSON sample) — worth a spot check if a real export is available.

## Next steps / open items

- Branch is committed and pushed to origin. No PR opened yet — the user
  hasn't asked for one; open on request per standing PR-creation policy.
- Consider whether to also validate against an actual Zotero-exported file
  before calling this fully done.
