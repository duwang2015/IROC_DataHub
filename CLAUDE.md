# IROC_DataHub — guide for every Claude session (and every human) working here

Read this first. It is the hand-over document between maintainers; sessions have no memory
of each other, this file is the memory.

## What this repository is

A local web app for IROC radiotherapy QA staff to manage, organise and track clinical-trial
imaging data. It is the user interface and JSON API on top of the `iroc_qa.store` package
(repository `duwang2015/IROC_QA`), which owns the on-disk data layout, the inbox ingest, the
SQLite catalog, trial logs and derived-run provenance. This app never touches the data tree
directly; it always goes through `iroc_qa.store`.

- `backend/iroc_datahub/` — FastAPI application: JSON API under `/api/...`, background jobs,
  workspace (store root) settings, and serving of the built frontend.
- `frontend/` — React 18 + TypeScript + Vite single-page app. Built output is copied to
  `backend/iroc_datahub/static/` and served by the backend.
- `docs/ARCHITECTURE.md` — how the pieces fit, API conventions, migration path to the full
  platform (`docs/PLATFORM_PLAN.md` in IROC_QA).
- `docs/MAINTENANCE.md` — the maintenance routine, the upgrade policy, release steps.

## Design principles that must not be violated

1. **The DICOM header is authoritative.** Trial and case always come from the header. The app
   never lets a user "fix" a mismatch by trusting a folder name silently; it files via the
   store's `resolve` with an explicit human decision, which is logged.
2. **The data tree is the truth; the catalog is an index.** Never write files into a store
   root except through `iroc_qa.store` APIs. Never modify anything under `original/`.
3. **API first.** Every piece of data the UI shows comes from `/api/...`. No server-rendered
   HTML with data in it. The React app is one consumer; scripts are another.
4. **Writes are logged.** Any action that changes data (ingest, resolve, discard, note, export,
   run) goes through the store, which appends to the trial log. Do not add write paths that
   bypass this.
5. **Relocatable.** No absolute paths in stored data or in code. A store root is identified
   by its `iroc_store.yaml`; the app keeps only a list of known roots in the user's settings.

## How to run

```
python -m venv .venv && .venv\Scripts\activate            (Windows)   |  source .venv/bin/activate
pip install -r requirements.lock && pip install vendor/iroc_qa-*.whl --no-deps && pip install -e . --no-deps
cd frontend && npm ci && npm run build && cd ..            # builds into backend/iroc_datahub/static
iroc-datahub serve                                         # http://localhost:8765
```
Development: `iroc-datahub serve --reload` in one terminal, `npm run dev` in `frontend/`
(the Vite dev server proxies `/api` to the backend).

## How to check your work before committing

```
ruff check backend tests && pytest -q                      # backend
cd frontend && npm run lint && npm run typecheck && npm run build
```
CI runs exactly these. A PR that does not pass CI is not merged.

## Versions and upgrades: the policy

- Python and Node dependencies are **pinned** (`requirements.lock`, `frontend/package-lock.json`,
  `.nvmrc`, `.python-version`). Install with `pip install -r requirements.lock` and `npm ci`.
- **Do not upgrade dependencies on your own initiative.** If it runs, it stays. Upgrades happen
  only when a human asks for them, in their own PR, with the reason in the PR description.
  The monthly maintenance routine reports advisories; it does not apply them.
- The `iroc-qa` dependency (the data store) ships as a wheel in `vendor/`, built from the
  commit recorded in `vendor/iroc_qa.commit` (IROC_QA is a private repository, so CI and
  fresh PCs cannot pip-install it from GitHub). Bumping it is a deliberate change: rebuild the
  wheel (`docs/MAINTENANCE.md`), update the commit file and the hash in `pyproject.toml`, run
  the test suites of both repositories.

## Conventions

- Python: `from __future__ import annotations`, type hints, `logging.getLogger(__name__)`,
  ruff line length 100, pytest. Follow the style of `iroc_qa.store`.
- TypeScript: strict mode, function components, hooks, no class components. Data fetching
  through `src/api/client.ts` only. Keep dependencies minimal; prefer writing 30 lines over
  adding a package.
- Commits: imperative subject line, body says why. One topic per PR.
- Do not commit anything from a real store root (patient data, catalogs, logs, overview pages).

## When you are unsure

Prefer asking the human over guessing on anything that changes how data is filed or named.
Changing the on-disk layout is a change to `iroc_qa.store`, not to this repository.
