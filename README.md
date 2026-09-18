# Citation Tracker

A personal citation library manager. Import references from **BibTeX**, **RIS**, or a **DOI**
lookup (via Crossref), keep notes and a read status on each one, and search/filter your library.
A FastAPI backend with a clean REST API, decoupled from any particular frontend.

## Current scope

This is the Phase 1 skeleton:

- Accounts (register / login / logout / me), each user sees only their own library
- Manual citation entry, edit, delete
- Import via BibTeX file, RIS file, or DOI lookup (Crossref)
- Library list with search / filter / sort / pagination, and per-citation notes + read status

**Not implemented yet:** Scopus search integration, tags and collections, BibTeX/RIS *export*,
and Scopus-quota hardening. The database schema already reserves tables for tags and collections
so a later migration won't need to retrofit foreign keys onto live data.

## Stack

FastAPI, SQLAlchemy 2.0 (async, `asyncpg`), PostgreSQL, Alembic, Argon2id password hashing,
stateless JWT auth, `bibtexparser` / `rispy` for import parsing, `httpx` for the Crossref lookup.

## Setup

```bash
cp .env.example .env          # edit JWT_SECRET_KEY etc. for anything beyond local dev
docker-compose up -d          # starts Postgres (main + test databases)
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

Then open http://localhost:8000/docs for interactive API docs.

## Running tests

Tests run against a real Postgres database (not SQLite) via `TEST_DATABASE_URL` in `.env`,
so JSONB, partial unique indexes, and other Postgres-specific behavior are actually exercised.

```bash
alembic upgrade head   # if the test DB hasn't been migrated yet — see .env's TEST_DATABASE_URL
pytest
```

## Environment variables

See `.env.example`. Notably `CROSSREF_MAILTO` — set it to a real contact address in any
deployed environment so Crossref routes your requests into its "polite pool" with better
rate limits; the placeholder default is fine for local development only.

## Deploy to Render

The repo includes a `Dockerfile` and a Render Blueprint (`render.yaml`) that provisions both
the web service and a managed Postgres database in one step.

1. Sign in at [render.com](https://render.com) and connect your GitHub account.
2. **New +** → **Blueprint** → select `snow34/citation-tracker`. Render reads `render.yaml`
   and shows a preview of the web service + database it's about to create.
3. Click **Apply**. Render builds the Docker image, provisions Postgres, links
   `DATABASE_URL` automatically, and generates a random `JWT_SECRET_KEY` for you.
4. Once the first deploy finishes, open the service's **Environment** tab and confirm:
   - `CROSSREF_MAILTO` → a real contact address (Crossref's polite-pool etiquette)
   - `ALLOWED_ORIGINS` → set to the GitHub Pages origin (`https://snow34.github.io`) so the
     frontend below can call the API cross-origin; update this if the frontend ever moves
     to a different origin. Safe either way since auth is bearer-JWT rather than cookies.
   - `RESEND_API_KEY` → a key from your [Resend](https://resend.com) dashboard (free tier
     works; the default sender needs no domain verification). Marked `sync: false` in the
     Blueprint, so Render prompts for it on first apply and won't overwrite it afterwards.
     Without it, `/auth/forgot-password` still responds normally but silently fails to
     actually send the email (see `app/services/auth_service.py`).
5. From then on, every push to `main` auto-deploys — no separate deploy step needed in CI,
   which stays scoped to lint/migrate/test.

The start command (`alembic upgrade head && uvicorn ...`) runs migrations on every boot.
That's a no-op once the schema is current and is fine at this app's current single-instance
scale; if it's ever scaled to multiple instances, move the migration to Render's
pre-deploy-command feature instead so it runs once per deploy, not once per instance.

## Frontend

`frontend/` is a plain HTML/CSS/JS single-page app (no build step) that talks to the API
above. It's deployed to **GitHub Pages** via `.github/workflows/deploy-pages.yml`, which
publishes the `frontend/` folder on every push to `main` that touches it.

One-time setup (repo owner only): in **Settings → Pages**, set **Source** to
**GitHub Actions**. After that, the live frontend is at
`https://snow34.github.io/citation-tracker/`.

The frontend points at the deployed Render backend by default. To point it at a different
API (e.g. `localhost:8000` for local dev), open it with `?api=<url>` once — the override is
remembered in `localStorage`.

## Browser extension

`extension/` is a standalone Firefox & Chrome extension ("Citation Tracker Clipper") that
adds the article you're viewing — Scopus, Taylor & Francis Online, and most other publisher
pages, via the standard `citation_*` meta tags they embed — to your library in one click,
using the same API as the web frontend. See `extension/README.md` for how to load it in
either browser and how it works.

## Desktop app

`desktop/` is a standalone Electron shell around the same API — same account, same
library, no separate backend. It loads `frontend/`'s existing HTML/CSS/JS directly
(not copied), so any web-frontend feature works in the desktop app too. See
`desktop/README.md` for how to run it and its architecture. Currently a bare shell
(no packaging/installer yet); see the project's desktop-app plan for the staged
rollout toward a distributable, auto-updating app.

## API overview

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/forgot-password`, `POST /auth/reset-password` |
| Library | `POST /citations`, `GET /citations`, `GET /citations/{id}`, `PATCH /citations/{id}`, `DELETE /citations/{id}` |
| Import | `POST /citations/import/bibtex`, `POST /citations/import/ris`, `POST /citations/import/doi` |

Auth is a bearer JWT (`Authorization: Bearer <token>`). Logout is a client-side token discard —
there is no server-side session to invalidate in this stateless design.
