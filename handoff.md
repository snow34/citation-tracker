# Handoff

Running log of work done in this session, kept up to date after every step.
Stale/resolved information is removed rather than left to accumulate — this
reflects the *current* state, not a full history.

## Active branch

`claude/admiring-archimedes-swa2ts` — pushed to origin, tracked by
[PR #12](https://github.com/snow34/citation-tracker/pull/12)
("Sortable/searchable/groupable library columns + light/dark theme toggle"),
open against `main`.

## What's done

**Library table: sorting, per-column search, grouping**
- Every column header (Title, Authors, Journal, Year, Status) is clickable to
  sort. Numeric columns (Year) default highest-first; text columns sort
  alphabetically. Clicking again reverses order; an arrow indicator shows the
  active sort/direction.
- Per-column instant (debounced) search boxes sit under each header, replacing
  the old single toolbar search box. Journal/Year/Status filters moved here
  from the toolbar too.
- Journal, Year, and Status headers have a group toggle ("⊞"): turns on
  sort-by-that-column and renders collapsible group header rows (e.g.
  "Nature (3)").
- Backend: `journal`, `authors`, `read_status` added as sortable fields;
  `title`/`authors` added as substring-search query params; journal filtering
  changed from exact-match to substring so it works as instant search.
- Files: `app/schemas/citation.py`, `app/dependencies.py`,
  `app/routers/citations.py`, `app/services/citation_service.py`,
  `frontend/app.js`, `frontend/styles.css`, `tests/test_library_search.py`
  (5 new tests).

**Light/dark theme toggle**
- Sun/moon button lets the user explicitly override the OS light/dark
  preference, persisted in `localStorage` (`ct_theme` key).
- Present in the topbar on logged-in pages (library/import/detail) and as a
  fixed corner button on login/register/forgot-password/reset-password.
- CSS dark-mode variables are now guarded so an explicit `data-theme="light"`
  attribute can override the OS `prefers-color-scheme: dark` media query.
- Files: `frontend/app.js`, `frontend/styles.css`.

## Verification done

- Backend: `pytest` — 47 passed (ran via a throwaway venv at `/tmp/ctenv`
  since the sandbox's system Python couldn't build `bibtexparser`; local
  Postgres cluster started with `pg_ctlcluster 16 main start` and both
  `citation_tracker` / `citation_tracker_test` DBs created + migrated for
  this to work).
- Frontend: exercised end-to-end in a real headless Chromium (Playwright,
  binary at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) against a
  local `uvicorn` + `python -m http.server` pair — verified sorting both
  directions per column, instant per-column search, grouping/collapsing by
  Journal, and theme toggling/persistence across reload and navigation.
- No manual check against the live Render deployment (frontend defaults to
  `https://citation-tracker-j9do.onrender.com`; use `?api=http://localhost:8000`
  once to point a local frontend at a local backend).

## PR #12 status

- CI green: `test` and `smoke-build` checks both passing.
- No merge conflicts (`mergeable_state: clean`).
- No review comments or threads yet.
- Subscribed via `subscribe_pr_activity` — this session gets woken on new
  CI results, reviews, and comments.
- No `.claude/skills/steward` or `.claude/skills/babysit` files exist in this
  repo, so no repo-specific PR-driving conventions override the default
  drive-to-green rules.
- A ~60-minute fallback check-in is scheduled (`send_later`) in case a
  webhook event is missed; re-armed on each check-in until the PR is merged
  or closed.

## Next steps / open items

- Waiting on human review/merge of PR #12 — nothing currently blocking on
  the agent side.
- If new commits are needed (review feedback, CI failure), push to the same
  branch (`claude/admiring-archimedes-swa2ts`) rather than opening a new PR.
