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

## API overview

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Library | `POST /citations`, `GET /citations`, `GET /citations/{id}`, `PATCH /citations/{id}`, `DELETE /citations/{id}` |
| Import | `POST /citations/import/bibtex`, `POST /citations/import/ris`, `POST /citations/import/doi` |

Auth is a bearer JWT (`Authorization: Bearer <token>`). Logout is a client-side token discard —
there is no server-side session to invalidate in this stateless design.
