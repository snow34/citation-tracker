# Handoff: Citation Tracker

For an agent picking up this project cold. Setup/testing/API details already live in
`README.md` — this doc covers decisions, gotchas, and status that aren't obvious from
the code alone. Don't duplicate `README.md`; read it first, then this.

## Status

Phase 1 is built, tested, and **deployed and verified live**:
- Repo: https://github.com/snow34/citation-tracker (branch `main`)
- Live: https://citation-tracker-j9do.onrender.com — `/health` returns ok, `/docs` (Swagger)
  renders, `/auth/register` confirmed working against the live deploy
- What Phase 1 covers: auth (register/login/logout/me), manual citation CRUD, BibTeX/RIS
  file import, DOI import via Crossref, library search/filter/sort/pagination

## Deliberately out of scope — don't build unless asked

- **Scopus API integration** — was the original spec's plan; deferred indefinitely in
  favor of BibTeX/RIS/DOI import, which needs no API key
- **Tags/collections endpoints** — the DB tables exist (see below) but have zero API
  surface on purpose
- **BibTeX/RIS export** (only import exists)
- **Quota/rate-limit hardening**

## Key architectural decisions (and why — so you don't "fix" them)

- **Stateless JWT (bearer token), not session cookies** — the API is meant to be
  consumed by any future frontend, not just a same-origin one; avoids CORS/CSRF
  cookie complexity. Consequence: `POST /auth/logout` is a client-side token discard
  only, there is no server-side revocation. A denylist table is the natural fix if
  real revocation is ever needed — not built, since nothing needed it yet.
- **Argon2id, not bcrypt**, for password hashing (`app/core/security.py`) — current
  OWASP recommendation; avoids bcrypt's 72-byte silent-truncation footgun.
- **UUID primary keys** everywhere — this is a public REST API; sequential IDs would
  leak record counts.
- **Citation cache + per-user library split**: `citations` is a shared metadata cache
  (so ten users citing the same DOI don't each trigger a fresh fetch); `user_citations`
  is the per-user library join carrying notes/read-status. Dedup on the cache is
  enforced by a **partial unique index on `lower(doi)` where `doi IS NOT NULL`**
  (`alembic/versions/0001_initial_schema.py`) — this is a real DB constraint, not just
  app-level checking, so it holds under concurrent writes.
- **`tags`, `user_citation_tags`, `collections`, `collection_citations` tables exist**
  in migration `0001` but have no router/service/schema built on top. This was
  deliberate — creating them now avoids a later migration having to retrofit foreign
  keys onto live `user_citations` rows once tags/collections are actually built.

## Known limitations / rough edges

- `CROSSREF_MAILTO` (in `render.yaml` and `.env.example`) is a **placeholder**
  (`you@example.com`), not a secret — just needs to be edited to a real contact address
  in the Render dashboard for Crossref's "polite pool" etiquette. Low priority, works
  fine as-is, just less favorably rate-limited.
- `PATCH /citations/{id}` allows editing shared citation metadata (title, authors, etc.),
  which mutates the shared `citations` cache row — visible to any other user who
  happens to have the same citation in their library. Accepted at current scale, flagged
  as tech debt in `app/services/citation_service.py`.
- No token revocation (see JWT decision above).

## Deployment gotcha already hit — don't reintroduce it

Render's Docker-runtime services **reject a Blueprint-level `startCommand`**
(error: `services[0]: docker runtime must not have startCommand`). The fix already
applied: the migrate-then-serve command lives in the **Dockerfile's `CMD`** (shell
form, so `$PORT` expands — exec-array form wouldn't expand it), and `render.yaml` has
no `startCommand` key. If you touch either file, keep the command in the Dockerfile.

## Local dev environment note

This was built/tested in a sandbox where Docker had no running daemon, so Postgres was
run directly (`apt install postgresql-16` + `pg_ctlcluster 16 main start`) instead of
via `docker-compose.yml`. `docker-compose.yml` is still the intended path and should
work fine in a normal dev environment — the direct-Postgres approach is just a fallback
worth knowing about if you hit the same constraint.

## Secrets

No real secrets exist in this repo or in any prior session — `.env` is gitignored,
and `render.yaml`'s `JWT_SECRET_KEY` uses Render's `generateValue: true` (Render mints
it server-side; no session has ever seen the actual value). If you continue work here:
never commit `.env`, never hardcode a real `CROSSREF_MAILTO` into source, and any real
JWT secret belongs in Render's dashboard only, never in git.

## Suggested skills for the next session

- `code-review` — before merging further feature work, especially anything touching
  auth or the DOI-dedup logic
- `security-review` — worth running once scope grows past Phase 1 (tags/collections,
  export add more write paths)
- `design` — if/when a frontend gets built, for mocking it up before writing code
